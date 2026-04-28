import { create } from 'zustand';
import { BUILT_IN_THEMES, applyTheme, type Theme } from '@/themes/themes';
import { scAPI } from '@/api/soundcloud';
import type { SCTrack, SCPlaylist } from '@/types/soundcloud';

// Константы для отслеживания touched IDs (чтобы не перезаписывать серверные данные)
const touchedTrackIds = new Set<number>();
const touchedPlaylistIds = new Set<string | number>();

// Ключ для localStorage
const ALL_LIKED_IDS_KEY = 'allLikedIds';

export type BackgroundType = 'none' | 'gif' | 'color' | 'artwork';

interface UIState {
  // Темы
  themes: Theme[];               // встроенные + кастомные
  activeThemeId: string;
  setActiveTheme: (id: string) => void;
  addCustomTheme: (theme: Theme) => void;
  updateCustomTheme: (theme: Theme) => void;
  deleteCustomTheme: (id: string) => void;

  // Фон
  backgroundType: BackgroundType;
  backgroundUrl: string;
  backgroundBlur: number;    // 0-50 px
  backgroundOpacity: number; // 0-1
  setBackground: (patch: Partial<{
    type: BackgroundType;
    url: string;
    blur: number;
    opacity: number;
  }>) => void;

  // Discord RPC
  discordRpcEnabled: boolean;
  setDiscordRpcEnabled: (enabled: boolean) => void;

  // Auth (user's OAuth token — опционально)
  oauthToken: string | null;
  setOAuthToken: (token: string | null) => void;

  // Лайки (optimistic + синк с сервером)
  likedTrackIds: Set<number>;
  optimisticTracks: Map<number, SCTrack>; // треки, лайкнутые до подтверждения сервера
  toggleLike: (trackId: number, track?: SCTrack) => Promise<void>;
  isTrackLiked: (trackId: number) => boolean;
  addServerLikedIds: (ids: number[]) => void;

  // Лайки плейлистов (optimistic + синк с сервером)
  likedPlaylistIds: Set<string | number>; // Поддержка и ID (number) и URN (string) для системных плейлистов
  optimisticPlaylists: Map<string | number, SCPlaylist>; // плейлисты, лайкнутые до подтверждения сервера
  togglePlaylistLike: (playlistId: number | string, playlist?: SCPlaylist) => Promise<void>;
  isPlaylistLiked: (playlistId: number | string, playlistUrn?: string) => boolean;
  addServerLikedPlaylistIds: (ids: number[]) => void;
  syncLikedPlaylists: (playlists: any[]) => void;

  // Универсальный массив всех лайкнутых ID (треки + плейлисты URN) для мгновенной проверки
  allLikedIds: Set<string | number>;
  isLiked: (id: number | string, urn?: string) => boolean;

  // Плейлисты в Библиотеке (оптимистичное обновление)
  libraryPlaylists: SCPlaylist[];
  addLibraryPlaylist: (playlist: SCPlaylist) => void;
  removeLibraryPlaylist: (playlistId: string | number) => void;

  // Последние гифки (хранятся последние 10)
  recentGifs: string[];
  addRecentGif: (url: string) => void;
  clearRecentGifs: () => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Производительность
  freezeHoverOnScroll: boolean;
  setFreezeHoverOnScroll: (v: boolean) => void;


  // OBS Widget
  obsWidgetEnabled: boolean;
  // Equalizer
  eqEnabled: boolean;
  eqGains: number[]; // 7 полос, дБ от -12 до +12
  setObsWidgetEnabled: (enabled: boolean) => void;
  widgetOverlayOpacity: number;
  setWidgetOverlayOpacity: (v: number) => void;
  widgetBgBlur: number;
  setWidgetBgBlur: (v: number) => void;
  widgetAccentColor: string;
  setWidgetAccentColor: (v: string) => void;
  widgetBgType: 'artwork' | 'blur';
  setWidgetBgType: (v: 'artwork' | 'blur') => void;

  // Hydration
  hydrated: boolean;
  hydrate: () => Promise<void>;
}

export const useUIStore = create<UIState>((set, get) => ({
  themes: [...BUILT_IN_THEMES],
  activeThemeId: 'midnight',

  setActiveTheme: (id) => {
    const theme = get().themes.find((t) => t.id === id);
    if (!theme) return;
    applyTheme(theme);
    set({ activeThemeId: id });
    window.electron?.settings.set('activeTheme', id);
  },

  addCustomTheme: (theme) => {
    set((s) => ({ themes: [...s.themes, theme] }));
    const custom = get().themes.filter((t) => t.id.startsWith('custom-'));
    const map: Record<string, Theme> = {};
    for (const t of custom) map[t.id] = t;
    window.electron?.settings.set('customThemes', map);
  },

  updateCustomTheme: (theme) => {
    set((s) => ({
      themes: s.themes.map((t) => (t.id === theme.id ? theme : t)),
    }));
    if (get().activeThemeId === theme.id) applyTheme(theme);
    const custom = get().themes.filter((t) => t.id.startsWith('custom-'));
    const map: Record<string, Theme> = {};
    for (const t of custom) map[t.id] = t;
    window.electron?.settings.set('customThemes', map);
  },

  deleteCustomTheme: (id) => {
    const { activeThemeId } = get();
    set((s) => ({ themes: s.themes.filter((t) => t.id !== id) }));
    if (activeThemeId === id) get().setActiveTheme('midnight');
    const custom = get().themes.filter((t) => t.id.startsWith('custom-'));
    const map: Record<string, Theme> = {};
    for (const t of custom) map[t.id] = t;
    window.electron?.settings.set('customThemes', map);
  },

  backgroundType: 'none',
  backgroundUrl: '',
  backgroundBlur: 20,
  backgroundOpacity: 0.4,

  setBackground: (patch) => {
    set((s) => ({
      backgroundType: patch.type ?? s.backgroundType,
      backgroundUrl: patch.url ?? s.backgroundUrl,
      backgroundBlur: patch.blur ?? s.backgroundBlur,
      backgroundOpacity: patch.opacity ?? s.backgroundOpacity,
    }));
    const s = get();
    window.electron?.settings.set('backgroundType', s.backgroundType);
    window.electron?.settings.set('backgroundUrl', s.backgroundUrl);
    window.electron?.settings.set('backgroundBlur', s.backgroundBlur);
    window.electron?.settings.set('backgroundOpacity', s.backgroundOpacity);
    
    // Если установлена GIF или меняется URL при типе GIF, добавляем в последние гифки
    const isGifType = patch.type === 'gif' || s.backgroundType === 'gif';
    if (isGifType && patch.url) {
      get().addRecentGif(patch.url);
    }
  },

  discordRpcEnabled: true,
  setDiscordRpcEnabled: (enabled) => {
    set({ discordRpcEnabled: enabled });
    window.electron?.rpc.setEnabled(enabled);
  },

  obsWidgetEnabled: false,
  eqEnabled: false,
  eqGains: [0, 0, 0, 0, 0, 0, 0],
  setObsWidgetEnabled: (enabled) => {
    set({ obsWidgetEnabled: enabled });
    window.electron?.widget.setEnabled(enabled);
  },

  setEqEnabled: (enabled) => {
    set({ eqEnabled: enabled });
    window.electron?.settings.set('eqEnabled', enabled);
  },
  setEqGain: (index, gain) => {
    const gains = [...get().eqGains];
    gains[index] = gain;
    set({ eqGains: gains });
    window.electron?.settings.set('eqGains', gains);
  },

  widgetOverlayOpacity: 0.6,
  setWidgetOverlayOpacity: (v) => {
    set({ widgetOverlayOpacity: v });
    window.electron?.settings.set('widgetOverlayOpacity', v);
  },

  widgetBgBlur: 40,
  setWidgetBgBlur: (v) => {
    set({ widgetBgBlur: v });
    window.electron?.settings.set('widgetBgBlur', v);
  },

  widgetAccentColor: '#ff5500',
  setWidgetAccentColor: (v) => {
    set({ widgetAccentColor: v });
    window.electron?.settings.set('widgetAccentColor', v);
  },

  widgetBgType: 'artwork',
  setWidgetBgType: (v) => {
    set({ widgetBgType: v });
    window.electron?.settings.set('widgetBgType', v);
  },

  oauthToken: null,
  setOAuthToken: (token) => {
    set({ oauthToken: token });
    window.electron?.settings.set('oauthToken', token);
  },

  likedTrackIds: new Set<number>(),
  optimisticTracks: new Map<number, SCTrack>(),

  addServerLikedIds: (ids) => {
    const { likedTrackIds, allLikedIds } = get();
    const newSet = new Set(likedTrackIds);
    const newAllLiked = new Set(allLikedIds);
    for (const id of ids) {
      if (!touchedTrackIds.has(id)) {
        newSet.add(id);
        newAllLiked.add(id);
      }
    }
    set({ likedTrackIds: newSet, allLikedIds: newAllLiked });
    // Сохраняем в localStorage
    localStorage.setItem(ALL_LIKED_IDS_KEY, JSON.stringify([...newAllLiked]));
  },

  likedPlaylistIds: new Set<string | number>(),
  optimisticPlaylists: new Map<string | number, SCPlaylist>(),

  // Загружаем allLikedIds из localStorage при инициализации
  allLikedIds: (() => {
    try {
      const saved = localStorage.getItem(ALL_LIKED_IDS_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set<string | number>();
    } catch {
      return new Set<string | number>();
    }
  })(),

  addServerLikedPlaylistIds: (ids) => {
    const { likedPlaylistIds, allLikedIds } = get();
    const newSet = new Set(likedPlaylistIds);
    const newAllLiked = new Set(allLikedIds);
    for (const id of ids) {
      if (!touchedPlaylistIds.has(id)) {
        newSet.add(id);
        newAllLiked.add(id);
      }
    }
    set({ likedPlaylistIds: newSet, allLikedIds: newAllLiked });
    localStorage.setItem(ALL_LIKED_IDS_KEY, JSON.stringify([...newAllLiked]));
  },

  libraryPlaylists: [],
  addLibraryPlaylist: (playlist) => {
    set((s) => ({ libraryPlaylists: [...s.libraryPlaylists, playlist] }));
  },
  removeLibraryPlaylist: (playlistId: string | number) => {
    set((s) => ({ libraryPlaylists: s.libraryPlaylists.filter((p) => p.id !== playlistId && p.urn !== playlistId) }));
  },

  toggleLike: async (trackId, track) => {
    const { oauthToken, likedTrackIds, optimisticTracks, allLikedIds } = get();
    // Защита: id может прийти строкой через JSON (например из DataChannel в Listen Party)
    const numericId = typeof trackId === 'string' ? parseInt(trackId, 10) : trackId;
    if (!numericId || isNaN(numericId)) return;
    trackId = numericId;
    const wasLiked = likedTrackIds.has(trackId);

    touchedTrackIds.add(trackId);

    const newSet = new Set(likedTrackIds);
    const newOptimistic = new Map(optimisticTracks);
    const newAllLiked = new Set(allLikedIds);
    if (wasLiked) {
      newSet.delete(trackId);
      newOptimistic.delete(trackId);
      newAllLiked.delete(trackId);
    } else {
      newSet.add(trackId);
      if (track) newOptimistic.set(trackId, track);
      newAllLiked.add(trackId);
    }
    set({ likedTrackIds: newSet, optimisticTracks: newOptimistic, allLikedIds: newAllLiked });
    localStorage.setItem(ALL_LIKED_IDS_KEY, JSON.stringify([...newAllLiked]));

    if (oauthToken) {
      try {
        // Обычный трек - используем стандартный API
        if (wasLiked) await scAPI.unlikeTrack(trackId);
        else await scAPI.likeTrack(trackId);
      } catch (err) {
        console.error('[Like] SC API error:', err);
        // Откатываем изменения при ошибке
        set({ likedTrackIds, optimisticTracks, allLikedIds });
        localStorage.setItem(ALL_LIKED_IDS_KEY, JSON.stringify([...allLikedIds]));
      }
    }
  },
  isTrackLiked: (trackId) => get().likedTrackIds.has(trackId),

  togglePlaylistLike: async (playlistId, playlist) => {
    const { oauthToken, likedPlaylistIds, optimisticPlaylists, addLibraryPlaylist, removeLibraryPlaylist, allLikedIds } = get();
    const wasLiked = likedPlaylistIds.has(playlistId);

    touchedPlaylistIds.add(playlistId);

    const newSet = new Set(likedPlaylistIds);
    const newOptimistic = new Map(optimisticPlaylists);
    const newAllLiked = new Set(allLikedIds);
    if (wasLiked) {
      newSet.delete(playlistId);
      newOptimistic.delete(playlistId);
      newAllLiked.delete(playlistId);
      // Мгновенное удаление из Библиотеки
      removeLibraryPlaylist(playlistId);
    } else {
      newSet.add(playlistId);
      newAllLiked.add(playlistId);
      if (playlist) {
        newOptimistic.set(playlistId, playlist);
        // Мгновенное добавление в Библиотеку с нормализацией
        const normalizedPlaylist: SCPlaylist = {
          id: playlist.id,
          kind: 'playlist',
          permalink: playlist.permalink || '',
          permalink_url: playlist.permalink_url || '',
          title: playlist.title,
          description: playlist.description || '',
          duration: playlist.duration || 0,
          artwork_url: playlist.artwork_url || null,
          tracks: playlist.tracks || [],
          track_count: playlist.track_count || playlist.tracks?.length || 0,
          user: {
            id: playlist.user?.id || 0,
            kind: 'user',
            username: playlist.user?.username || 'Unknown',
            permalink: playlist.user?.permalink || '',
            permalink_url: playlist.user?.permalink_url || '',
            avatar_url: playlist.user?.avatar_url || '',
          },
          created_at: playlist.created_at || new Date().toISOString(),
          urn: playlist.urn,
          isSystemPlaylist: playlist.isSystemPlaylist || false,
        };
        addLibraryPlaylist(normalizedPlaylist);
      }
    }
    set({ likedPlaylistIds: newSet, optimisticPlaylists: newOptimistic, allLikedIds: newAllLiked });
    localStorage.setItem(ALL_LIKED_IDS_KEY, JSON.stringify([...newAllLiked]));

    if (oauthToken) {
      try {
        // Проверяем тип плейлиста по URN или ID
        const isSystemPlaylist = playlist?.urn?.startsWith('soundcloud:system-playlists:') || playlist?.isSystemPlaylist;

        if (isSystemPlaylist && playlist?.urn) {
          // Системный плейлист - используем специальный эндпоинт
          const userId = await scAPI.getCachedUserId();
          const urn = playlist.urn;
          const clientId = await scAPI.ensureClientId();
          const url = `https://api-v2.soundcloud.com/users/${userId}/system_playlist_likes/${urn}?client_id=${clientId}&app_version=1777028773&app_locale=en`;
          
          console.log('[Like] System playlist like request:', {
            userId,
            urn,
            clientId,
            method: wasLiked ? 'DELETE' : 'PUT',
            url
          });
          
          if (wasLiked) {
            await window.electron?.net.authenticatedRequest(url, 'DELETE', null, oauthToken);
          } else {
            await window.electron?.net.authenticatedRequest(url, 'PUT', null, oauthToken);
          }
        } else {
          // Обычный плейлист - используем authenticatedRequest через API методы
          console.log('[Like] Playlist like request:', {
            playlistId,
            method: wasLiked ? 'DELETE' : 'PUT'
          });
          
          if (wasLiked) {
            await scAPI.unlikePlaylist(playlistId as number);
          } else {
            await scAPI.likePlaylist(playlistId as number);
          }
        }
      } catch (err) {
        console.error('[Like] SC API error:', err);
        // Откатываем изменения при ошибке
        set({ likedPlaylistIds, optimisticPlaylists, allLikedIds });
        if (!wasLiked && playlist) {
          removeLibraryPlaylist(playlistId);
        } else if (playlist) {
          addLibraryPlaylist(playlist);
        }
        localStorage.setItem(ALL_LIKED_IDS_KEY, JSON.stringify([...allLikedIds]));
      }
    }
  },
  isPlaylistLiked: (playlistId, playlistUrn) => {
    const state = get();
    // Универсальная проверка: сначала по URN (для системных плейлистов), затем по ID
    if (playlistUrn && state.likedPlaylistIds.has(playlistUrn)) return true;
    return state.likedPlaylistIds.has(playlistId);
  },
  syncLikedPlaylists: (playlists: any[]) => {
    const state = get();
    const newLikedIds = new Set(state.likedPlaylistIds);
    const newAllLiked = new Set(state.allLikedIds);
    
    // Добавляем все плейлисты с типом system-playlist-like и playlist-like
    playlists.forEach(item => {
      if (item.type === 'system-playlist-like' || item.type === 'playlist-like') {
        const data = item.playlist || item.system_playlist;
        if (data) {
          // Для системных плейлистов используем URN, для обычных - ID
          if (item.type === 'system-playlist-like' && data.urn) {
            newLikedIds.add(data.urn);
            newAllLiked.add(data.urn);
          } else if (data.id) {
            newLikedIds.add(data.id);
            newAllLiked.add(data.id);
          }
        }
      }
    });
    
    set({ likedPlaylistIds: newLikedIds, allLikedIds: newAllLiked });
    localStorage.setItem(ALL_LIKED_IDS_KEY, JSON.stringify([...newAllLiked]));
  },

  isLiked: (id, urn) => {
    const state = get();
    // Универсальная проверка: сначала по URN (для системных плейлистов), затем по ID
    if (urn && state.allLikedIds.has(urn)) return true;
    return state.allLikedIds.has(id);
  },

  // Последние гифки (хранятся последние 10)
  recentGifs: [],
  addRecentGif: (url) => {
    const current = get().recentGifs;
    // Удаляем дубликаты и добавляем новую гифку в начало
    const filtered = current.filter(g => g !== url);
    const newGifs = [url, ...filtered].slice(0, 10);
    set({ recentGifs: newGifs });
    localStorage.setItem('recentGifs', JSON.stringify(newGifs));
  },
  clearRecentGifs: () => {
    set({ recentGifs: [] });
    localStorage.setItem('recentGifs', JSON.stringify([]));
  },

  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => {
    const newState = !get().sidebarCollapsed;
    set({ sidebarCollapsed: newState });
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newState));
  },

  // Производительность
  freezeHoverOnScroll: false,
  setFreezeHoverOnScroll: (v) => {
    set({ freezeHoverOnScroll: v });
    localStorage.setItem('freezeHoverOnScroll', JSON.stringify(v));
  },


  hydrated: false,
  hydrate: async () => {
    if (!window.electron) {
      // Работаем в браузере без Electron — пропускаем
      const theme = BUILT_IN_THEMES[0];
      applyTheme(theme);
      set({ hydrated: true });
      return;
    }

    const all = (await window.electron.settings.getAll()) as Record<string, unknown>;

    // oauthToken хранится в safeStorage и не входит в getAll() — читаем отдельно
    const oauthToken = (await window.electron.settings.get('oauthToken') as string | null) ?? null;

    // Восстанавливаем кастомные темы
    const customMap = (all.customThemes ?? {}) as Record<string, Theme>;
    const customThemes = Object.values(customMap);

    const themes = [...BUILT_IN_THEMES, ...customThemes];
    const activeThemeId = (all.activeTheme as string) ?? 'midnight';
    const activeTheme = themes.find((t) => t.id === activeThemeId) ?? BUILT_IN_THEMES[0];
    applyTheme(activeTheme);

    // Восстанавливаем последние гифки
    const recentGifsStr = localStorage.getItem('recentGifs');
    const recentGifs = recentGifsStr ? JSON.parse(recentGifsStr) as string[] : [];

    // Восстанавливаем состояние sidebar
    const sidebarCollapsedStr = localStorage.getItem('sidebarCollapsed');
    const sidebarCollapsed = sidebarCollapsedStr ? JSON.parse(sidebarCollapsedStr) as boolean : false;



    set({
      themes,
      activeThemeId: activeTheme.id,
      backgroundType: (all.backgroundType as BackgroundType) ?? 'none',
      backgroundUrl: (all.backgroundUrl as string) ?? '',
      backgroundBlur: (all.backgroundBlur as number) ?? 0,
      backgroundOpacity: (all.backgroundOpacity as number) ?? 1,
      discordRpcEnabled: (all.discordRpcEnabled as boolean) ?? true,
      obsWidgetEnabled: (all.obsWidgetEnabled as boolean) ?? false,
      eqEnabled: (all.eqEnabled as boolean) ?? false,
      eqGains: (all.eqGains as number[]) ?? [0, 0, 0, 0, 0, 0, 0],
      widgetOverlayOpacity: (all.widgetOverlayOpacity as number) ?? 0.6,
      widgetBgBlur: (all.widgetBgBlur as number) ?? 40,
      widgetAccentColor: (all.widgetAccentColor as string) ?? '#ff5500',
      widgetBgType: (all.widgetBgType as 'artwork' | 'blur') ?? 'artwork',
      oauthToken,
      recentGifs,
      sidebarCollapsed,
      freezeHoverOnScroll: (() => {
        const s = localStorage.getItem('freezeHoverOnScroll');
        return s !== null ? JSON.parse(s) : false;
      })(),
      hydrated: true,
    });

    // Загружаем лайкнутые плейлисты для инициализации likedPlaylists
    if (oauthToken) {
      // Передаём токен в API — без этого все запросы будут анонимными
      scAPI.setOAuthToken(oauthToken);
      try {
        const libraryData = await scAPI.getLibraryAll(50);
        if (libraryData.collection) {
          get().syncLikedPlaylists(libraryData.collection);
          console.log('[UI] Synced liked playlists from library on hydrate');
        }

        // Загружаем лайкнутые треки для инициализации likedTrackIds
        const trackLikesData = await scAPI.getTrackLikes(50);
        if (trackLikesData && trackLikesData.collection) {
          const trackIds = trackLikesData.collection.map((item: any) => item.track?.id).filter(Boolean);
          get().addServerLikedIds(trackIds);
          console.log('[UI] Synced liked tracks from API on hydrate:', trackIds.length);
        }
      } catch (err) {
        console.error('[UI] Failed to sync liked data on hydrate:', err);
      }
    }
  },
}));
