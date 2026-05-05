import { Library, Heart, Radio, Lock, ArrowLeft, Play, Pause, User, Clock, Disc, ListMusic } from 'lucide-react';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { scAPI } from '@/api/soundcloud';
import type { SCTrack, SCPlaylist, SCUser } from '@/types/soundcloud';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { usePageCacheStore } from '@/store/pageCache';
import { formatTime, hiResArtwork, formatCount, cn } from '@/utils/format';
import { PageHeader, EmptyState, TrackCardSkeleton } from '@/components/common/UI';
import { TrackCard } from '@/components/player/TrackCard';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useInfiniteGrid } from '@/hooks/useInfiniteGrid';

import { useT } from '@/store/i18n';

const PAGE_CACHE_TTL_MS = 10 * 60 * 1000;

// Calculate dynamic limit based on current window width before grid mounts
function calcInitialLimit(): number {
  const minCardWidth = 180;
  const gap = 20;
  const padding = 32;
  const cols = Math.floor((window.innerWidth - padding + gap) / (minCardWidth + gap));
  return Math.max(cols * 6, 30);
}

function AuthGate({ title, description }: { title: string; description: string }) {
  const t = useT();
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState
        icon={<Lock size={40} />}
        title={t('auth_required')}
        description={description}
      />
    </div>
  );
}

export function FeedPage() {
  const oauthToken = useUIStore((s) => s.oauthToken);
  const setQueueLoader = usePlayerStore((s) => s.setQueueLoader);
  const t = useT();
  const [tracks, setTracks] = useState<SCTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [excludeReposts, setExcludeReposts] = useState(() => {
    const saved = localStorage.getItem('hideReposts');
    return saved === 'true';
  });
  // Курсорная пагинация: /stream не принимает числовой offset, нужен next_href.
  const [nextHref, setNextHref] = useState<string | null>(null);
  const gridClassName = 'main-grid-layout';
  const PAGE_SIZE = 54;

  const hasMore = Boolean(nextHref);

  const loadMoreTracks = useCallback(async () => {
    if (!oauthToken || !nextHref || loadingMore) return;
    setLoadingMore(true);
    try {
      // Preserve activityTypes in pagination if in excludeReposts mode
      let paginationUrl = nextHref;
      if (excludeReposts && !paginationUrl.includes('activityTypes')) {
        const separator = paginationUrl.includes('?') ? '&' : '?';
        paginationUrl += `${separator}activityTypes=TrackPost,PlaylistPost`;
      }

      const stream = await scAPI.fetchNext<{ track?: SCTrack; playlist?: SCPlaylist; type?: string }>(paginationUrl);
      const streamTracks = stream.collection
        .map((item: any) => item.track)
        .filter(Boolean);

      setTracks((prev) => {
        const existing = new Set(prev.map((t) => t.id));
        return [...prev, ...streamTracks.filter((t: SCTrack) => !existing.has(t.id))];
      });
      setNextHref(stream.next_href);
    } catch (err) {
      console.error('Ошибка загрузки дополнительных треков ленты:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [oauthToken, nextHref, excludeReposts, loadingMore]);

  const { sentinelRef, gridRef, skeletonCount, initialSkeletonCount } = useInfiniteGrid({
    loading,
    loadingMore,
    hasMore,
    items: tracks,
    onLoadMore: loadMoreTracks,
  });

  // Регистрируем loader для подгрузки очереди из player когда трек в конце страницы
  const nextHrefRef = useRef(nextHref);
  nextHrefRef.current = nextHref;
  const oauthTokenRef = useRef(oauthToken);
  oauthTokenRef.current = oauthToken;
  const excludeRepostsRef = useRef(excludeReposts);
  excludeRepostsRef.current = excludeReposts;
  useEffect(() => {
    setQueueLoader(async () => {
      const href = nextHrefRef.current;
      if (!href || !oauthTokenRef.current) return [];
      let paginationUrl = href;
      if (excludeRepostsRef.current && !paginationUrl.includes('activityTypes')) {
        const separator = paginationUrl.includes('?') ? '&' : '?';
        paginationUrl += `${separator}activityTypes=TrackPost,PlaylistPost`;
      }
      const stream = await scAPI.fetchNext<{ track?: SCTrack; playlist?: SCPlaylist; type?: string }>(paginationUrl);
      const newTracks = stream.collection.map((item: any) => item.track).filter(Boolean) as SCTrack[];
      setTracks((prev) => {
        const existing = new Set(prev.map((t) => t.id));
        return [...prev, ...newTracks.filter((t) => !existing.has(t.id))];
      });
      setNextHref(stream.next_href);
      return newTracks;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setQueueLoader]);

  // Save toggle to localStorage
  useEffect(() => {
    localStorage.setItem('hideReposts', String(excludeReposts));
  }, [excludeReposts]);

  const handleToggleChange = (newValue: boolean) => {
    setExcludeReposts(newValue);
    setTracks([]);
    setNextHref(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const cacheKey = `page:feed:${excludeReposts ? 'no-reposts' : 'all'}`;
    const cached = usePageCacheStore.getState().getPageCache<{
      tracks: SCTrack[];
      nextHref: string | null;
    }>(cacheKey, PAGE_CACHE_TTL_MS);
    if (cached) {
      setTracks(cached.tracks);
      setNextHref(cached.nextHref ?? null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      if (!oauthToken) return;

      setLoading(true);
      setError(null);
      setNextHref(null);

      try {
        // Get userId dynamically from API
        const userId = await scAPI.getCachedUserId();
        
        if (!userId) {
          throw new Error('User ID not found - please authenticate first');
        }
        
        // Use separate feed methods based on excludeReposts state
        const limit = calcInitialLimit();
        let response;
        if (excludeReposts) {
          response = await window.electron?.feed.hideReposts(userId, limit);
        } else {
          response = await window.electron?.feed.loadInitial(userId, limit);
        }

        if (!response || !response.ok) {
          const errorMsg = response?.error || response?.statusText || 'Unknown error';
          throw new Error(`Failed to fetch stream: ${response?.status} ${errorMsg}`);
        }

        const stream = JSON.parse(response.body);
        const streamTracks = stream.collection
          .map((item: any) => item.track)
          .filter(Boolean);

        if (!cancelled) {
          setTracks(streamTracks);
          setNextHref(stream.next_href);
          usePageCacheStore.getState().setPageCache(cacheKey, {
            tracks: streamTracks,
            nextHref: stream.next_href,
          });
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [oauthToken, excludeReposts]);

  if (!oauthToken) {
    return (
      <AuthGate
        title={t('feed_title')}
        description={t('feed_auth_desc')}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title={t('feed_title')} subtitle={t('feed_subtitle')} />
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-dim">{t('feed_hide_reposts')}</span>
          <button
            onClick={() => handleToggleChange(!excludeReposts)}
            className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${excludeReposts ? 'bg-accent' : 'bg-surface-alt'}`}
            aria-label="Toggle reposts"
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-300 ${excludeReposts ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>
      {error && <EmptyState title={t('error')} description={error} />}

      {!error && (
        loading ? (
          <div className={gridClassName} ref={gridRef}>
            {Array.from({ length: initialSkeletonCount }).map((_, i) => <TrackCardSkeleton key={`feed-skeleton-${i}`} />)}
          </div>
        ) : (
          <>
            <div key={`feed-grid-${excludeReposts}`} className={`${gridClassName} animate-slide-up`} ref={gridRef}>
              {tracks.map((track, i) => (
                <TrackCard key={track.id} track={track} queue={tracks} index={i} />
              ))}
              {loadingMore && Array.from({ length: skeletonCount }).map((_, i) => <TrackCardSkeleton key={`feed-more-${i}`} />)}
            </div>
            {hasMore && <div ref={sentinelRef} className="h-4" />}
          </>
        )
      )}
    </div>
  );
}

export function LibraryPage() {
  const navigate = useNavigate();
  const oauthToken = useUIStore((s) => s.oauthToken);
  const t = useT();
  const libraryPlaylists = useUIStore((s) => s.libraryPlaylists);
  const syncLikedPlaylists = useUIStore((s) => s.syncLikedPlaylists);
  const [playlists, setPlaylists] = useState<SCPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const skeletonItems = useMemo(() => {
    const minCardWidth = 180;
    const gap = 20;
    const padding = 32;
    const cols = Math.max(1, Math.floor((window.innerWidth - padding + gap) / (minCardWidth + gap)));
    const rows = Math.ceil((window.innerHeight - 200) / (220 + gap)) + 1;
    return Array.from({ length: cols * rows });
  }, []);

  useEffect(() => {
    const cacheKey = 'page:library';
    const cached = usePageCacheStore.getState().getPageCache<SCPlaylist[]>(cacheKey, PAGE_CACHE_TTL_MS);
    if (cached) {
      setPlaylists(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      if (!oauthToken) return;

      setLoading(true);
      setError(null);

      try {
        // Используем один эндпоинт /me/library/all
        const libraryData = await scAPI.getLibraryAll(50);

        // Синхронизируем likedPlaylists с загруженными данными
        syncLikedPlaylists(libraryData.collection || []);

        // Фильтруем только плейлисты (type содержит 'playlist')
        const playlistItems = (libraryData.collection || []).filter((item: any) => 
          item.type && item.type.includes('playlist')
        );

        // Нормализуем данные с защитной проверкой
        const allPlaylists = playlistItems
          .map((item: any): SCPlaylist | null => {
            // Универсальная распаковка
            const data = item.playlist || item.system_playlist;

            // Если оба undefined - пропускаем элемент
            if (!data) {
              console.warn('[LibraryPage] Skipping item without data:', item);
              return null;
            }

            // Проверка на существование id
            if (!data.id) {
              console.warn('[LibraryPage] Skipping item without id:', item);
              return null;
            }

            const isSystem = item.type === 'system-playlist-like';
            const isLikedPlaylist = item.type === 'playlist-like';

            return {
              id: data.id,
              kind: data.kind || 'playlist',
              permalink: data.permalink || '',
              permalink_url: data.permalink_url || '',
              // Для системных плейлистов используем short_title, для обычных - title
              title: isSystem ? (data.short_title || data.title) : data.title,
              description: isSystem ? (data.short_description || '') : (data.description || ''),
              duration: data.duration || 0,
              // Для системных плейлистов используем calculated_artwork_url, для обычных пробуем все источники
              artwork_url: (() => {
                if (isSystem) {
                  return data.calculated_artwork_url || data.artwork_url || null;
                }
                // 1. Прямая обложка плейлиста
                if (data.artwork_url) return data.artwork_url;
                if (data.calculated_artwork_url) return data.calculated_artwork_url;
                // 2. Обложка одного из первых треков (как в оригинальном SC)
                const tracks = (data.tracks as any[]) || [];
                for (let i = Math.min(4, tracks.length - 1); i >= 0; i--) {
                  if (tracks[i]?.artwork_url) return tracks[i].artwork_url;
                }
                // 3. Аватар владельца (финальный фолбек — SC тоже так делает)
                if (data.user?.avatar_url) return data.user.avatar_url;
                return null;
              })(),
              tracks: data.tracks || [],
              track_count: data.track_count || data.tracks?.length || 0,
              user: {
                id: data.user?.id || 0,
                kind: 'user',
                // Для системных плейлистов используем short_description как автора, для обычных - user.username
                username: isSystem ? (data.short_description || 'SoundCloud') : (data.user?.username || 'Unknown'),
                permalink: data.user?.permalink || '',
                permalink_url: data.user?.permalink_url || '',
                avatar_url: data.user?.avatar_url || null,
              },
              created_at: data.created_at || new Date().toISOString(),
              urn: data.urn,
              // playlist-like - чужие лайкнутые плейлисты (обычные), system-playlist-like - наши стены (системные)
              isSystemPlaylist: isSystem,
            };
          })
          .filter((playlist): playlist is SCPlaylist => playlist !== null);

        // Сортируем по created_at (новые в начале)
        allPlaylists.sort((a, b) => {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          return dateB - dateA;
        });

        if (!cancelled) {
          setPlaylists(allPlaylists);
          usePageCacheStore.getState().setPageCache(cacheKey, allPlaylists);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [oauthToken]);

  // Объединяем загруженные плейлисты с плейлистами из ui store для мгновенных обновлений
  const mergedPlaylists = useMemo(() => {
    if (loading) return playlists;
    
    // Создаем Map для быстрого поиска по id
    const playlistsMap = new Map(playlists.map(p => [p.id, p]));
    
    // Добавляем плейлисты из ui store, которых нет в загруженных
    libraryPlaylists.forEach(p => {
      if (!playlistsMap.has(p.id)) {
        playlistsMap.set(p.id, p);
      }
    });
    
    // Преобразуем обратно в массив и сортируем по created_at (новые в начале)
    const result = Array.from(playlistsMap.values());
    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return result;
  }, [playlists, libraryPlaylists, loading]);

  if (!oauthToken) {
    return (
      <AuthGate
        title={t('library_auth_title')}
        description={t('library_auth_desc')}
      />
    );
  }

  if (error) {
    return <EmptyState title={t('error_loading')} description={error} />;
  }

  return (
    <div>
      <PageHeader title={t('library_title')} subtitle={t('library_subtitle')} />

      <div className={loading ? 'main-grid-layout' : 'main-grid-layout animate-fade-in-only'}>
        {loading
          ? skeletonItems.map((_, i) => <TrackCardSkeleton key={`library-skeleton-${i}`} />)
          : mergedPlaylists.map((playlist) => (
              <TrackCard key={playlist.urn || playlist.id} track={playlist as any} />
            ))}
      </div>
    </div>
  );
}

const LIKES_CACHE_TTL_MS = 5 * 60 * 1000;

type ServerLikeItem = { created_at: string; track: SCTrack };

export function LikesPage() {
  const oauthToken = useUIStore((s) => s.oauthToken);
  const setQueueLoader = usePlayerStore((s) => s.setQueueLoader);
  const t = useT();
  const likedTrackIds = useUIStore((s) => s.likedTrackIds);
  const optimisticTracks = useUIStore((s) => s.optimisticTracks);
  const addServerLikedIds = useUIStore((s) => s.addServerLikedIds);

  const [serverLikes, setServerLikes] = useState<ServerLikeItem[]>([]);
  const [apiNextHref, setApiNextHref] = useState<string | null>(null);

  // Exit animation: separate from main render so displayedTracks is always the source of truth
  const [exitItems, setExitItems] = useState<Set<number>>(new Set());
  const allTracksRef = useRef<Map<number, SCTrack>>(new Map());
  const prevDisplayedIdsRef = useRef<Set<number>>(new Set());
  const exitTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gridClassName = 'main-grid-layout';
  const hasMore = Boolean(apiNextHref);

  const parseLikesCollection = (collection: Array<any>): ServerLikeItem[] =>
    collection.filter((i) => Boolean(i.track)).map((i) => ({ created_at: i.created_at, track: i.track as SCTrack }));

  // Серверные лайки (фильтруем unliked) + optimistic треки не подтверждённые сервером
  const displayedTracks = useMemo(() => {
    const serverIds = new Set(serverLikes.map((i) => i.track.id));
    const combined: Array<{ track: SCTrack; ts: number }> = [];

    for (const item of serverLikes) {
      if (!likedTrackIds.has(item.track.id)) continue;
      const ts = item.created_at ? Date.parse(item.created_at) : 0;
      combined.push({ track: item.track, ts: Number.isFinite(ts) ? ts : 0 });
    }

    for (const [id, track] of optimisticTracks) {
      if (!serverIds.has(id) && likedTrackIds.has(id)) {
        combined.push({ track, ts: Date.now() });
      }
    }

    combined.sort((a, b) => b.ts - a.ts);
    return combined.map((x) => x.track);
  }, [serverLikes, likedTrackIds, optimisticTracks]);

  const loadMore = useCallback(async () => {
    if (!oauthToken || !apiNextHref) return;
    setLoadingMore(true);
    try {
      const res = await scAPI.fetchNext<any>(apiNextHref);
      const fresh = parseLikesCollection(res.collection);
      setServerLikes((prev) => {
        const existing = new Set(prev.map((i) => i.track.id));
        return [...prev, ...fresh.filter((i) => !existing.has(i.track.id))];
      });
      setApiNextHref(res.next_href);
      addServerLikedIds(fresh.map((i) => i.track.id));
    } catch (err) {
      console.error('[LikesPage] Ошибка догрузки лайков:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [oauthToken, apiNextHref, addServerLikedIds]);

  const { sentinelRef: likesGridSentinel, gridRef: likesGridRef, skeletonCount: likesSkeletonCount, initialSkeletonCount: likesInitialSkeletonCount } = useInfiniteGrid({
    loading,
    loadingMore,
    hasMore,
    items: displayedTracks,
    onLoadMore: loadMore,
  });


  const apiNextHrefRef = useRef(apiNextHref);
  apiNextHrefRef.current = apiNextHref;
  const oauthTokenRef = useRef(oauthToken);
  oauthTokenRef.current = oauthToken;
  useEffect(() => {
    setQueueLoader(async () => {
      const href = apiNextHrefRef.current;
      if (!href || !oauthTokenRef.current) return [];
      const res = await scAPI.fetchNext<any>(href);
      const fresh = parseLikesCollection(res.collection);
      setServerLikes((prev) => {
        const existing = new Set(prev.map((i) => i.track.id));
        return [...prev, ...fresh.filter((i) => !existing.has(i.track.id))];
      });
      setApiNextHref(res.next_href);
      addServerLikedIds(fresh.map((i) => i.track.id));
      return fresh.map((i) => i.track);
    });
    // Не сбрасываем queueLoader при размонтировании — пользователь мог уйти
    // на другую вкладку пока играют треки из лайков. Loader сбросится сам
    // когда playTrack запустит новую очередь (index === 0 → queueLoader: null)
    // или когда страница снова смонтируется и переустановит свой loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setQueueLoader, addServerLikedIds]);
  useEffect(() => {
    const currentIds = new Set(displayedTracks.map((t) => t.id));
    // Update data cache for all currently visible tracks
    displayedTracks.forEach((t) => allTracksRef.current.set(t.id, t));
    // Detect removed tracks
    const removed = [...prevDisplayedIdsRef.current].filter((id) => !currentIds.has(id));
    prevDisplayedIdsRef.current = currentIds;
    if (removed.length === 0) return;
    setExitItems((prev) => new Set([...prev, ...removed]));
    removed.forEach((id) => {
      const existing = exitTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setExitItems((prev) => { const n = new Set(prev); n.delete(id); return n; });
        allTracksRef.current.delete(id);
        exitTimersRef.current.delete(id);
      }, 340);
      exitTimersRef.current.set(id, timer);
    });
  }, [displayedTracks]);

  useEffect(() => {
    if (!oauthToken) { setLoading(false); return; }

    const cacheKey = 'page:likes';
    const cached = usePageCacheStore.getState().getPageCache<{
      serverLikes: ServerLikeItem[];
      apiNextHref: string | null;
    }>(cacheKey, LIKES_CACHE_TTL_MS);

    if (cached) {
      setServerLikes(cached.serverLikes);
      setApiNextHref(cached.apiNextHref);
      addServerLikedIds(cached.serverLikes.map((i) => i.track.id));
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const me = await scAPI.getMe();
        if (cancelled) return;
        const res = await scAPI.getUserLikes(me.id, calcInitialLimit(), 0);
        if (cancelled) return;
        const fresh = parseLikesCollection(res.collection)
          .slice()
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        setServerLikes(fresh);
        setApiNextHref(res.next_href);
        addServerLikedIds(fresh.map((i) => i.track.id));
        usePageCacheStore.getState().setPageCache(cacheKey, {
          serverLikes: fresh,
          apiNextHref: res.next_href,
        });
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [oauthToken]);

  return (
    <div>
      <PageHeader title={t('likes_title')} subtitle={t('likes_subtitle')} />
      {error && <EmptyState title={t('error')} description={error} />}

      {!loading && !error && displayedTracks.length === 0 && exitItems.size === 0 && (
        <EmptyState
          icon={<Heart size={40} />}
          title={t('likes_empty_title')}
          description={t('likes_empty_desc')}
        />
      )}

      {!error && loading && (
        <div className={gridClassName} ref={likesGridRef}>
          {Array.from({ length: likesInitialSkeletonCount }).map((_, i) => (
            <TrackCardSkeleton key={`likes-skeleton-${i}`} />
          ))}
        </div>
      )}

      {!loading && !error && (displayedTracks.length > 0 || exitItems.size > 0) && (
        <>
          <div className={`${gridClassName} animate-slide-up`} ref={likesGridRef}>
            {displayedTracks.map((track, i) => (
              <TrackCard key={track.id} track={track} queue={displayedTracks} index={i} />
            ))}
            {[...exitItems].map((id) => {
              const t = allTracksRef.current.get(id);
              if (!t) return null;
              return (
                <div key={`exit-${id}`} className="card-exit">
                  <TrackCard track={t} />
                </div>
              );
            })}
            {loadingMore && Array.from({ length: likesSkeletonCount }).map((_, i) => <TrackCardSkeleton key={`likes-more-${i}`} />)}
          </div>
          {hasMore && <div ref={likesGridSentinel} className="h-4" />}
        </>
      )}
    </div>
  );
}
