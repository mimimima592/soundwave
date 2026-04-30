import { app, BrowserWindow, ipcMain, shell, net, session, Tray, Menu, nativeImage } from 'electron';
// electron-updater загружается динамически только в prod (требует npm install)
import path from 'node:path';
import axios from 'axios';
import { DiscordRPCManager } from './discord-rpc';
import { SettingsStore } from './settings-store';
import { ClientIdExtractor } from './client-id-extractor';
import {
  startWidgetServer,
  stopWidgetServer,
  updateWidgetData,
  WIDGET_PORT,
} from './widget-server';
import {
  initAuthManager,
  getAuthSession,
  setApiWindow,
  injectManualCookies,
  clearCookies as authClearCookies,
  handleAuthError,
} from './auth-manager';

const isDev = process.env.NODE_ENV === 'development';

// Отключаем детекцию webdriver
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

let mainWindow: BrowserWindow | null = null;
let apiWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let detectedProxyPort: number | null = null;
const rpc = new DiscordRPCManager();
const settings = new SettingsStore();
const clientIdExtractor = new ClientIdExtractor();

// Автодетект порта Clash
async function detectClashPort(): Promise<number> {
  const commonPorts = [7890, 7891, 7897, 1080, 10808];
  for (const port of commonPorts) {
    try {
      const response = await axios.get('https://www.google.com', {
        proxy: { host: '127.0.0.1', port, protocol: 'http' },
        timeout: 2000,
      });
      if (response.status === 200) {
        return port;
      }
    } catch (err) {
      // Порт не работает, пробуем следующий
    }
  }
  return 0; // 0 означает что будем использовать системный прокси
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    icon: path.join(__dirname, '../build/icon.ico'),
    // Frameless окно для кастомного оформления
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Горячая клавиша для DevTools (Ctrl+Shift+I или F12)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
      if (!mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow?.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Открывать внешние ссылки в системном браузере
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('maximize', () =>
    mainWindow?.webContents.send('window:maximized', true)
  );
  mainWindow.on('unmaximize', () =>
    mainWindow?.webContents.send('window:maximized', false)
  );

  // При нажатии X — скрываем в трей, не закрываем
  mainWindow.on('close', (e) => {
    if (!(app as any).__quitting) {
      e.preventDefault();
      mainWindow?.hide();
    } else {
      // Уведомляем renderer процесс перед закрытием для очистки Listen Party
      mainWindow?.webContents.send('app:before-quit');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (apiWindow && !apiWindow.isDestroyed()) { apiWindow.destroy(); apiWindow = null; }
    if (authWindow && !authWindow.isDestroyed()) { authWindow.destroy(); authWindow = null; }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.destroy();
    }
    rpc.disconnect();
    process.exit(0);
  });
}

app.on('ready', async () => {
  // ── Трей ──────────────────────────────────────────────────────────────────
  const iconPath = path.join(__dirname, '../build/icon.ico');
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('Soundwave');

  const buildTrayMenu = () => Menu.buildFromTemplate([
    {
      label: 'Открыть Soundwave',
      click: () => { mainWindow?.show(); mainWindow?.focus(); },
    },
    { type: 'separator' },
    {
      label: 'Выйти',
      click: () => {
        (app as any).__quitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  // ── Автообновление ────────────────────────────────────────────────────────
  if (!isDev) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { autoUpdater } = require('electron-updater');

      // Отключаем автоскачивание — качаем только явно, чтобы не было двойного download
      autoUpdater.autoDownload = false;

      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'mimimima592',
        repo: 'soundwave'
      });

      // Флаг предотвращает запуск параллельных скачиваний (периодические проверки)
      let isDownloading = false;

      // Слушатели навешиваем один раз при старте
      autoUpdater.on('update-available', (info: any) => {
        console.log('[AutoUpdater] Update available:', info.version);
        mainWindow?.webContents.send('updater:update-available', info.version);
        if (isDownloading) {
          console.log('[AutoUpdater] Already downloading, skipping duplicate download.');
          return;
        }
        // Начинаем скачивать сразу как нашли обновление
        isDownloading = true;
        autoUpdater.downloadUpdate().catch((err: any) => {
          console.error('[AutoUpdater] Download error:', err.message);
          isDownloading = false;
        });
      });
      autoUpdater.on('update-downloaded', (info: any) => {
        console.log('[AutoUpdater] Update downloaded:', info.version);
        isDownloading = false;
        mainWindow?.webContents.send('updater:update-downloaded', info.version);
      });
      autoUpdater.on('update-not-available', (info: any) => {
        console.log('[AutoUpdater] No updates available, current version:', info.version);
      });
      autoUpdater.on('error', (err: any) => {
        console.error('[AutoUpdater] error:', err.message);
        isDownloading = false;
      });

      console.log('[AutoUpdater] Checking for updates...');
      autoUpdater.checkForUpdates();

      // Периодическая проверка каждые 30 минут
      setInterval(() => {
        if (isDownloading) {
          console.log('[AutoUpdater] Periodic check skipped — download in progress.');
          return;
        }
        console.log('[AutoUpdater] Periodic check...');
        autoUpdater.checkForUpdates();
      }, 30 * 60 * 1000);

    } catch {
      console.warn('[AutoUpdater] electron-updater not installed, skipping.');
    }
  }

  // IPC handler для ручной проверки обновлений (кнопка в настройках)
  ipcMain.removeHandler('updater:checkForUpdates');
  ipcMain.handle('updater:checkForUpdates', async () => {
    if (isDev) {
      console.log('[AutoUpdater] Manual check skipped in dev mode.');
      return null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { autoUpdater } = require('electron-updater');
      autoUpdater.autoDownload = false;
      console.log('[AutoUpdater] Manual check triggered');
      // checkForUpdates() запустит событие update-available, которое само запустит downloadUpdate()
      const result = await autoUpdater.checkForUpdates();
      console.log('[AutoUpdater] Check result:', result);
      return result;
    } catch (err) {
      console.error('[AutoUpdater] Manual check error:', err);
      return null;
    }
  });

  // IPC handler для установки обновления
  ipcMain.removeHandler('updater:install');
  ipcMain.handle('updater:install', () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { autoUpdater } = require('electron-updater');
      console.log('[AutoUpdater] Installing update...');
      autoUpdater.quitAndInstall();
    } catch (err) {
      console.error('[AutoUpdater] Install error:', err);
    }
  });

  // Автодетект порта Clash
  detectedProxyPort = await detectClashPort();

  // Сначала создаем общую сессию с partition
  const scSession = session.fromPartition('persist:soundcloud');

  // Создаем скрытое окно для API запросов с общей сессией
  apiWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      session: scSession, // Используем общую сессию с partition
      webSecurity: false, // Отключаем webSecurity для избежания CORS (Error 0)
      allowRunningInsecureContent: true,
    },
  });

  // Перехватываем console.log из Hidden BrowserView для вывода в терминал
  apiWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (message.includes('play-history') || message.includes('Playlist Like') || message.includes('Playlist Unlike') || message.includes('playlist_like')) {
      console.log('[Hidden BrowserView]', message);
    }
  });

  // Инициализируем менеджер авторизации с apiWindow и существующей сессией
  const authSession = initAuthManager(apiWindow);
  setApiWindow(apiWindow);

  // Перехватываем PlayHistory логи из apiWindow
  apiWindow.webContents.on('console-message', (_e, _level, message) => {
    if (message.includes('[PlayHistory]')) console.log(message);
  });

  // Настраиваем прокси если есть переменная окружения или системный прокси
  const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
  if (proxyServer) {
    await authSession.setProxy({
      proxyRules: proxyServer,
      proxyBypassRules: 'localhost,127.0.0.1',
    });
  } else {
    // Используем системный прокси
    await authSession.setProxy({
      mode: 'system',
    });
  }

  // Устанавливаем User-Agent как в реальном Chrome (для избежания Error 502)
  await authSession.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  // Загружаем SoundCloud один раз для инициализации контекста безопасности
  await apiWindow.loadURL('https://soundcloud.com');

  // Слушатель изменений кук для автоматического обнаружения oauth_token
  authSession.cookies.on('changed', async (event, cookie, cause, removed) => {
    if (!removed && cookie.name === 'oauth_token' && cookie.domain && cookie.domain.includes('soundcloud.com')) {
      // Сохраняем токен в process.env как глобальную переменную
      (process.env as any).SC_AUTH_TOKEN = cookie.value;
      // Отправляем событие в renderer процесс для сохранения токена
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auth:tokenDetected', cookie.value);
      }
    }
  });

  // Инициализируем Discord RPC при старте (не блокируем, если Discord не запущен)
  rpc.connect().catch((err) => {
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  rpc.disconnect();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  (app as any).__quitting = true;
  // Уничтожаем все окна и принудительно завершаем процесс —
  // без этого скрытые BrowserWindow висят в диспетчере задач
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.destroy();
  }
  if (apiWindow && !apiWindow.isDestroyed()) {
    apiWindow.destroy();
    apiWindow = null;
  }
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.destroy();
    authWindow = null;
  }
});

app.on('quit', () => {
  // Гарантируем завершение всех дочерних процессов Electron
  process.exit(0);
});

// =============================================================================
// IPC Handlers
// =============================================================================

// Управление окном (для custom titlebar)
ipcMain.on('log', (_e, ...args) => console.log('[Renderer]', ...args));

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

// Настройки (persistent storage)
ipcMain.handle('settings:get', (_e, key: string) => settings.get(key));
ipcMain.handle('settings:set', (_e, key: string, value: unknown) => settings.set(key, value));
ipcMain.handle('settings:getAll', () => settings.getAll());

// Discord RPC
ipcMain.handle(
  'rpc:update',
  (
    _e,
    data: {
      title: string;
      artist: string;
      artwork?: string;
      duration?: number;
      startedAt?: number;
      trackUrl?: string;
      isPlaying: boolean;
    }
  ) => {
    return rpc.updatePresence(data);
  }
);
ipcMain.handle('rpc:clear', () => rpc.clearPresence());
ipcMain.handle('rpc:setEnabled', async (_e, enabled: boolean) => {
  settings.set('discordRpcEnabled', enabled);
  if (enabled) rpc.connect().catch(() => {});
  else await rpc.disconnect();
});

// =============================================================================
// SoundCloud OAuth авторизация
//=============================================================================

let authWindow: BrowserWindow | null = null;

// Очистка куков SoundCloud через auth manager
ipcMain.handle('auth:clearCookies', async () => {
  return await authClearCookies();
});

// Импорт кук через auth manager
ipcMain.handle('auth:importCookies', async (_e, cookiesJson: string) => {
  return await injectManualCookies(cookiesJson);
});

// Выполнение аутентифицированного запроса через скрытое окно
// Load initial feed - called when entering the tab
ipcMain.handle('feed:loadInitial', async (_e, userId: number, limit: number = 54) => {
  if (!apiWindow || apiWindow.isDestroyed()) {
    console.error('[Feed: Load Initial] API window not available');
    return { ok: false, status: 0, statusText: 'API window not available', body: '', error: 'API window not available' };
  }

  try {
    // Build URL with exact parameters in exact order
    const url = new URL('https://api-v2.soundcloud.com/stream');
    url.searchParams.set('device_locale', 'en');
    url.searchParams.set('consent_string', 'BO6l2pQO4l+2h9a8s7d6f5g4h3j2k1l0m9n8o7p6q5r4s3t2u1v0w9x8y7z6');
    url.searchParams.set('tcf_version', '2');
    url.searchParams.set('user_urn', `soundcloud:users:${userId}`);
    url.searchParams.set('promoted_playlist', 'true');
    url.searchParams.set('activityTypes', 'TrackPost,TrackRepost,PlaylistPost');
    url.searchParams.set('client_id', 'RF8yvumNwWwVg0aX4r7fHqzIVAtO6nSI');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', '0');
    url.searchParams.set('linked_partitioning', '1');
    url.searchParams.set('app_version', '1776882728');
    url.searchParams.set('app_locale', 'en');

    const fetchCode = `
      (async function loadInitialFeed() {
        try {
          const token = window.localStorage.getItem('oauth_token') || 
                        document.cookie.match(/oauth_token=([^;]+)/)?.[1] || 
                          '';
          
          if (!token) {
            return { ok: false, status: 401, statusText: 'No token found', body: '', error: 'No token found' };
          }

          const urlStr = '${url.toString()}';

          // Stage 1: OPTIONS
          const preflightOptions = {
            method: 'OPTIONS',
            headers: {
              'accept': '*/*',
              'access-control-request-headers': 'authorization',
              'access-control-request-method': 'GET',
              'origin': 'https://soundcloud.com',
              'referer': 'https://soundcloud.com/',
              'sec-fetch-mode': 'cors',
              'sec-fetch-site': 'same-site'
            },
            credentials: 'omit'
          };

          const preflightResponse = await fetch(urlStr, preflightOptions);

          // Stage 2: GET
          const getOptions = {
            method: 'GET',
            headers: {
              'authorization': 'OAuth ' + token,
              'accept': 'application/json, text/javascript, */*; q=0.01',
              'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"Windows"',
              'origin': 'https://soundcloud.com',
              'referer': 'https://soundcloud.com/',
              'sec-fetch-mode': 'cors',
              'sec-fetch-site': 'same-site'
            },
            credentials: 'include'
          };

          const response = await fetch(urlStr, getOptions);
          const text = await response.text();

          if (!response.ok) {
            console.error('[Feed: Load Initial] Error body:', text);
          }

          return { ok: response.ok, status: response.status, statusText: response.statusText, body: text };
        } catch (err) {
          console.error('[Feed: Load Initial] Exception:', err.message);
          return { ok: false, status: 0, statusText: err.message, body: '', error: err.message };
        }
      })()
    `;

    const result = await apiWindow.webContents.executeJavaScript(fetchCode);
    return result;
  } catch (err) {
    console.error('[Feed: Load Initial] Error:', err);
    return { ok: false, status: 0, statusText: (err as Error).message, body: '', error: (err as Error).message };
  }
});

// Hide reposts - 3-stage request
ipcMain.handle('feed:hideReposts', async (_e, userId: number, limit: number = 54) => {
  if (!apiWindow || apiWindow.isDestroyed()) {
    console.error('[Feed: Hide Reposts] API window not available');
    return { ok: false, status: 0, statusText: 'API window not available', body: '', error: 'API window not available' };
  }

  try {
    // Build URL for stages 1-2
    const url1 = new URL('https://api-v2.soundcloud.com/stream');
    url1.searchParams.set('device_locale', 'en');
    url1.searchParams.set('consent_string', 'BO6l2pQO4l+2h9a8s7d6f5g4h3j2k1l0m9n8o7p6q5r4s3t2u1v0w9x8y7z6');
    url1.searchParams.set('tcf_version', '2');
    url1.searchParams.set('user_urn', `soundcloud:users:${userId}`);
    url1.searchParams.set('promoted_playlist', 'true');
    url1.searchParams.set('activityTypes', 'TrackPost,PlaylistPost');
    url1.searchParams.set('client_id', 'RF8yvumNwWwVg0aX4r7fHqzIVAtO6nSI');
    url1.searchParams.set('limit', String(limit));
    url1.searchParams.set('offset', '0');
    url1.searchParams.set('linked_partitioning', '1');
    url1.searchParams.set('app_version', '1776882728');
    url1.searchParams.set('app_locale', 'en');

    // Build URL for stage 3 (pagination)
    const url2 = new URL('https://api-v2.soundcloud.com/stream');
    url2.searchParams.set('activityTypes', 'TrackPost,PlaylistPost');
    url2.searchParams.set('offset', String(limit));
    url2.searchParams.set('limit', String(limit));
    url2.searchParams.set('promoted_playlist', 'true');
    url2.searchParams.set('client_id', 'RF8yvumNwWwVg0aX4r7fHqzIVAtO6nSI');
    url2.searchParams.set('app_version', '1776882728');
    url2.searchParams.set('app_locale', 'en');

    const fetchCode = `
      (async function hideReposts() {
        try {
          const token = window.localStorage.getItem('oauth_token') || 
                        document.cookie.match(/oauth_token=([^;]+)/)?.[1] || 
                          '';
          
          if (!token) {
            return { ok: false, status: 401, statusText: 'No token found', body: '', error: 'No token found' };
          }

          const urlStr1 = '${url1.toString()}';
          const urlStr2 = '${url2.toString()}';

          // Stage 1: OPTIONS
          const preflightOptions = {
            method: 'OPTIONS',
            headers: {
              'accept': '*/*',
              'access-control-request-headers': 'authorization',
              'access-control-request-method': 'GET',
              'origin': 'https://soundcloud.com',
              'referer': 'https://soundcloud.com/',
              'sec-fetch-mode': 'cors',
              'sec-fetch-site': 'same-site'
            },
            credentials: 'omit'
          };
          const preflightResponse = await fetch(urlStr1, preflightOptions);

          // Stage 2: GET main
          const getOptions = {
            method: 'GET',
            headers: {
              'authorization': 'OAuth ' + token,
              'accept': 'application/json, text/javascript, */*; q=0.01',
              'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"Windows"',
              'origin': 'https://soundcloud.com',
              'referer': 'https://soundcloud.com/',
              'sec-fetch-mode': 'cors',
              'sec-fetch-site': 'same-site'
            },
            credentials: 'include'
          };
          const response1 = await fetch(urlStr1, getOptions);
          const text1 = await response1.text();

          if (!response1.ok) {
            console.error('[Feed: Hide Reposts] Stage 2 Error body:', text1);
          }

          // Stage 3: GET pagination
          const response2 = await fetch(urlStr2, getOptions);
          const text2 = await response2.text();

          if (!response2.ok) {
            console.error('[Feed: Hide Reposts] Stage 3 Error body:', text2);
          }

          // Return main response
          return { ok: response1.ok, status: response1.status, statusText: response1.statusText, body: text1 };
        } catch (err) {
          console.error('[Feed: Hide Reposts] Exception:', err.message);
          return { ok: false, status: 0, statusText: err.message, body: '', error: err.message };
        }
      })()
    `;

    const result = await apiWindow.webContents.executeJavaScript(fetchCode);
    return result;
  } catch (err) {
    console.error('[Feed: Hide Reposts] Error:', err);
    return { ok: false, status: 0, statusText: (err as Error).message, body: '', error: (err as Error).message };
  }
});

// Unified SoundCloud API handler with automatic token extraction (keep for other endpoints)
ipcMain.handle('soundcloud-request', async (_e, url: string, method: string = 'GET', params: Record<string, string | number> = {}) => {
  if (!apiWindow || apiWindow.isDestroyed()) {
    console.error('[SoundCloud Request] API window not available');
    return { ok: false, status: 0, statusText: 'API window not available', body: '', error: 'API window not available' };
  }

  try {
    // Build URL with params using URLSearchParams for proper escaping
    const urlObj = new URL(url);
    const searchParams = urlObj.searchParams;
    
    for (const [k, v] of Object.entries(params)) {
      searchParams.set(k, String(v));
    }

    // Special handling for /stream endpoint with two-stage request
    if (url.includes('/stream') && method === 'GET') {
      // Add required params for stream endpoint in exact order
      searchParams.set('device_locale', 'en');
      if (!searchParams.has('consent_string')) {
        searchParams.set('consent_string', 'BO6l2pQO4l+2h9a8s7d6f5g4h3j2k1l0m9n8o7p6q5r4s3t2u1v0w9x8y7z6');
      }
      searchParams.set('tcf_version', '2');
      
      // user_urn should be extracted from session or passed in params
      if (!searchParams.has('user_urn')) {
        // Try to get user ID from auth session cookies
        const authSession = getAuthSession();
        if (authSession) {
          const cookies = await authSession.cookies.get({ url: 'https://soundcloud.com' });
          const oauthCookie = cookies.find((c: any) => c.name === 'oauth_token');
          if (oauthCookie) {
            // Extract user ID from oauth_token format: 2-XXXXXX-USER_ID-XXXX
            const tokenParts = oauthCookie.value.split('-');
            if (tokenParts.length >= 3) {
              const userId = parseInt(tokenParts[2]);
              if (!isNaN(userId)) {
                searchParams.set('user_urn', `soundcloud:users:${userId}`);
              }
            }
          }
        }
      }
      
      searchParams.set('promoted_playlist', 'true');
      // Respect activityTypes from params if provided (for hideReposts functionality)
      if (!searchParams.has('activityTypes')) {
        searchParams.set('activityTypes', 'TrackPost,TrackRepost,PlaylistPost');
      }
      // client_id from params or default (must come after activityTypes)
      if (!searchParams.has('client_id')) {
        searchParams.set('client_id', 'n7xYWWgZwkLEpK2wL6v21A');
      }
      searchParams.set('limit', '10');
      searchParams.set('offset', '0');
      searchParams.set('linked_partitioning', '1');
      searchParams.set('app_version', '1776882728');
      searchParams.set('app_locale', 'en');

      // Build fetch code with two-stage request (OPTIONS preflight + GET)
      const fetchCode = `
        (async function fetchTimeline() {
          try {
            // Extract token from localStorage or cookies
            const token = window.localStorage.getItem('oauth_token') || 
                          document.cookie.match(/oauth_token=([^;]+)/)?.[1] || 
                          '';
            
            
            if (!token) {
              console.error('[Timeline Fetch] No token found');
              return {
                ok: false,
                status: 401,
                statusText: 'No token found',
                body: '',
                error: 'No OAuth token found in localStorage or cookies'
              };
            }

            const urlStr = '${urlObj.toString()}';

            // Stage 1: OPTIONS preflight request (without authorization)
            const preflightOptions = {
              method: 'OPTIONS',
              headers: {
                'accept': '*/*',
                'access-control-request-headers': 'authorization',
                'access-control-request-method': 'GET',
                'origin': 'https://soundcloud.com',
                'referer': 'https://soundcloud.com/',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site'
              },
              credentials: 'omit'
            };


            // Stage 2: GET data fetch (with authorization)
            const authorizationHeader = 'OAuth ' + token;
            
            const getOptions = {
              method: 'GET',
              headers: {
                'authorization': authorizationHeader,
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'origin': 'https://soundcloud.com',
                'referer': 'https://soundcloud.com/',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site'
              },
              credentials: 'include'
            };

            const response = await fetch(urlStr, getOptions);
            const text = await response.text();

            if (!response.ok) {
              console.error('[Timeline Fetch] Error response:', {
                status: response.status,
                statusText: response.statusText,
                body: text
              });
            }

            return {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              body: text
            };
          } catch (err) {
            console.error('[Timeline Fetch] Exception:', err.message, err.stack);
            return {
              ok: false,
              status: 0,
              statusText: err.message || 'Unknown error',
              body: '',
              error: err.message || 'Unknown error'
            };
          }
        })()
      `;

      const result = await apiWindow.webContents.executeJavaScript(fetchCode);
      
      if (!result.ok) {
        console.error('[SoundCloud Request] Failed:', result);
      }

      return result;
    }

    // Default fetch for non-stream endpoints with proper CORS headers
    const fetchCode = `(async () => {
      try {
        const token = window.localStorage.getItem('oauth_token') || 
                      document.cookie.match(/oauth_token=([^;]+)/)?.[1] || 
                      '';
        
        
        if (!token) {
          console.error('[SoundCloud Request] No token found');
          return {
            ok: false,
            status: 401,
            statusText: 'No token found',
            body: '',
            error: 'No OAuth token found in localStorage or cookies'
          };
        }

        const urlStr = '${urlObj.toString().replace(/'/g, "\\'")}';

        // Stage 1: OPTIONS preflight (if needed for CORS)
        const preflightOptions = {
          method: 'OPTIONS',
          headers: {
            'accept': '*/*',
            'access-control-request-headers': 'authorization',
            'access-control-request-method': '${method}',
            'origin': 'https://soundcloud.com',
            'referer': 'https://soundcloud.com/',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site'
          },
          credentials: 'omit'
        };

        const preflightResponse = await fetch(urlStr, preflightOptions);

        // Stage 2: Actual request
        const options = {
          method: '${method}',
          headers: {
            'authorization': 'OAuth ' + token,
            'accept': 'application/json, text/javascript, */*; q=0.01',
            'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'origin': 'https://soundcloud.com',
            'referer': 'https://soundcloud.com/',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site'
          },
          credentials: 'include'
        };
        
        const response = await fetch(urlStr, options);
        const text = await response.text();

        if (!response.ok) {
          console.error('[SoundCloud Request] Error:', {
            status: response.status,
            statusText: response.statusText,
            body: text.substring(0, 500)
          });
        }

        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          body: text
        };
      } catch (err) {
        console.error('[SoundCloud Request] Exception:', err.message, err.stack);
        return {
          ok: false,
          status: 0,
          statusText: err.message,
          body: '',
          error: err.message
        };
      }
    })()`;

    const result = await apiWindow.webContents.executeJavaScript(fetchCode);
    
    if (!result.ok) {
      console.error('[SoundCloud Request] Failed:', result);
    }

    return result;
  } catch (err) {
    console.error('[SoundCloud Request] Error:', err);
    return { 
      ok: false, 
      status: 0, 
      statusText: (err as Error).message, 
      body: '', 
      error: (err as Error).message 
    };
  }
});

// Existing handlers (keep for backward compatibility)
ipcMain.handle('soundcloud-api', async (_e, endpoint: string, params: Record<string, string | number> = {}, method: string = 'GET', body: object | null = null) => {
  if (!apiWindow || apiWindow.isDestroyed()) {
    console.error('[SoundCloud API] API window not available');
    return { ok: false, status: 0, statusText: 'API window not available', body: '', error: 'API window not available' };
  }

  try {
    const API_BASE = 'https://api-v2.soundcloud.com';
    const url = new URL(endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`);

    // Add params to URL
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }

    // Special handling for /stream endpoint
    if (endpoint === '/stream' || endpoint.includes('/stream')) {
      // Add required params for stream endpoint
      if (!url.searchParams.has('limit')) url.searchParams.set('limit', '20');
      if (!url.searchParams.has('app_version')) url.searchParams.set('app_version', '1776882728');
      if (!url.searchParams.has('activityTypes')) url.searchParams.set('activityTypes', 'TrackPost,PlaylistPost,TrackRepost,PlaylistRepost');
      
      // user_urn should be extracted from session or passed in params
      if (!url.searchParams.has('user_urn')) {
        // Try to get user ID from auth session cookies
        const authSession = getAuthSession();
        if (authSession) {
          const cookies = await authSession.cookies.get({ url: 'https://soundcloud.com' });
          const oauthCookie = cookies.find((c: any) => c.name === 'oauth_token');
          if (oauthCookie) {
            // Extract user ID from oauth_token format: 2-XXXXXX-USER_ID-XXXX
            const tokenParts = oauthCookie.value.split('-');
            if (tokenParts.length >= 3) {
              const userId = parseInt(tokenParts[2]);
              if (!isNaN(userId)) {
                url.searchParams.set('user_urn', `soundcloud:users:${userId}`);
              }
            }
          }
        }
      }
    }

    // Prepare body string
    const bodyStr = body ? JSON.stringify(body) : 'null';

    // Build fetch code
    const fetchCode = `
      (async () => {
        try {
          const bodyObj = ${bodyStr};
          const bodyStr = JSON.stringify(bodyObj);

          const options = {
            method: '${method}',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            }${method !== 'GET' && method !== 'HEAD' ? `,
            body: bodyStr` : ''}
          };
          const response = await fetch('${url.toString()}', options);
          const text = await response.text();
          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            body: text
          };
        } catch (err) {
          return {
            ok: false,
            status: 0,
            statusText: err.message,
            body: '',
            error: err.message
          };
        }
      })()
    `;

    const result = await apiWindow.webContents.executeJavaScript(fetchCode);

    if (!result.ok) {
      console.error('[SoundCloud API] Request failed:', result);
    }

    return result;
  } catch (err) {
    console.error('[SoundCloud API] Error:', err);
    return { 
      ok: false, 
      status: 0, 
      statusText: (err as Error).message, 
      body: '', 
      error: (err as Error).message 
    };
  }
});

// Get suggested users with official SoundCloud endpoint
ipcMain.handle('auth:getRelatedArtists', async (_e, oauthToken: string) => {
  if (!apiWindow || apiWindow.isDestroyed()) {
    return { ok: false, status: 0, statusText: 'API window not available', body: '' };
  }

  try {
    const clientId = settings.get('soundCloudClientId') as string;

    if (!clientId) {
      return { ok: false, status: 0, statusText: 'No clientId', body: '' };
    }

    const url = `https://api-v2.soundcloud.com/me/suggested/users/who_to_follow?view=recommended-first&client_id=${clientId}&limit=21&offset=0&linked_partitioning=1&app_version=1777028773&app_locale=en`;
    // Передаём токен и URL как JSON-объект — без прямой интерполяции строк
    const params = JSON.stringify({ url, oauthToken });

    const fetchCode = `
      (async () => {
        try {
          const { url, oauthToken } = ${params};
          const options = {
            method: 'GET',
            headers: {
              'Authorization': 'OAuth ' + oauthToken,
              'Accept': 'application/json, text/javascript, */*; q=0.01',
              'Accept-Language': 'en-US,en;q=0.9',
              'Origin': 'https://soundcloud.com',
              'Referer': 'https://soundcloud.com/',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
            }
          };
          const response = await fetch(url, options);
          const text = await response.text();
          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            body: text
          };
        } catch (err) {
          return { ok: false, status: 0, statusText: err.message, body: '' };
        }
      })()
    `;

    return await apiWindow.webContents.executeJavaScript(fetchCode);
  } catch (err) {
    return { ok: false, status: 0, statusText: (err as Error).message, body: '' };
  }
});

ipcMain.handle('play-history:record', async (_e, trackUrn: string, clientId: string, appVersion: string) => {
  if (!apiWindow || apiWindow.isDestroyed()) return;
  const params = JSON.stringify({ trackUrn, clientId, appVersion });
  const code = `
    (async () => {
      try {
        const { trackUrn, clientId, appVersion } = ${params};
        const token = document.cookie.match(/oauth_token=([^;]+)/)?.[1]
                   || window.localStorage.getItem('oauth_token') || '';
        if (!token) return;
        const res = await fetch(
          'https://api-v2.soundcloud.com/me/play-history?client_id=' + clientId + '&app_version=' + appVersion + '&app_locale=en',
          { method: 'POST', headers: { 'Authorization': 'OAuth ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ track_urn: trackUrn }) }
        );
        console.log('[PlayHistory] status:', res.status);
      } catch(e) { console.log('[PlayHistory] error:', e.message); }
    })()
  `;
  try { await apiWindow.webContents.executeJavaScript(code); } catch(e) { console.error('[PlayHistory] failed:', e); }
});

ipcMain.handle('auth:getUserId', async () => {
  if (!apiWindow || apiWindow.isDestroyed()) {
    return null;
  }

  try {
    const fetchCode = `
      (async () => {
        try {
          // Try to extract user ID from oauth_token (format: 2-XXXXXX-USER_ID-XXXX)
          const oauthToken = window.localStorage.getItem('oauth_token') || 
                            document.cookie.match(/oauth_token=([^;]+)/)?.[1];
          
          if (oauthToken) {
            // OAuth token format: 2-XXXXXX-USER_ID-XXXX
            const tokenParts = oauthToken.split('-');
            if (tokenParts.length >= 3) {
              const userId = parseInt(tokenParts[2]);
              if (!isNaN(userId)) {
                return userId;
              }
            }
          }

          // Try sc_tracking_user_id as fallback (format: soundcloud:users:USER_ID)
          const trackingId = window.localStorage.getItem('sc_tracking_user_id');
          if (trackingId) {
            // Parse format: soundcloud:users:USER_ID
            const parts = trackingId.split(':');
            if (parts.length >= 3 && parts[0] === 'soundcloud' && parts[1] === 'users') {
              const userId = parseInt(parts[2]);
              if (!isNaN(userId)) {
                return userId;
              }
            }
            
            // Try as direct number
            const id = parseInt(trackingId);
            if (!isNaN(id)) {
              return id;
            }
          }

          return null;
        } catch (err) {
          return null;
        }
      })()
    `;

    const result = await apiWindow.webContents.executeJavaScript(fetchCode);
    return result;
  } catch (err) {
    return null;
  }
});

// Existing authenticatedRequest handler (keep for backward compatibility)
ipcMain.handle('api:authenticatedRequest', async (_e, url: string, method: string, body: object | null, token: string, customContentType?: string) => {
  if (!apiWindow || apiWindow.isDestroyed()) {
    return { ok: false, status: 0, statusText: 'API window not available', body: '' };
  }

  try {
    const contentType = customContentType || 'application/json';
    // Передаём все динамические данные как JSON-объект — без прямой интерполяции строк
    const params = JSON.stringify({ url, method, body, token, contentType });
    const includeBody = method !== 'GET' && method !== 'HEAD';

    const fetchCode = `
      (async () => {
        try {
          const { url, method, body: bodyObj, token, contentType } = ${params};
          const bodyStr = bodyObj != null ? JSON.stringify(bodyObj) : undefined;

          const options = {
            method,
            credentials: 'include',
            headers: {
              'Authorization': 'OAuth ' + token,
              'Accept': 'application/json',
              'Content-Type': contentType,
            },
            ${includeBody ? 'body: bodyStr,' : ''}
          };
          const response = await fetch(url, options);
          const text = await response.text();
          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            body: text
          };
        } catch (err) {
          return { ok: false, status: 0, statusText: err.message, body: '' };
        }
      })()
    `;

    return await apiWindow.webContents.executeJavaScript(fetchCode);
  } catch (err) {
    return { ok: false, status: 0, statusText: (err as Error).message, body: '' };
  }
});

// Специальный handler для публикации комментариев с payload внутри executeJavaScript
ipcMain.handle('api:postComment', async (_e, trackId: number, message: string, timestamp: number, token: string, clientId: string) => {
  if (!apiWindow || apiWindow.isDestroyed()) {
    console.error('[API Post Comment] API window not available');
    return { ok: false, status: 0, statusText: 'API window not available', body: '' };
  }

  try {
    // Экранируем текст комментария для безопасной вставки в JS-код
    const escapedMessage = JSON.stringify(message);

    const fetchCode = `
      (async () => {
        try {
          const url = 'https://api-v2.soundcloud.com/tracks/${trackId}/comments?client_id=${clientId}&app_version=1776882728&app_locale=en';

          // Формируем body как application/x-www-form-urlencoded
          const rawBody = 'body=' + encodeURIComponent(${escapedMessage}) + '&timestamp=' + ${timestamp};


          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Accept': 'application/json, text/javascript, */*; q=0.01',
              'Accept-Language': 'en-US,en;q=0.9',
              'Authorization': 'OAuth ${token}',
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'Origin': 'https://soundcloud.com',
              'Referer': 'https://soundcloud.com/',
              'Sec-Fetch-Dest': 'empty',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Site': 'same-site',
              'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"Windows"'
            },
            body: rawBody
          });

          const result = await response.json();

          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            body: JSON.stringify(result)
          };
        } catch (err) {
          console.error('Comment fetch error:', err);
          return {
            ok: false,
            status: 0,
            statusText: err.message,
            body: ''
          };
        }
      })()
    `;

    const result = await apiWindow.webContents.executeJavaScript(fetchCode);
    return result;
  } catch (err) {
    console.error('[API Post Comment Error]', err);
    return { ok: false, status: 0, statusText: (err as Error).message, body: '' };
  }
});

ipcMain.handle('auth:soundcloud', async (_e, forceOpen = false) => {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    return null;
  }

  // Get main session for cookies transfer
  const mainSession = getAuthSession();

  // Create in-memory session (no persist) to test if cache folder is banned
  const authSession = session.fromPartition('soundcloud-auth');

  // Clear all storage data to remove old fraud IDs
  await authSession.clearStorageData();

  // Sync UA with Electron's Chromium version, remove Electron mentions
  const chromeVersion = process.versions.chrome || '131.0.0.0';
  await authSession.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`);

  // Stealth mode: remove Electron-revealing headers and force Chrome headers
  const filter = { urls: ['*://*.soundcloud.com/*', '*://*.captcha-delivery.com/*'] };
  authSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    // Remove headers that reveal Electron
    delete details.requestHeaders['X-Requested-With'];
    
    // Force standard Chrome headers
    details.requestHeaders['User-Agent'] = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    details.requestHeaders['sec-ch-ua'] = `"Chromium";v="${chromeVersion.split('.')[0]}", "Not(A:Brand";v="24", "Google Chrome";v="${chromeVersion.split('.')[0]}"`;
    details.requestHeaders['sec-ch-ua-mobile'] = '?0';
    details.requestHeaders['sec-ch-ua-platform'] = '"Windows"';
    
    callback({ requestHeaders: details.requestHeaders });
  });

  // Закрываем старое окно если есть
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.close();
  }
  authWindow = null;

  authWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: authSession, // In-memory session (no persist)
      webSecurity: true,
      offscreen: false,
      transparent: false,
      preload: path.join(__dirname, '..', 'electron', 'auth-preload.js'),
    },
  });

  authWindow.on('ready-to-show', () => {
    authWindow?.show();
  });

  authWindow.on('closed', () => {
    authWindow = null;
  });

  authWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Auth] Ошибка загрузки:', errorCode, errorDescription);
  });

  // Загружаем SoundCloud
  authWindow.loadURL('https://soundcloud.com');

  // Ждем когда пользователь авторизуется и появится oauth_token в cookies
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
        const oauthCookie = cookies.find((c: any) => c.name === 'oauth_token');

        // Если forceOpen, игнорируем существующий токен первые 5 проверок
        // чтобы дать пользователю возможность перелогиниться
        if (oauthCookie && oauthCookie.value) {
          if (forceOpen && checkCount < 5) {
            checkCount++;
            return;
          }
          clearInterval(checkForToken);
          
          // Ждем 2 секунды пока сессия запишется на диск
          await new Promise(r => setTimeout(r, 2000));
          
          // Transfer all cookies from auth session to main session
          try {
            const authCookies = await authSession.cookies.get({ url: 'https://soundcloud.com' });
            for (const cookie of authCookies) {
              const domain = cookie.domain || '.soundcloud.com';
              await mainSession.cookies.set({
                url: `https://${domain.startsWith('.') ? domain.slice(1) : domain}`,
                name: cookie.name,
                value: cookie.value,
                path: cookie.path || '/',
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
                expirationDate: cookie.expirationDate,
              });
            }
            await mainSession.flushStorageData();
            console.log('[Auth] Transferred cookies from auth session to main session');
          } catch (err) {
            console.error('[Auth] Failed to transfer cookies:', err);
          }
          
          // Перезагружаем apiWindow чтобы он получил новые куки
          if (apiWindow && !apiWindow.isDestroyed()) {
            await apiWindow.loadURL('https://soundcloud.com');
          }
          
          // Не закрываем окно чтобы пользователь мог проверить запросы
          resolve(oauthCookie.value);
        }
      } catch (err) {
        console.error('[Auth] Ошибка при проверке cookies:', err);
      }
    }, 1000);

    // Таймаут через 5 минут
    setTimeout(() => {
      clearInterval(checkForToken);
      if (authWindow && !authWindow.isDestroyed()) {
        authWindow.close();
      }
      resolve(null);
    }, 5 * 60 * 1000);
  });
});

// =============================================================================
// CORS-bypass fetch (main process не подчиняется CORS)
//=============================================================================

interface FetchRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  useAuthCookies?: boolean;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  body: string;
}

ipcMain.handle(
  'net:fetch',
  async (_e, req: FetchRequest): Promise<FetchResponse> => {
    try {
      let cookieStr = '';
      if (req.useAuthCookies) {
        const authSession = getAuthSession();
        const cookies = await authSession.cookies.get({ url: 'https://soundcloud.com' });
        if (cookies && cookies.length > 0) {
          cookieStr = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

          // Добавляем X-Datadome-ClientId из кук если есть
          const datadomeCookie = cookies.find((c: any) => c.name === 'datadome');
          if (datadomeCookie && req.headers) {
            req.headers['X-Datadome-ClientId'] = datadomeCookie.value;
          }
        }
      }
      const headers = {
        ...req.headers,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Referer': 'https://soundcloud.com/',
        'Origin': 'https://soundcloud.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Ch-UA': '"Not A;Brand";v="99", "Chromium";v="124", "Google Chrome";v="124"',
        'Sec-Ch-UA-Mobile': '?0',
        'Sec-Ch-UA-Platform': '"Windows"',
        ...(cookieStr ? { Cookie: cookieStr } : {}),
      };

      const response = await axios({
        method: req.method ?? 'GET',
        url: req.url,
        headers,
        data: req.body,
        responseType: 'text',
        validateStatus: () => true,
        timeout: 30000,
        // Используем найденный порт Clash или системный прокси
        ...(detectedProxyPort && detectedProxyPort > 0
          ? { proxy: { host: '127.0.0.1', port: detectedProxyPort, protocol: 'http' } }
          : { proxy: false }),
      });
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        statusText: response.statusText || `Status ${response.status}`,
        body: response.data,
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        statusText: (err as Error).message,
        body: '',
      };
    }
  }
);

// =============================================================================
// SoundCloud client_id extraction (hidden BrowserWindow + webRequest)
// =============================================================================

ipcMain.handle('sc:getClientId', async (_e, forceRefresh = false) => {
  try {
    // Сначала пробуем получить из кеша
    if (!forceRefresh) {
      const cached = settings.get('soundCloudClientId');
      if (cached && typeof cached === 'string') {
        return { ok: true, clientId: cached };
      }
    }
    // Если нет в кеше или forceRefresh=true, извлекаем
    const clientId = await clientIdExtractor.extract(forceRefresh);
    // Сохраняем в кеш
    settings.set('soundCloudClientId', clientId);
    return { ok: true, clientId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle('sc:invalidateClientId', () => {
  clientIdExtractor.invalidate();
});

// =============================================================================
// OBS Widget
// =============================================================================

// Auto-start widget server if it was enabled in previous session
app.whenReady().then(() => {
  const wasEnabled = settings.get('obsWidgetEnabled');
  if (wasEnabled) {
    startWidgetServer();
  }
});

ipcMain.handle('widget:setEnabled', (_e, enabled: boolean) => {
  settings.set('obsWidgetEnabled', enabled);
  if (enabled) {
    startWidgetServer();
    return { port: WIDGET_PORT };
  } else {
    stopWidgetServer();
    return { port: null };
  }
});

ipcMain.handle('widget:getPort', () => {
  const enabled = settings.get('obsWidgetEnabled');
  return enabled ? WIDGET_PORT : null;
});

ipcMain.handle('widget:update', (_e, data: {
  title: string;
  artist: string;
  artwork: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  accentColor: string;
  bgUrl: string;
  overlayOpacity: number;
  bgBlur: number;
  bgType: string;
}) => {
  updateWidgetData(data);
});

