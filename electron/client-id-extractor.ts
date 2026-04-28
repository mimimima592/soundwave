import { BrowserWindow, session } from 'electron';

/**
 * Извлекает SoundCloud client_id надёжным способом: открывает невидимое
 * BrowserWindow с soundcloud.com, ждёт пока загрузится JS, и перехватывает
 * первый же запрос к api-v2.soundcloud.com/* — в его query параметре всегда
 * есть client_id=XXXX.
 *
 * Это гораздо надёжнее, чем скрейпинг HTML-бандлов, потому что:
 * 1. Реальный браузер загружается без anti-bot блокировок
 * 2. JS полноценно выполняется, client_id формируется нормально
 * 3. Мы не зависим от минификации кода — просто читаем готовый query-param
 */
export class ClientIdExtractor {
  private cachedId: string | null = null;
  private extractPromise: Promise<string> | null = null;

  async extract(forceRefresh = false): Promise<string> {
    if (this.cachedId && !forceRefresh) return this.cachedId;
    if (this.extractPromise) return this.extractPromise;

    this.extractPromise = this.doExtract();
    try {
      return await this.extractPromise;
    } finally {
      this.extractPromise = null;
    }
  }

  private doExtract(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutMs = 30_000;

      // Отдельная сессия чтобы не мешать основному окну
      const ses = session.fromPartition('persist:sc-extractor');

      const extractorWindow = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          session: ses,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      let settled = false;
      const finish = (result: { ok: true; id: string } | { ok: false; err: Error }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          ses.webRequest.onBeforeSendHeaders(null);
        } catch {
          // ignore
        }
        // Закрываем окно с небольшой задержкой, чтобы не получить race condition
        // с executeJavaScript/navigation callback
        setTimeout(() => {
          if (!extractorWindow.isDestroyed()) extractorWindow.destroy();
        }, 50);

        if (result.ok) {
          this.cachedId = result.id;
          resolve(result.id);
        } else {
          reject(result.err);
        }
      };

      const timer = setTimeout(() => {
        finish({
          ok: false,
          err: new Error(
            'Timeout: не удалось перехватить client_id за 30 секунд. ' +
              'Проверь интернет-соединение.'
          ),
        });
      }, timeoutMs);

      // Перехватываем все запросы в этой сессии
      ses.webRequest.onBeforeSendHeaders((details, callback) => {
        try {
          const url = details.url;
          if (url.includes('api-v2.soundcloud.com') || url.includes('api.soundcloud.com')) {
            const match = url.match(/[?&]client_id=([a-zA-Z0-9]{32})/);
            if (match) {
              finish({ ok: true, id: match[1] });
            }
          }
        } catch {
          // ignore
        }
        callback({ requestHeaders: details.requestHeaders });
      });

      extractorWindow.webContents.on('did-fail-load', (_e, code, desc) => {
        finish({
          ok: false,
          err: new Error(`Не удалось загрузить soundcloud.com (${code}): ${desc}`),
        });
      });

      // Загружаем главную — она сразу делает запросы к api-v2 для лент/чартов
      extractorWindow.loadURL('https://soundcloud.com/discover').catch((err) => {
        finish({ ok: false, err });
      });
    });
  }

  invalidate() {
    this.cachedId = null;
  }

  getCached(): string | null {
    return this.cachedId;
  }
}
