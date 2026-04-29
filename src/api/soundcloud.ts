import type {
  SCTrack,
  SCPlaylist,
  SCUser,
  SCCollection,
  SCStreamAuth,
  SCResource,
  SCComment,
} from '@/types/soundcloud';

/**
 * SoundCloud API клиент.
 *
 * ВАЖНО по поводу client_id:
 * Официальная регистрация API-приложений в SoundCloud закрыта с 2021 года.
 * Единственный практический способ — извлечь client_id из веб-версии:
 *
 * 1. Открой https://soundcloud.com в браузере
 * 2. Открой DevTools -> Network
 * 3. Начни что-то играть
 * 4. Найди запрос к api-v2.soundcloud.com — в query увидишь client_id=XXXXX
 * 5. Вставь сюда (или вызови setClientId)
 *
 * Альтернатива: автоматически скрейпить client_id из JS-бандлов SoundCloud
 * (см. метод fetchClientId ниже). Это более устойчиво, но формально серая зона.
 *
 * Используется api-v2.soundcloud.com — неофициальный, но стабильный эндпоинт,
 * который использует сама веб-версия SoundCloud.
 */

const API_BASE = 'https://api-v2.soundcloud.com';
const APP_VERSION = '1776882728';
const WEB_BASE = 'https://soundcloud.com';

// Временное решение: используем CORS прокси для обхода ограничений
const CORS_PROXY = 'https://corsproxy.io/?';

// Client ID по умолчанию. Пустая строка означает "извлечь динамически".
// Для production лучше оставить пустым и позволить fetchClientId() получать актуальный.
// Fallback client_id (может протухнуть, но работает для тестирования)
const DEFAULT_CLIENT_ID = 'n7xYWWgZwkLEpK2wL6v21A';

/**
 * Обёртка над fetch, которая использует IPC-мост в Electron (чтобы обойти CORS)
 * и обычный fetch в браузере/dev-окружении без Electron.
 *
 * SoundCloud не отдаёт CORS-заголовки для сторонних origin-ов, поэтому прямой
 * fetch из renderer-процесса Electron падает с "Failed to fetch". Main process
 * не подчиняется Same-Origin Policy.
 */
async function ipcFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; useAuthCookies?: boolean } = {}
): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: <T>() => Promise<T> }> {
  const electron = (window as unknown as { electron?: { net?: { fetch: Function } } }).electron;

  if (electron?.net?.fetch) {
    try {
      const res = await electron.net.fetch({
        url,
        method: init.method || 'GET',
        headers: init.headers,
        body: init.body,
        useAuthCookies: init.useAuthCookies,
      });
      return {
        ok: res.ok,
        status: res.status,
        text: async () => res.body,
        json: async <T>() => JSON.parse(res.body) as T,
      };
    } catch (err) {
      // Electron bridge failed, trying CORS proxy
    }
  }

  // Fallback через CORS proxy для обхода geo-блокировок
  const proxiedUrl = CORS_PROXY + encodeURIComponent(url);
  const res = await fetch(proxiedUrl, init);
  return {
    ok: res.ok,
    status: res.status,
    text: () => res.text(),
    json: <T>() => res.json() as Promise<T>,
  };
}

class SoundCloudAPI {
  private clientId: string = DEFAULT_CLIENT_ID;
  private oauthToken: string | null = null;
  private clientIdPromise: Promise<string> | null = null;
  private inFlightRequests: Map<string, Promise<unknown>> = new Map();
  private cachedUserId: number | null = null;

  setClientId(id: string) {
    this.clientId = id;
  }

  setOAuthToken(token: string | null) {
    this.oauthToken = token;
    this.cachedUserId = null;
  }

  /**
   * Получает client_id через main process (hidden BrowserWindow + webRequest).
   * Это надёжнее, чем скрейпинг HTML: настоящий Chromium с JS, который
   * SoundCloud не может забанить как "бота". webRequest перехватывает
   * первый же исходящий запрос к api-v2.soundcloud.com и вытаскивает
   * client_id из query-параметров.
   */
  async fetchClientId(): Promise<string> {
    if (this.clientId) return this.clientId;
    if (this.clientIdPromise) return this.clientIdPromise;

    this.clientIdPromise = (async () => {
      // Сначала пробуем получить из кеша
      const electron = (window as unknown as { electron?: { settings?: { get: (key: string) => unknown; set: (key: string, value: unknown) => void } } }).electron;
      if (electron?.settings) {
        const cachedId = await electron.settings.get('soundCloudClientId');
        if (cachedId && typeof cachedId === 'string') {
          this.clientId = cachedId;
          return this.clientId;
        }
      }

      // Если нет в кеше, извлекаем через main process
      const scElectron = (window as unknown as {
        electron?: {
          sc?: {
            getClientId: (r?: boolean) => Promise<
              { ok: true; clientId: string } | { ok: false; error: string }
            >;
          };
        };
      }).electron;

      if (!scElectron?.sc) {
        throw new Error(
          'Извлечение client_id возможно только в Electron. ' +
            'Убедись, что приложение запущено через npm run dev.'
        );
      }

      const res = await scElectron.sc.getClientId(false);
      if (!res.ok) {
        throw new Error(`Не удалось получить client_id: ${res.error}`);
      }
      this.clientId = res.clientId;

      // Сохраняем в кеш
      if (electron?.settings) {
        electron.settings.set('soundCloudClientId', this.clientId);
      }

      return this.clientId;
    })();

    try {
      return await this.clientIdPromise;
    } finally {
      this.clientIdPromise = null;
    }
  }

  async ensureClientId(): Promise<string> {
    if (!this.clientId) await this.fetchClientId();
    return this.clientId;
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number> = {}
  ): Promise<T> {
    const clientId = await this.ensureClientId();
    const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
    url.searchParams.set('client_id', clientId);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }


    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (this.oauthToken) {
      headers['Authorization'] = `OAuth ${this.oauthToken}`;
    }

    const requestKey = `${url.toString()}|auth:${this.oauthToken ?? ''}`;
    const existingRequest = this.inFlightRequests.get(requestKey) as Promise<T> | undefined;
    if (existingRequest) {
      return existingRequest;
    }

    const requestPromise = (async () => {
      const res = await ipcFetch(url.toString(), { headers });
      if (!res.ok) {
        if (res.status === 401 && this.oauthToken) {
          this.oauthToken = null;
        }
        if (res.status === 401 || res.status === 403) {
          this.clientId = '';
        }
        const errorText = await res.text();
        throw new Error(`SoundCloud API error ${res.status}: ${errorText}`);
      }
      return res.json<T>();
    })();

    this.inFlightRequests.set(requestKey, requestPromise as Promise<unknown>);

    try {
      return await requestPromise;
    } finally {
      this.inFlightRequests.delete(requestKey);
    }
  }

  // Тестовый метод для проверки сети
  async testNetwork(): Promise<boolean> {
    try {
      const res = await ipcFetch('https://www.google.com/', {});
      const ok = res.ok;
      return ok;
    } catch (err) {
      console.error('[SoundCloud] Тестовый запрос ошибка:', err);
      return false;
    }
  }

  // Детальный тест запроса к SoundCloud API
  async testSoundCloudAPI(): Promise<void> {
    try {
      const testUrl = 'https://api-v2.soundcloud.com/tracks/123456789?limit=1';
      const res = await ipcFetch(testUrl, {});

      if (!res.ok) {
        await res.text();
      }
    } catch (err) {
      console.error('[SoundCloud] Тестовый запрос ошибка:', err);
    }
  }

  // Получение плейлистов через оригинальный API
  async getPlaylistsViaRSS(genre = 'all-music', limit = 50): Promise<SCPlaylist[]> {
    // Используем оригинальный метод getCharts который возвращает треки
    // Затем преобразуем треки в плейлисты для отображения
    const charts = await this.getCharts('trending', genre, limit);
    return charts.collection.map((item) => ({
      id: item.track.id,
      kind: 'playlist' as const,
      title: item.track.title,
      permalink: item.track.permalink || '',
      permalink_url: item.track.permalink_url || '',
      artwork_url: item.track.artwork_url || '',
      track_count: 1,
      duration: item.track.duration || 0,
      created_at: item.track.created_at || new Date().toISOString(),
      user: item.track.user,
      tracks: [],
    })) as SCPlaylist[];
  }

  // ===== Поиск =====

  async search(
    query: string,
    kind: 'all' | 'tracks' | 'users' | 'playlists' = 'all',
    limit = 100,
    offset = 0
  ): Promise<SCCollection<SCResource>> {
    const path =
      kind === 'all'
        ? '/search'
        : kind === 'tracks'
        ? '/search/tracks'
        : kind === 'users'
        ? '/search/users'
        : '/search/playlists';
    return this.request<SCCollection<SCResource>>(path, { q: query, limit, offset });
  }

  // ===== Треки =====

  async getTracksByIds(ids: number[]): Promise<SCTrack[]> {
    if (!this.oauthToken) throw new Error('Требуется авторизация');
    
    const clientId = await this.ensureClientId();
    const url = `${API_BASE}/tracks?ids=${ids.join(',')}&client_id=${clientId}&limit=50`;
    
    const response = await window.electron?.net.authenticatedRequest(
      url,
      'GET',
      null,
      this.oauthToken
    );
    
    if (!response?.ok || !response?.body) {
      throw new Error('Failed to fetch tracks by IDs');
    }
    
    const data = JSON.parse(response.body);
    // /tracks?ids= returns a flat array, not { collection: [] }
    return Array.isArray(data) ? data : (data.collection || []);
  }

  /**
   * Батчевый запрос треков. SoundCloud принимает не больше ~50 id за раз,
   * поэтому разбиваем на чанки и запрашиваем параллельно с задержкой для rate limiting.
   */
  async getTracks(ids: number[]): Promise<SCTrack[]> {
    if (ids.length === 0) return [];
    const CHUNK = 50;
    if (ids.length <= CHUNK) {
      return this.request('/tracks', { ids: ids.join(',') });
    }
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      chunks.push(ids.slice(i, i + CHUNK));
    }
    const results = await Promise.all(
      chunks.map((chunk, index) =>
        new Promise<SCTrack[]>((resolve) => {
          setTimeout(() => {
            this.request<SCTrack[]>('/tracks', { ids: chunk.join(',') })
              .then(resolve)
              .catch((err) => {
                console.error('[SoundCloud] Ошибка батчевой загрузки чанка треков:', err);
                resolve([]);
              });
          }, index * 200); // 200ms задержка между чанками для rate limiting
        })
      )
    );
    return results.flat();
  }

  /**
   * Загружает следующую страницу по абсолютному URL из поля `next_href`.
   * Нужно для эндпоинтов, которые используют курсорную пагинацию (лайки,
   * стрим) — простой числовой offset там не работает.
   */
  async fetchNext<T>(nextHref: string): Promise<SCCollection<T>> {
    return this.request<SCCollection<T>>(nextHref);
  }

  async resolveUrl(url: string): Promise<SCResource> {
    return this.request('/resolve', { url });
  }

  /**
   * Получает реальный URL стрима. SoundCloud отдаёт ссылку, защищённую
   * временным токеном — её можно передать в <audio> тег.
   *
   * Выбираем transcoding с протоколом "progressive" (обычный MP3) если доступен,
   * иначе HLS (нужен hls.js на клиенте).
   */
  async getStreamUrl(track: SCTrack): Promise<{ url: string; isHls: boolean }> {
    // Предпочитаем progressive (MP3), иначе берём HLS
    const progressive = track.media.transcodings.find(
      (t) => t.format.protocol === 'progressive'
    );
    const hls = track.media.transcodings.find((t) => t.format.protocol === 'hls');
    const transcoding = progressive || hls;
    if (!transcoding) throw new Error('Нет доступного стрима для этого трека');

    const auth = await this.request<SCStreamAuth>(transcoding.url);
    return { url: auth.url, isHls: transcoding.format.protocol !== 'progressive' };
  }

  // ===== Пользователи =====

  async getUser(id: number): Promise<SCUser> {
    return this.request(`/users/${id}`);
  }

  async getUserTracks(userId: number, limit = 30, offset = 0): Promise<SCCollection<SCTrack>> {
    const key = `utracks:${userId}:${limit}:${offset}`;
    const cached = getCached<SCCollection<SCTrack>>(key);
    if (cached) return cached;
    const result = await this.request<SCCollection<SCTrack>>(`/users/${userId}/tracks`, { limit, offset });
    return setCache(key, result);
  }

  async getUserTopTracks(userId: number, limit = 10): Promise<SCCollection<SCTrack>> {
    return this.request(`/users/${userId}/toptracks`, { limit, offset: 0 });
  }

  async getUserPlaylists(userId: number, limit = 30, offset = 0): Promise<SCCollection<SCPlaylist>> {
    return this.request(`/users/${userId}/playlists`, { limit, offset });
  }

  async getSystemPlaylistLikes(limit = 50): Promise<SCCollection<any>> {
    if (!this.oauthToken) throw new Error('Требуется авторизация для получения лайкнутых системных плейлистов');
    const clientId = await this.ensureClientId();
    const url = `${API_BASE}/me/system_playlist_likes?limit=${limit}&client_id=${clientId}`;
    
    const response = await window.electron?.net.authenticatedRequest(url, 'GET', null, this.oauthToken || '');
    if (!response || !response.ok) {
      throw new Error(`Failed to fetch system playlist likes: ${response?.status} ${response?.statusText}`);
    }

    return JSON.parse(response.body) as SCCollection<any>;
  }

  async getLibraryAll(limit = 50): Promise<SCCollection<any>> {
    if (!this.oauthToken) throw new Error('Требуется авторизация для получения библиотеки');
    const clientId = await this.ensureClientId();
    const url = `${API_BASE}/me/library/all?limit=${limit}&linked_partitioning=1&client_id=${clientId}`;
    
    const response = await window.electron?.net.authenticatedRequest(url, 'GET', null, this.oauthToken || '');
    if (!response || !response.ok) {
      throw new Error(`Failed to fetch library: ${response?.status} ${response?.statusText}`);
    }

    return JSON.parse(response.body) as SCCollection<any>;
  }

  async getUserLikes(
    userId: number,
    limit = 100,
    offset = 0
  ): Promise<SCCollection<{ created_at: string; track?: SCTrack }>> {
    return this.request(`/users/${userId}/likes`, { limit, offset });
  }

  async getUserFollowings(userId: number, limit = 200): Promise<SCCollection<SCUser>> {
    if (!this.oauthToken) throw new Error('Требуется авторизация для получения подписок');
    return this.request(`/users/${userId}/followings`, { limit });
  }

  async getUserFollowers(userId: number, limit = 50): Promise<SCCollection<SCUser>> {
    return this.request(`/users/${userId}/followers`, { limit });
  }

  // ===== Плейлисты =====

  async getPlaylist(id: number, limit = 200): Promise<SCPlaylist> {
    const playlist = await this.request<SCPlaylist>(`/playlists/${id}`, { limit });
    
    // Fallback обложка: треки → аватар владельца (как в оригинальном SC)
    if (!playlist.artwork_url) {
      const tracks = playlist.tracks || [];
      for (let i = Math.min(4, tracks.length - 1); i >= 0; i--) {
        if (tracks[i]?.artwork_url) { playlist.artwork_url = tracks[i].artwork_url; break; }
      }
      if (!playlist.artwork_url && playlist.user?.avatar_url) {
        playlist.artwork_url = playlist.user.avatar_url;
      }
    }
    
    return playlist;
  }

  async getSystemPlaylist(urn: string): Promise<SCPlaylist> {
    if (!this.oauthToken) throw new Error('Требуется авторизация');
    
    const url = `${API_BASE}/system-playlists/${urn}`;
    const response = await window.electron?.net.authenticatedRequest(
      url,
      'GET',
      null,
      this.oauthToken
    );
    
    if (!response?.ok || !response?.body) {
      throw new Error('Failed to fetch system playlist');
    }
    
    const playlist = JSON.parse(response.body) as SCPlaylist;
    
    // Добавляем fallback обложку для системного плейлиста без обложки
    if (!playlist.artwork_url && playlist.tracks && playlist.tracks.length > 0) {
      const tracks = playlist.tracks;
      const maxIdx = Math.min(4, tracks.length - 1);
      let fallbackArtwork: string | null = null;
      for (let i = maxIdx; i >= 0; i--) {
        if (tracks[i]?.artwork_url) {
          fallbackArtwork = tracks[i].artwork_url;
          break;
        }
      }
      if (fallbackArtwork) {
        playlist.artwork_url = fallbackArtwork;
      }
    }
    
    return playlist;
  }

  async likePlaylist(playlistId: number): Promise<void> {
    if (!this.oauthToken) throw new Error('Требуется авторизация');
    
    const userId = await this.getCachedUserId();
    const url = `${API_BASE}/users/${userId}/playlist_likes/${playlistId}`;
    
    const response = await window.electron?.net.authenticatedRequest(
      url,
      'PUT',
      null,
      this.oauthToken
    );
    
    // 204 No Content — нормальный успешный ответ; проверяем только ok
    if (!response?.ok) {
      throw new Error(`Failed to like playlist: ${response?.status}`);
    }
  }

  async unlikePlaylist(playlistId: number): Promise<void> {
    if (!this.oauthToken) throw new Error('Требуется авторизация');
    
    const userId = await this.getCachedUserId();
    const url = `${API_BASE}/users/${userId}/playlist_likes/${playlistId}`;
    
    const response = await window.electron?.net.authenticatedRequest(
      url,
      'DELETE',
      null,
      this.oauthToken
    );
    
    // 204 No Content — нормальный успешный ответ; проверяем только ok
    if (!response?.ok) {
      throw new Error(`Failed to unlike playlist: ${response?.status}`);
    }
  }

  // ===== Лента (требует авторизации) =====

  async getStream(limit = 100, offset = 0, activityTypes?: string): Promise<SCCollection<{ track?: SCTrack; playlist?: SCPlaylist; type?: string }>> {
    if (!this.oauthToken) throw new Error('Требуется авторизация для получения ленты');
    
    const userId = await this.getCachedUserId();
    
    // Default activityTypes to include all types if not specified
    const types = activityTypes || 'TrackPost,PlaylistPost,TrackRepost,PlaylistRepost';
    
    const params: Record<string, string | number> = {
      limit,
      offset,
      activityTypes: types,
    };

    const url = `${API_BASE}/stream`;
    
    // Use unified soundcloudRequest handler with automatic token extraction
    const response = await window.electron?.net.soundcloudRequest(url, 'GET', params);
    if (!response || !response.ok) {
      const errorMsg = response?.error || response?.statusText || 'Unknown error';
      throw new Error(`Failed to fetch stream: ${response?.status} ${errorMsg}`);
    }

    return JSON.parse(response.body) as SCCollection<{ track?: SCTrack; playlist?: SCPlaylist; type?: string }>;
  }

  // ===== История прослушиваний =====

  async getPlayHistory(limit = 25): Promise<SCCollection<SCTrack>> {
    if (!this.oauthToken) throw new Error('Требуется авторизация для получения истории');
    
    const url = `${API_BASE}/me/play-history/tracks`;
    const params = new URLSearchParams({ limit: String(limit), linked_partitioning: '1' });
    
    const response = await window.electron?.net.authenticatedRequest(
      url + '?' + params.toString(),
      'GET',
      null,
      this.oauthToken || ''
    );
    if (!response || !response.ok) {
      const errorMsg = response?.statusText || 'Unknown error';
      throw new Error(`Failed to fetch play history: ${response?.status} ${errorMsg}`);
    }

    return JSON.parse(response.body) as SCCollection<SCTrack>;
  }

  // ===== Смешанные подборки (Mixed Selections) =====

  async getMixedSelections(): Promise<{ collection: Array<{ title: string; tracks: SCTrack[] }> }> {
    const url = `${API_BASE}/mixed-selections`;
    
    const response = await window.electron?.net.authenticatedRequest(
      url,
      'GET',
      null,
      this.oauthToken || ''
    );
    if (!response || !response.ok) {
      const errorMsg = response?.statusText || 'Unknown error';
      throw new Error(`Failed to fetch mixed selections: ${response?.status} ${errorMsg}`);
    }

    return JSON.parse(response.body) as { collection: Array<{ title: string; tracks: SCTrack[] }> };
  }

  // ===== Рекомендации =====

  async getRelatedTracks(trackId: number, limit = 20): Promise<SCCollection<SCTrack>> {
    const key = `related:${trackId}:${limit}`;
    const cached = getCached<SCCollection<SCTrack>>(key);
    if (cached) return cached;
    const result = await this.request<SCCollection<SCTrack>>(`/tracks/${trackId}/related`, { limit });
    return setCache(key, result);
  }

  async getCharts(kind: 'top' | 'trending' = 'trending', genre = 'all-music', limit = 50) {
    try {
      return await this.request<SCCollection<{ track: SCTrack }>>('/charts', {
        kind,
        genre: `soundcloud:genres:${genre}`,
        limit,
      });
    } catch (err) {
      // Альтернатива: используем search с тегом жанра
      const searchQuery = genre === 'all-music' ? '' : genre;
      const results = await this.search(searchQuery, 'tracks', limit);
      return results as unknown as SCCollection<{ track: SCTrack }>;
    }
  }

  // ===== Комментарии =====

  async getTrackComments(trackId: number, limit = 50): Promise<SCCollection<SCComment>> {
    return this.request(`/tracks/${trackId}/comments`, {
      threaded: 0,
      filter_replies: 1,
      limit,
      offset: 0,
      linked_partitioning: 1,
      app_version: '1776805536',
      app_locale: 'en',
    });
  }

  // ===== Действия пользователя (требуют OAuth) =====

  async getCachedUserId(): Promise<number> {
    if (this.cachedUserId) return this.cachedUserId;

    const me = await this.getMe();
    this.cachedUserId = me.id;

    // Store in settings for use in main process
    const electron = (window as unknown as { electron?: { settings?: { set: (key: string, value: unknown) => void } } }).electron;
    if (electron?.settings) {
      electron.settings.set('userId', me.id);
    }

    return me.id;
  }

  async likeTrack(trackId: number): Promise<void> {
    if (!this.oauthToken) throw new Error('Требуется авторизация');
    const [userId, clientId] = await Promise.all([this.getCachedUserId(), this.ensureClientId()]);
    const url = `${API_BASE}/users/${userId}/track_likes/${trackId}?client_id=${clientId}`;

    const response = await window.electron?.net.authenticatedRequest(url, 'PUT', null, this.oauthToken);

    if (!response || !response.ok) {
      throw new Error(`Failed to like track: ${response?.status} ${response?.statusText}`);
    }
  }

  async unlikeTrack(trackId: number): Promise<void> {
    if (!this.oauthToken) throw new Error('Требуется авторизация');
    const [userId, clientId] = await Promise.all([this.getCachedUserId(), this.ensureClientId()]);
    const url = `${API_BASE}/users/${userId}/track_likes/${trackId}?client_id=${clientId}`;

    await window.electron?.net.authenticatedRequest(url, 'DELETE', null, this.oauthToken);
  }

  async getTrackLikes(limit = 50): Promise<SCCollection<{ track: SCTrack }>> {
    if (!this.oauthToken) throw new Error('Требуется авторизация');
    const userId = await this.getCachedUserId();
    return this.request(`/users/${userId}/track_likes`, { limit, linked_partitioning: 1 });
  }

  async sendPlayHistory(trackUrn: string): Promise<void> {
    if (!this.oauthToken) return;
    const clientId = await this.ensureClientId();
    await window.electron?.playHistory?.record(trackUrn, clientId, APP_VERSION);
  }

  async followUser(userId: number): Promise<void> {
    if (!this.oauthToken) throw new Error('Требуется авторизация');
    const clientId = await this.ensureClientId();
    // SoundCloud API использует POST /me/followings/{userId}
    const url = `${API_BASE}/me/followings/${userId}?client_id=${clientId}`;

    // Используем скрытое окно для обхода Datadome защиты
    const response = await window.electron?.net.authenticatedRequest(url, 'POST', null, this.oauthToken);
    if (!response || !response.ok) {
      throw new Error(`Failed to follow user: ${response?.status} ${response?.statusText}`);
    }
  }

  async unfollowUser(userId: number): Promise<void> {
    if (!this.oauthToken) throw new Error('Требуется авторизация');
    const clientId = await this.ensureClientId();
    // SoundCloud API использует DELETE /me/followings/{userId}
    const url = `${API_BASE}/me/followings/${userId}?client_id=${clientId}`;

    // Используем скрытое окно для обхода Datadome защиты
    const response = await window.electron?.net.authenticatedRequest(url, 'DELETE', null, this.oauthToken);
    if (!response || !response.ok) {
      throw new Error(`Failed to unfollow user: ${response?.status} ${response?.statusText}`);
    }
  }

  async checkFollowing(userId: number): Promise<boolean> {
    if (!this.oauthToken) return false;
    try {
      const clientId = await this.ensureClientId();
      const url = `${API_BASE}/me/followings/${userId}?client_id=${clientId}&app_version=${APP_VERSION}&app_locale=en`;
      // ipcFetch → net:fetch → axios в main process.
      // Обходит CORS и Datadome браузерного контекста, токен передаётся явно.
      const res = await ipcFetch(url, {
        headers: {
          'Authorization': `OAuth ${this.oauthToken}`,
          'Accept': 'application/json',
          'Origin': 'https://soundcloud.com',
          'Referer': 'https://soundcloud.com/',
        },
        useAuthCookies: true, // берём Datadome-куки из реальной auth-сессии
      });
      return res.ok; // 200 = подписан, 404 = не подписан
    } catch {
      return false;
    }
  }

  async postComment(trackId: number, text: string, timestamp: number = 0): Promise<void> {
    if (!this.oauthToken) throw new Error('Требуется авторизация');
    const clientId = await this.ensureClientId();

    // Используем специальный handler для комментариев с payload внутри executeJavaScript
    const response = await window.electron?.net.postComment(
      trackId,
      text,
      timestamp || 0,
      this.oauthToken,
      clientId
    );
    if (!response || !response.ok) {
      throw new Error(`Failed to post comment: ${response?.status} ${response?.statusText}`);
    }
  }

  async getMe(): Promise<SCUser> {
    if (!this.oauthToken) throw new Error('Требуется авторизация');
    return this.request('/me');
  }
}

// ─── In-memory кеш для SC API (5 минут TTL) ─────────────────────────────────
const _apiCache = new Map<string, { data: any; ts: number }>();
const _CACHE_TTL = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = _apiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > _CACHE_TTL) { _apiCache.delete(key); return null; }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): T {
  if (_apiCache.size > 200) {
    const first = _apiCache.keys().next().value;
    if (first) _apiCache.delete(first);
  }
  _apiCache.set(key, { data, ts: Date.now() });
  return data;
}
// ─────────────────────────────────────────────────────────────────────────────


export const scAPI = new SoundCloudAPI();
