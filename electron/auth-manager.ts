import { session, BrowserWindow } from 'electron';
import path from 'node:path';

// Глобальное состояние
let currentAuthToken: string | null = null;
let scSession: Electron.Session | null = null;
let apiWindow: BrowserWindow | null = null;

export function initAuthManager(apiWin: BrowserWindow): Electron.Session {
  apiWindow = apiWin;
  scSession = session.fromPartition('persist:soundcloud');
  return scSession;
}

export function getAuthSession(): Electron.Session {
  if (!scSession) scSession = session.fromPartition('persist:soundcloud');
  return scSession;
}

export function setApiWindow(win: BrowserWindow): void {
  apiWindow = win;
}

export function getCurrentAuthToken(): string | null {
  return currentAuthToken;
}

export function setCurrentAuthToken(token: string | null): void {
  currentAuthToken = token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth window — persist сессия, DataDome накапливает историю между запусками
// ─────────────────────────────────────────────────────────────────────────────

let authWindow: BrowserWindow | null = null;

export async function openAuthWindow(forceOpen: boolean): Promise<string | null> {
  // Если окно уже открыто — просто фокусируем
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    return null;
  }

  // persist:soundcloud-auth — сессия сохраняется между запусками.
  // DataDome видит «знакомый» клиент и не блокирует.
  // НЕ чистим clearStorageData — это убивало бы datadome cookie каждый раз.
  const authSession = session.fromPartition('persist:soundcloud-auth');

  // Актуальная версия Chromium без упоминания Electron
  const chromeVersion = process.versions.chrome || '136.0.0.0';
  const chromeMain = chromeVersion.split('.')[0];
  const ua = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;

  await authSession.setUserAgent(ua);

  // Перехватываем заголовки: убираем Electron-специфичные, выставляем правильный Chrome
  const filter = { urls: ['*://*.soundcloud.com/*', '*://*.sndcdn.com/*', '*://*.captcha-delivery.com/*', '*://*.datadome.co/*'] };
  authSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const h = details.requestHeaders;

    // Удаляем заголовки которые выдают Electron
    delete h['X-Requested-With'];
    delete h['x-requested-with'];

    // Правильный порядок brand в sec-ch-ua: Google Chrome первый
    h['User-Agent'] = ua;
    h['sec-ch-ua'] = `"Google Chrome";v="${chromeMain}", "Chromium";v="${chromeMain}", "Not A Brand";v="24"`;
    h['sec-ch-ua-mobile'] = '?0';
    h['sec-ch-ua-platform'] = '"Windows"';

    callback({ requestHeaders: h });
  });

  authWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: authSession,
      webSecurity: true,
      offscreen: false,
      transparent: false,
      preload: path.join(__dirname, 'auth-preload.js'),
    },
  });

  authWindow.once('ready-to-show', () => authWindow?.show());
  authWindow.on('closed', () => { authWindow = null; });
  authWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[AuthWindow] Load error:', code, desc);
  });

  authWindow.loadURL('https://soundcloud.com');

  return new Promise((resolve) => {
    let checkCount = 0;

    const checkForToken = setInterval(async () => {
      if (!authWindow || authWindow.isDestroyed()) {
        clearInterval(checkForToken);
        resolve(null);
        return;
      }

      try {
        const cookies = await authSession.cookies.get({ url: 'https://soundcloud.com' });
        const oauthCookie = cookies.find(c => c.name === 'oauth_token');

        if (!oauthCookie?.value) return;

        // forceOpen: игнорируем существующий токен первые 5 секунд,
        // давая пользователю шанс переключить аккаунт
        if (forceOpen && checkCount < 5) {
          checkCount++;
          return;
        }

        clearInterval(checkForToken);

        // Ждём пока SoundCloud завершит запись всех cookies сессии
        await new Promise(r => setTimeout(r, 2000));

        // Переносим ВЕСЬ набор cookies из auth-сессии в основную сессию.
        // Это критично — datadome, sc_anonymous_id, _soundcloud_session и т.д.
        // нужны для запросов через apiWindow.
        await transferAllCookies(authSession, scSession!);

        // Перезагружаем apiWindow чтобы он подхватил новые cookies
        if (apiWindow && !apiWindow.isDestroyed()) {
          await apiWindow.loadURL('https://soundcloud.com');
        }

        currentAuthToken = oauthCookie.value;

        // Закрываем окно авторизации — пользователь успешно вошёл
        if (authWindow && !authWindow.isDestroyed()) {
          authWindow.close();
        }

        resolve(oauthCookie.value);
      } catch (err) {
        console.error('[AuthWindow] Cookie check error:', err);
      }
    }, 1000);

    // Таймаут 10 минут
    setTimeout(() => {
      clearInterval(checkForToken);
      if (authWindow && !authWindow.isDestroyed()) authWindow.close();
      resolve(null);
    }, 10 * 60 * 1000);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Перенос cookies между сессиями
// ─────────────────────────────────────────────────────────────────────────────

async function transferAllCookies(
  from: Electron.Session,
  to: Electron.Session
): Promise<void> {
  // Берём все cookies soundcloud.com и sndcdn.com
  const domains = ['https://soundcloud.com', 'https://sndcdn.com'];
  let allCookies: Electron.Cookie[] = [];

  for (const url of domains) {
    const cookies = await from.cookies.get({ url });
    allCookies = allCookies.concat(cookies);
  }

  console.log(`[AuthManager] Transferring ${allCookies.length} cookies to main session`);

  for (const cookie of allCookies) {
    try {
      const domain = cookie.domain || '.soundcloud.com';
      const cookieUrl = `https://${domain.startsWith('.') ? domain.slice(1) : domain}`;

      await to.cookies.set({
        url: cookieUrl,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        secure: cookie.secure ?? true,
        httpOnly: cookie.httpOnly ?? false,
        expirationDate: cookie.expirationDate,
        sameSite: cookie.sameSite as any,
      });
    } catch (err) {
      // Некоторые системные cookies нельзя установить вручную — это нормально
      console.warn(`[AuthManager] Could not transfer cookie "${cookie.name}":`, (err as Error).message);
    }
  }

  await to.flushStorageData();
  console.log('[AuthManager] Cookie transfer complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// Ручная вставка cookies (JSON или "name=value; ...")
// ─────────────────────────────────────────────────────────────────────────────

function parseCookieString(raw: string): Array<{
  name: string; value: string; domain: string;
  path: string; secure: boolean; httpOnly: boolean; expirationDate?: number;
}> {
  if (raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain || '.soundcloud.com',
          path: c.path || '/',
          secure: c.secure ?? true,
          httpOnly: c.httpOnly ?? false,
          expirationDate: c.expirationDate,
        }));
      }
    } catch (e) {
      console.error('[AuthManager] JSON cookie parse failed:', e);
    }
  }

  return raw.split(';').flatMap(part => {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) return [];
    const name = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    if (!name) return [];
    return [{ name, value, domain: '.soundcloud.com', path: '/', secure: true, httpOnly: false }];
  });
}

export async function injectManualCookies(raw: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!scSession) scSession = session.fromPartition('persist:soundcloud');

    // Очищаем только soundcloud cookies, не трогаем остальное
    const existing = await scSession.cookies.get({});
    for (const c of existing) {
      if (c.domain?.includes('soundcloud.com')) {
        const url = `https://${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}`;
        await scSession.cookies.remove(url, c.name);
      }
    }

    const parsed = parseCookieString(raw);
    for (const c of parsed) {
      if (!c.domain.includes('soundcloud.com')) continue;
      const url = `https://${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}`;
      await scSession.cookies.set({
        url, name: c.name, value: c.value,
        path: c.path, secure: c.secure,
        httpOnly: c.httpOnly, expirationDate: c.expirationDate,
      });
    }

    await scSession.flushStorageData();

    if (apiWindow && !apiWindow.isDestroyed()) {
      await apiWindow.loadURL('https://soundcloud.com');
    }

    const newCookies = await scSession.cookies.get({ url: 'https://soundcloud.com' });
    const oauthCookie = newCookies.find(c => c.name === 'oauth_token');
    if (oauthCookie?.value) currentAuthToken = oauthCookie.value;

    return { success: true };
  } catch (err) {
    console.error('[AuthManager] injectManualCookies failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Прочие утилиты
// ─────────────────────────────────────────────────────────────────────────────

export async function clearCookies(): Promise<boolean> {
  try {
    if (!scSession) scSession = session.fromPartition('persist:soundcloud');

    const cookies = await scSession.cookies.get({});
    for (const c of cookies) {
      if (c.domain?.includes('soundcloud.com')) {
        const url = `https://${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}`;
        await scSession.cookies.remove(url, c.name);
      }
    }

    currentAuthToken = null;
    await scSession.flushStorageData();
    return true;
  } catch (err) {
    console.error('[AuthManager] clearCookies failed:', err);
    return false;
  }
}

export async function handleAuthError(errorCode: number): Promise<boolean> {
  if (errorCode !== 0 && errorCode !== 502) return false;
  if (!scSession) scSession = session.fromPartition('persist:soundcloud');

  const cookies = await scSession.cookies.get({ url: 'https://soundcloud.com' });
  if (!cookies.find(c => c.name === 'oauth_token')) return false;

  if (apiWindow && !apiWindow.isDestroyed()) {
    try {
      await apiWindow.loadURL('https://soundcloud.com');
      await new Promise(r => setTimeout(r, 2000));

      const updated = await scSession.cookies.get({ url: 'https://soundcloud.com' });
      const token = updated.find(c => c.name === 'oauth_token');
      if (token && token.value !== currentAuthToken) {
        currentAuthToken = token.value;
        return true;
      }
    } catch (err) {
      console.error('[AuthManager] handleAuthError refresh failed:', err);
    }
  }
  return false;
}

export async function getCookies(): Promise<Electron.Cookie[]> {
  if (!scSession) scSession = session.fromPartition('persist:soundcloud');
  return scSession.cookies.get({ url: 'https://soundcloud.com' });
}
