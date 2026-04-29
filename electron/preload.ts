import { contextBridge, ipcRenderer } from 'electron';

// Типы бриджа доступны в renderer через window.electron
const electronAPI = {
  log: (...args: any[]) => ipcRenderer.send('log', ...args),
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (cb: (isMaximized: boolean) => void) => {
      const listener = (_: unknown, value: boolean) => cb(value);
      ipcRenderer.on('window:maximized', listener);
      return () => ipcRenderer.removeListener('window:maximized', listener);
    },
    onBeforeQuit: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on('app:before-quit', listener);
      return () => ipcRenderer.removeListener('app:before-quit', listener);
    },
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },
  rpc: {
    update: (data: {
      title: string;
      artist: string;
      artwork?: string;
      duration?: number;
      startedAt?: number;
      trackUrl?: string;
      isPlaying: boolean;
    }) => ipcRenderer.invoke('rpc:update', data),
    clear: () => ipcRenderer.invoke('rpc:clear'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('rpc:setEnabled', enabled),
  },
  feed: {
    loadInitial: (userId: number, limit: number) =>
      ipcRenderer.invoke('feed:loadInitial', userId, limit) as Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        body: string;
        error?: string;
      }>,
    hideReposts: (userId: number, limit: number) =>
      ipcRenderer.invoke('feed:hideReposts', userId, limit) as Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        body: string;
        error?: string;
      }>,
  },
  net: {
    fetch: (req: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      useAuthCookies?: boolean;
    }) =>
      ipcRenderer.invoke('net:fetch', req) as Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        body: string;
      }>,
    authenticatedRequest: (url: string, method: string, body: object | null, token: string, customContentType?: string) =>
      ipcRenderer.invoke('api:authenticatedRequest', url, method, body, token, customContentType) as Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        body: string;
      }>,
    soundcloudApi: (endpoint: string, params: Record<string, string | number>, method?: string, body?: object | null) =>
      ipcRenderer.invoke('soundcloud-api', endpoint, params, method, body) as Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        body: string;
        error?: string;
      }>,
    soundcloudRequest: (url: string, method?: string, params?: Record<string, string | number>) =>
      ipcRenderer.invoke('soundcloud-request', url, method, params) as Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        body: string;
        error?: string;
      }>,
    postComment: (trackId: number, message: string, timestamp: number, token: string, clientId: string) =>
      ipcRenderer.invoke('api:postComment', trackId, message, timestamp, token, clientId) as Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        body: string;
      }>,
  },
  sc: {
    getClientId: (forceRefresh?: boolean) =>
      ipcRenderer.invoke('sc:getClientId', forceRefresh) as Promise<
        { ok: true; clientId: string } | { ok: false; error: string }
      >,
    invalidateClientId: () => ipcRenderer.invoke('sc:invalidateClientId'),
  },
  auth: {
    soundcloud: (forceOpen?: boolean) => ipcRenderer.invoke('auth:soundcloud', forceOpen) as Promise<string | null>,
    importCookies: (cookiesJson: string) => ipcRenderer.invoke('auth:importCookies', cookiesJson) as Promise<{ success: boolean; error?: string }>,
    clearCookies: () => ipcRenderer.invoke('auth:clearCookies') as Promise<boolean>,
    getUserId: () => ipcRenderer.invoke('auth:getUserId') as Promise<number | null>,
    getRelatedArtists: (oauthToken: string) => 
      ipcRenderer.invoke('auth:getRelatedArtists', oauthToken) as Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        body: string;
      }>,
  },
  playHistory: {
    record: (trackUrn: string, clientId: string, appVersion: string) =>
      ipcRenderer.invoke('play-history:record', trackUrn, clientId, appVersion) as Promise<void>,
  },
  widget: {
    setEnabled: (enabled: boolean) =>
      ipcRenderer.invoke('widget:setEnabled', enabled) as Promise<{ port: number | null }>,
    getPort: () => ipcRenderer.invoke('widget:getPort') as Promise<number | null>,
    update: (data: {
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
    }) => ipcRenderer.invoke('widget:update', data),
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates') as Promise<any>,
    installUpdate: () => ipcRenderer.invoke('updater:install'),
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electron', electronAPI);

// Слушатель события обнаружения токена
ipcRenderer.on('auth:tokenDetected', (_e, token: string) => {
  // Отправляем событие в React приложение
  window.dispatchEvent(new CustomEvent('auth:tokenDetected', { detail: token }));
});

export type ElectronAPI = typeof electronAPI;
