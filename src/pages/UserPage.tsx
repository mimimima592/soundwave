import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Users, Heart, Clock, Play, Pause, ListMusic } from 'lucide-react';
import { scAPI } from '@/api/soundcloud';
import type { SCTrack, SCPlaylist, SCUser } from '@/types/soundcloud';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { usePageCacheStore } from '@/store/pageCache';
import { formatTime, hiResArtwork, formatCount, cn } from '@/utils/format';
import { Spinner, EmptyState, TrackRow, RowSkeleton, TabBar, CoverHeaderSkeleton, CardSkeleton, UserHeaderSkeleton } from '@/components/common/UI';
import { TrackCard } from '@/components/player/TrackCard';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useScrollContainer } from '@/contexts/ScrollContainerContext';
import { useT } from '@/store/i18n';

const USER_CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE_SIZE = 50;

type Tab = 'all' | 'tracks' | 'playlists' | 'likes' | 'popular';

// Серверный лайк приходит в виде { created_at, track }. Храним created_at,
// чтобы мерджить с локальными лайками по общей шкале timestamp'ов.
type ServerLikeItem = { created_at: string; track: SCTrack };

export function UserPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const oauthToken = useUIStore((s) => s.oauthToken);
  const toggleLike = useUIStore((s) => s.toggleLike);
  const likedTrackIds = useUIStore((s) => s.likedTrackIds);
  const optimisticTracks = useUIStore((s) => s.optimisticTracks);
  const addServerLikedIds = useUIStore((s) => s.addServerLikedIds);
  const setQueueLoader = usePlayerStore((s) => s.setQueueLoader);
  const t = useT();

  const [user, setUser] = useState<SCUser | null>(null);
  const [tracks, setTracks] = useState<SCTrack[]>([]);
  const [topTracks, setTopTracks] = useState<SCTrack[]>([]);
  const [topTracksLoading, setTopTracksLoading] = useState(false);
  const [playlists, setPlaylists] = useState<SCPlaylist[]>([]);
  const [serverLikes, setServerLikes] = useState<ServerLikeItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [removingTrackId, setRemovingTrackId] = useState<number | null>(null);

  // Статус подписки — из глобального стора (надёжнее чем checkFollowing API)
  const followingUserIds = useUIStore((s) => s.followingUserIds);
  const setFollowingUserIds = useUIStore((s) => s.setFollowingUserIds);
  const isFollowing = user ? followingUserIds.has(user.id) : false;
  // Курсорная пагинация: числовой offset /users/:id/likes не принимает,
  // а /users/:id/tracks для единообразия тоже ведём через next_href.
  const [tracksNextHref, setTracksNextHref] = useState<string | null>(null);
  const [likesNextHref, setLikesNextHref] = useState<string | null>(null);

  const hasMoreTracks = Boolean(tracksNextHref);
  const hasMoreLikes = Boolean(likesNextHref);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  // Если id не указан, используем текущего авторизованного пользователя
  const userId = id ? Number(id) : null;
  const isCurrentUser = !id;

  const scrollContainer = useScrollContainer();

  // Навигация к пользователю: если это текущая страница — скроллим вверх
  const navigateToUser = useCallback((targetUserId: number) => {
    if (user && targetUserId === user.id) {
      scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate(`/user/${targetUserId}`);
    }
  }, [user, navigate, scrollContainer]);

  // Решается после получения данных профиля: локальные лайки добавляются только
  // если пользователь смотрит СВОЙ профиль.
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  // Серверные лайки + optimistic треки на своём профиле.
  // На чужом профиле — просто показываем все серверные лайки без фильтрации по likedTrackIds.
  // На своём профиле — фильтруем unliked (убранные оптимистично) и добавляем optimistic треки.
  const likes = useMemo<SCTrack[]>(() => {
    const serverIds = new Set(serverLikes.map((i) => i.track.id));
    const combined: Array<{ track: SCTrack; ts: number }> = [];

    for (const item of serverLikes) {
      if (isOwnProfile && !likedTrackIds.has(item.track.id)) continue;
      const ts = item.created_at ? Date.parse(item.created_at) : 0;
      combined.push({ track: item.track, ts: Number.isFinite(ts) ? ts : 0 });
    }
    if (isOwnProfile) {
      for (const [id, track] of optimisticTracks) {
        if (!serverIds.has(id) && likedTrackIds.has(id)) {
          combined.push({ track, ts: Date.now() });
        }
      }
    }

    combined.sort((a, b) => b.ts - a.ts);
    return combined.map((x) => x.track);
  }, [serverLikes, optimisticTracks, likedTrackIds, isOwnProfile]);

  const loadMoreTracks = useCallback(async () => {
    if (!user || loadingMore || !tracksNextHref) return;

    setLoadingMore(true);
    try {
      const tracksData = await scAPI.fetchNext<SCTrack>(tracksNextHref);
      const newTracks = tracksData.collection;

      setTracks((prev) => {
        const existing = new Set(prev.map((t) => t.id));
        return [...prev, ...newTracks.filter((t: SCTrack) => !existing.has(t.id))];
      });
      setTracksNextHref(tracksData.next_href);
    } catch (err) {
      console.error('Ошибка загрузки дополнительных треков:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [user, loadingMore, tracksNextHref]);

  const loadMoreLikes = useCallback(async () => {
    if (!user || loadingMore || !likesNextHref) return;

    setLoadingMore(true);
    try {
      const likesData = await scAPI.fetchNext<{ created_at: string; track?: SCTrack }>(likesNextHref);
      const fresh: ServerLikeItem[] = likesData.collection
        .filter((i: any) => Boolean(i.track))
        .map((i: any) => ({ created_at: i.created_at, track: i.track as SCTrack }));

      setServerLikes((prev) => {
        const existing = new Set(prev.map((i) => i.track.id));
        return [...prev, ...fresh.filter((i) => !existing.has(i.track.id))];
      });
      setLikesNextHref(likesData.next_href);
      // Добавляем лайки в глобальный список только если это собственный профиль
      if (isOwnProfile) {
        addServerLikedIds(fresh.map((i) => i.track.id));
      }
    } catch (err) {
      console.error('Ошибка загрузки дополнительных лайков:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [user, loadingMore, likesNextHref, isOwnProfile, addServerLikedIds]);

  const tracksLoadMoreRef = useInfiniteScroll(
    useCallback(() => {
      // Инфинит-скролл треков работает только на вкладке Tracks.
      // На вкладке All там превью из 5 штук с кнопкой "Смотреть все".
      if (activeTab === 'tracks') {
        loadMoreTracks();
      }
    }, [activeTab, loadMoreTracks]),
    { enabled: true }
  );

  const likesLoadMoreRef = useInfiniteScroll(
    useCallback(() => {
      if (activeTab === 'likes') {
        loadMoreLikes();
      }
    }, [activeTab, loadMoreLikes]),
    { enabled: true }
  );

  // Регистрируем queueLoader в зависимости от активной вкладки и текущего nextHref
  const tracksNextHrefRef = useRef(tracksNextHref);
  tracksNextHrefRef.current = tracksNextHref;
  const likesNextHrefRef = useRef(likesNextHref);
  likesNextHrefRef.current = likesNextHref;

  useEffect(() => {
    if (activeTab === 'tracks' && tracksNextHref) {
      setQueueLoader(async () => {
        const href = tracksNextHrefRef.current;
        if (!href) return [];
        const data = await scAPI.fetchNext<SCTrack>(href);
        const newTracks = data.collection;
        setTracks((prev) => {
          const existing = new Set(prev.map((t) => t.id));
          return [...prev, ...newTracks.filter((t: SCTrack) => !existing.has(t.id))];
        });
        setTracksNextHref(data.next_href);
        return newTracks;
      });
    } else if (activeTab === 'likes' && likesNextHref) {
      setQueueLoader(async () => {
        const href = likesNextHrefRef.current;
        if (!href) return [];
        const data = await scAPI.fetchNext<{ created_at: string; track?: SCTrack }>(href);
        const fresh: { created_at: string; track: SCTrack }[] = data.collection
          .filter((i: any) => Boolean(i.track))
          .map((i: any) => ({ created_at: i.created_at, track: i.track as SCTrack }));
        setServerLikes((prev) => {
          const existing = new Set(prev.map((i) => i.track.id));
          return [...prev, ...fresh.filter((i) => !existing.has(i.track.id))];
        });
        setLikesNextHref(data.next_href);
        if (isOwnProfile) addServerLikedIds(fresh.map((i) => i.track.id));
        return fresh.map((i) => i.track);
      });
    } else {
      setQueueLoader(null);
    }
    return () => setQueueLoader(null);
  }, [activeTab, tracksNextHref, likesNextHref, isOwnProfile, setQueueLoader, addServerLikedIds]);

  useEffect(() => {
    if (!oauthToken) {
      setError(t('user_auth_error'));
      setLoading(false);
      return;
    }

    const cacheKey = `page:user:${isCurrentUser ? 'me' : userId}`;
    const cached = usePageCacheStore.getState().getPageCache<{
      user: SCUser;
      tracks: SCTrack[];
      playlists: SCPlaylist[];
      serverLikes: ServerLikeItem[];
      tracksNextHref: string | null;
      likesNextHref: string | null;
      isOwnProfile: boolean;
    }>(cacheKey, USER_CACHE_TTL_MS);

    let cancelled = false;

    const parseLikesCollection = (
      collection: Array<{ created_at: string; track?: SCTrack }>
    ): ServerLikeItem[] =>
      collection
        .filter((i) => Boolean(i.track))
        .map((i) => ({ created_at: i.created_at, track: i.track as SCTrack }));

    // --- Путь A: есть кеш страницы ---
    if (cached) {
      setUser(cached.user);
      setTracks(cached.tracks);
      setPlaylists(cached.playlists);
      setServerLikes(cached.serverLikes);
      setTracksNextHref(cached.tracksNextHref ?? null);
      setLikesNextHref(cached.likesNextHref ?? null);
      setIsOwnProfile(cached.isOwnProfile);
      setLoading(false);
      if (cached.isOwnProfile) addServerLikedIds(cached.serverLikes.map((i) => i.track.id));

      return () => { cancelled = true; };
    }

    // --- Путь Б: кеша нет, загружаем профиль с нуля ---
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setTracksNextHref(null);
        setLikesNextHref(null);
        setServerLikes([]);

        // Получаем данные пользователя + (если смотрим чужой профиль)
        // id авторизованного юзера, чтобы понять, не совпадают ли они.
        const [userData, meData] = await Promise.all([
          isCurrentUser ? scAPI.getMe() : scAPI.getUser(userId!),
          isCurrentUser ? Promise.resolve(null) : scAPI.getMe().catch(() => null),
        ]);

        if (cancelled) return;
        setUser(userData);

        const ownProfile = isCurrentUser || (meData != null && meData.id === userData.id);
        setIsOwnProfile(ownProfile);

        // Все тяжёлые запросы параллельно
        const [tracksData, playlistsData, likesData] = await Promise.all([
          scAPI.getUserTracks(userData.id, PAGE_SIZE),
          scAPI.getUserPlaylists(userData.id, 50),
          scAPI.getUserLikes(userData.id, PAGE_SIZE),
        ]);


        if (cancelled) return;

        setTracks(tracksData.collection);
        setTracksNextHref(tracksData.next_href);

        // Fallback обложка для плейлистов без artwork_url
        const playlistsWithFallback = (playlistsData.collection as any).map((playlist: any) => {
          if (!playlist.artwork_url) {
            if (playlist.tracks && playlist.tracks.length > 0) {
              const trackWithArtwork = playlist.tracks.find((t: any) => t.artwork_url);
              if (trackWithArtwork) {
                return { ...playlist, artwork_url: trackWithArtwork.artwork_url };
              }
            }
          }
          return playlist;
        });
        setPlaylists(playlistsWithFallback);

        const freshServerLikes = parseLikesCollection(likesData.collection);
        setServerLikes(freshServerLikes);
        setLikesNextHref(likesData.next_href);
        if (ownProfile) addServerLikedIds(freshServerLikes.map((i) => i.track.id));

        usePageCacheStore.getState().setPageCache(cacheKey, {
          user: userData,
          tracks: tracksData.collection,
          playlists: playlistsWithFallback,
          serverLikes: freshServerLikes,
          tracksNextHref: tracksData.next_href,
          likesNextHref: likesData.next_href,
          isOwnProfile: ownProfile,
        });
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthToken, userId, isCurrentUser]);

  // Загружаем популярные треки когда узнали user.id
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setTopTracksLoading(true);
    setTopTracks([]);
    scAPI.getUserTopTracks(user.id, 10)
      .then((res) => {
        if (!cancelled) setTopTracks(res.collection);
      })
      .catch((err) => console.error('[UserPage] topTracks error:', err))
      .finally(() => { if (!cancelled) setTopTracksLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id]);

  const handlePlayTrack = (track: SCTrack, index: number) => {
    const isCurrent = currentTrack?.id === track.id;
    if (isCurrent) togglePlay();
    else {
      const queue = activeTab === 'likes' ? likes : activeTab === 'popular' ? topTracks : tracks;
      playTrack(track, queue, index);
    }
  };


  const handleToggleLike = (track: SCTrack) => {
    const isLiked = likedTrackIds.has(track.id);
    // Если убираем лайк и это на своей странице, запускаем анимацию
    if (isLiked && isOwnProfile) {
      setRemovingTrackId(track.id);
      setTimeout(() => {
        toggleLike(track.id, track);
        setRemovingTrackId(null);
      }, 300);
    } else {
      toggleLike(track.id, track);
    }
  };

  const handleToggleFollow = async () => {
    if (!user || !oauthToken) return;

    // Optimistic update — обновляем глобальный стор
    const wasFollowing = isFollowing;
    const newIds = new Set(followingUserIds);
    if (wasFollowing) newIds.delete(user.id);
    else newIds.add(user.id);
    setFollowingUserIds(Array.from(newIds));

    try {
      if (wasFollowing) {
        await scAPI.unfollowUser(user.id);
      } else {
        await scAPI.followUser(user.id);
      }
    } catch (err) {
      console.error('Follow/unfollow error:', err);
      // Откатываем при ошибке
      setFollowingUserIds(Array.from(followingUserIds));
      alert(wasFollowing ? t('user_follow_error_sub') : t('user_follow_error_follow'));
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <UserHeaderSkeleton />
        {/* Tabs skeleton */}
        <div className="flex gap-1 mb-6 border-b border-border pb-px">
          {[1,2,3,4].map(i => <div key={i} className="h-10 w-20 rounded skeleton-shimmer" />)}
        </div>
        {/* Tracks skeleton */}
        <div className="mb-8 space-y-0.5">
          {Array.from({ length: 6 }, (_, i) => <RowSkeleton key={i} />)}
        </div>
        {/* Playlists grid skeleton */}
        <div className="main-grid-layout">
          {Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <EmptyState
        title={t('user_profile_error')}
        description={error || t('user_not_found')}
      />
    );
  }

  const currentTracks = activeTab === 'likes' ? likes : activeTab === 'popular' ? topTracks : tracks;
  const displayTracks = activeTab === 'all' || activeTab === 'tracks' || activeTab === 'likes' || activeTab === 'popular';
  const displayPlaylists = activeTab === 'all' || activeTab === 'playlists';
  const totalItems = activeTab === 'all'
    ? tracks.length + playlists.length + likes.length
    : activeTab === 'tracks'
    ? tracks.length
    : activeTab === 'playlists'
    ? playlists.length
    : activeTab === 'popular'
    ? topTracks.length
    : likes.length;

  return (
    <div key={user.id} className="max-w-6xl mx-auto animate-slide-up">
      {/* Аватар + основная инфа */}
      <div className="flex flex-col md:flex-row gap-6 mb-8">
        {/* Аватар */}
        <div className="flex-shrink-0">
          <div className="w-32 h-32 md:w-48 md:h-48 rounded-full overflow-hidden bg-surface-alt">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.username}
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/20 to-accent/5">
                <User size={48} className="text-accent/50" />
              </div>
            )}
          </div>
        </div>

        {/* Информация о пользователе */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl md:text-5xl font-bold mb-2">{user.username}</h1>
              {user.full_name && (
                <p className="text-xl text-text mb-4">{user.full_name}</p>
              )}

              {user.description && (
                <p className="text-base text-text mb-4 whitespace-pre-wrap max-w-2xl">
                  {user.description}
                </p>
              )}
            </div>

            {/* Кнопка подписки (только на чужом профиле) */}
            {!isOwnProfile && oauthToken && (
              <button
                onClick={handleToggleFollow}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 hover:shadow-lg mt-2"
                style={{
                  background: isFollowing ? 'rgb(var(--theme-surface-alt))' : 'rgb(var(--theme-accent))',
                  color: isFollowing ? 'rgb(var(--theme-text))' : 'white',
                  boxShadow: isFollowing ? '0 4px 12px rgba(0,0,0,0.1)' : '0 4px 12px rgba(var(--theme-accent-rgb), 0.3)',
                }}
              >
                {isFollowing ? (
                  <>
                    <Users size={16} /> {t('user_unfollow')}
                  </>
                ) : (
                  <>
                    <Users size={16} /> {t('user_follow')}
                  </>
                )}
              </button>
            )}
          </div>

          {/* Статистика */}
          <div className="flex flex-wrap items-center gap-6 text-base">
            {user.followers_count !== undefined && (
              <div
                className="flex items-center gap-2 cursor-pointer hover:text-accent transition-colors"
                onClick={() => navigate(`/user/${user.id}/followers`)}
              >
                <Users size={18} className="text-text-dim" />
                <span className="font-bold">{formatCount(user.followers_count)}</span>
                <span>{t('user_followers')}</span>
              </div>
            )}
            {user.followings_count !== undefined && (
              <div
                className="flex items-center gap-2 cursor-pointer hover:text-accent transition-colors"
                onClick={() => navigate(`/user/${user.id}/following`)}
              >
                <Users size={18} className="text-text-dim" />
                <span className="font-bold">{formatCount(user.followings_count)}</span>
                <span>{t('user_following')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Вкладки */}
      {(() => {
        const trackCount = user.track_count ?? tracks.length;
        const playlistCount = user.playlist_count ?? playlists.length;
        const likesCount = user.likes_count ?? serverLikes.length;
        return (
          <TabBar
            tabs={[
              { id: 'all' as Tab, label: t('user_tab_all'), count: trackCount + playlistCount + likesCount },
              { id: 'popular' as Tab, label: t('user_tab_popular') },
              { id: 'tracks' as Tab, label: t('user_tab_tracks'), count: trackCount },
              { id: 'playlists' as Tab, label: t('user_tab_playlists'), count: playlistCount },
              { id: 'likes' as Tab, label: t('user_tab_likes'), count: likesCount },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        );
      })()}

      {/* Контент */}
      {totalItems === 0 ? (
        <EmptyState title={t('nothing_found')} description={t('user_no_content')} />
      ) : (
        <div key={activeTab} className="space-y-6 animate-slide-up">
          {/* Треки / Лайки / Популярное */}
          {displayTracks && (currentTracks.length > 0 || (activeTab === 'popular' && topTracksLoading)) && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  {activeTab === 'likes' ? t('user_tab_likes') : activeTab === 'popular' ? t('user_tab_popular') : t('user_tab_tracks')}
                </h2>
                {activeTab === 'all' && currentTracks.length > 5 && (
                  <button onClick={() => setActiveTab('tracks')} className="text-sm text-accent hover:underline">{t('show_all')}</button>
                )}
              </div>
              {activeTab === 'popular' && topTracksLoading ? (
                <div className="space-y-1">
                  {Array.from({ length: 5 }, (_, i) => <RowSkeleton key={i} />)}
                </div>
              ) : (
                <div className="space-y-1">
                  {(activeTab === 'all' ? currentTracks.slice(0, 5) : currentTracks).map((track, index) => {
                    const isCurrent = currentTrack?.id === track.id;
                    const isRemoving = removingTrackId === track.id;
                    return (
                      <div key={track.id} className={cn('transition-all duration-300', isRemoving && 'opacity-0 translate-x-4 scale-95')}>
                        <TrackRow
                          track={track}
                          index={index}
                          isCurrent={isCurrent}
                          isPlaying={isPlaying}
                          onPlay={() => handlePlayTrack(track, index)}
                          onNavigateTrack={() => navigate(`/track/${track.id}`)}
                          onNavigateUser={track.user?.id ? () => navigateToUser(track.user!.id) : undefined}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              {activeTab === 'tracks' && hasMoreTracks && (
                <div ref={tracksLoadMoreRef} className="flex justify-center py-4">{loadingMore && <Spinner />}</div>
              )}
              {activeTab === 'likes' && hasMoreLikes && (
                <div ref={likesLoadMoreRef} className="flex justify-center py-4">{loadingMore && <Spinner />}</div>
              )}
            </div>
          )}

          {/* Популярное (только во вкладке All) */}
          {activeTab === 'all' && (topTracks.length > 0 || topTracksLoading) && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('user_tab_popular')}</h2>
                {topTracks.length > 0 && (
                  <button onClick={() => setActiveTab('popular')} className="text-sm text-accent hover:underline">{t('show_all')}</button>
                )}
              </div>
              {topTracksLoading ? (
                <div className="space-y-1">
                  {Array.from({ length: 3 }, (_, i) => <RowSkeleton key={i} />)}
                </div>
              ) : (
                <div className="space-y-1">
                  {topTracks.slice(0, 5).map((track, index) => {
                    const isCurrent = currentTrack?.id === track.id;
                    return (
                      <TrackRow
                        key={track.id}
                        track={track}
                        index={index}
                        isCurrent={isCurrent}
                        isPlaying={isPlaying}
                        onPlay={() => { if (isCurrent) togglePlay(); else playTrack(track, topTracks, index); }}
                        onNavigateTrack={() => navigate(`/track/${track.id}`)}
                        onNavigateUser={track.user?.id ? () => navigateToUser(track.user!.id) : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Лайки (только во вкладке All) */}
          {activeTab === 'all' && likes.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('user_tab_likes')}</h2>
                {likes.length > 5 && (
                  <button onClick={() => setActiveTab('likes')} className="text-sm text-accent hover:underline">{t('show_all')}</button>
                )}
              </div>
              <div className="space-y-1">
                {likes.slice(0, 5).map((track, index) => {
                  const isCurrent = currentTrack?.id === track.id;
                  const isRemoving = removingTrackId === track.id;
                  return (
                    <div key={track.id} className={cn('transition-all duration-300', isRemoving && 'opacity-0 translate-x-4 scale-95')}>
                      <TrackRow
                        track={track}
                        index={index}
                        isCurrent={isCurrent}
                        isPlaying={isPlaying}
                        onPlay={() => handlePlayTrack(track, index)}
                        onNavigateTrack={() => navigate(`/track/${track.id}`)}
                        onNavigateUser={track.user?.id ? () => navigateToUser(track.user!.id) : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Плейлисты */}
          {displayPlaylists && playlists.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">{t('user_tab_playlists')}</h2>
              <div className="main-grid-layout">
                {playlists.map((playlist) => (
                  <TrackCard key={playlist.id} track={playlist as any} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
