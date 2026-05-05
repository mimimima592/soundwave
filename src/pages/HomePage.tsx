import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SCTrack } from '@/types/soundcloud';
import { TrackCard } from '@/components/player/TrackCard';
import { TrackCardSkeleton } from '@/components/common/UI';
import { PageHeader, Section, EmptyState } from '@/components/common/UI';
import { ChevronLeft, ChevronRight, Users, Music, Plus, Check, RotateCw, ArrowRight, Music2, Play, Pause } from 'lucide-react';
import { cn, formatCount, hiResArtwork } from '@/utils/format';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { usePageCacheStore } from '@/store/pageCache';
import { useHistoryStore } from '@/store/history';
import { scAPI } from '@/api/soundcloud';
import { useT } from '@/store/i18n';

const HOME_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const HOME_CACHE_KEY = 'page:home';

type HomeData = {
  recentlyPlayed: SCTrack[];
  myTracks: SCTrack[];
  sidebarLikes: SCTrack[];
  suggestedArtists: any[];
  moreOfWhatYouLike: SCTrack[];
  yourMoods: SCTrack[];
};

// ─── Carousel Section ─────────────────────────────────────────────────────────

function CarouselSection({
  title,
  tracks,
  loading,
  containerRef,
  arrowState,
  onScroll,
}: {
  title: string;
  tracks: SCTrack[];
  loading: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  arrowState: { left: boolean; right: boolean };
  onScroll: (dir: 'left' | 'right') => void;
}) {
  if (!loading && tracks.length === 0) return null;

  return (
    <div className="relative group/section mb-10 animate-slide-up">
      <h2 className="font-bold mb-4" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "1.2rem", letterSpacing: "-0.03em" }}>{title}</h2>

      {loading ? (
        // Skeleton — 5 cards matching the real card width (w-52 = 208px)
        <div className="flex gap-6 overflow-hidden pb-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex-shrink-0 w-52">
              <TrackCardSkeleton />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            className="flex gap-6 overflow-x-auto pb-2 scrollbar-hide carousel-scroll"
          >
            {tracks.map((track, i) => (
              <div key={track.id} className="flex-shrink-0 w-52">
                <TrackCard track={track} queue={tracks} index={i} />
              </div>
            ))}
          </div>

          <div className={cn(
            'absolute left-2 top-[148px] -translate-y-1/2 z-10',
            arrowState.left ? 'opacity-0 group-hover/section:opacity-100' : 'opacity-0 pointer-events-none',
            'transition-opacity duration-200'
          )}>
            <button
              onClick={() => onScroll('left')}
              className="pb-button w-9 h-9 rounded-full flex items-center justify-center bg-surface border border-border/40 text-text shadow-lg hover:bg-black/80"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className={cn(
            'absolute right-2 top-[148px] -translate-y-1/2 z-10',
            arrowState.right ? 'opacity-0 group-hover/section:opacity-100' : 'opacity-0 pointer-events-none',
            'transition-opacity duration-200'
          )}>
            <button
              onClick={() => onScroll('right')}
              className="pb-button w-9 h-9 rounded-full flex items-center justify-center bg-surface border border-border/40 text-text shadow-lg hover:bg-black/80"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sidebar skeleton ─────────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <div className="p-6 pt-[100px] space-y-3">
      {/* Artists header */}
      <div className="flex items-center justify-between mb-5">
        <div className="h-3 w-32 rounded skeleton-shimmer" />
        <div className="w-7 h-7 rounded-full skeleton-shimmer" />
      </div>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <div className="w-11 h-11 rounded-full skeleton-shimmer flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 rounded skeleton-shimmer" />
            <div className="h-3 w-2/3 rounded skeleton-shimmer" />
          </div>
        </div>
      ))}
      {/* Divider */}
      <div className="h-px bg-border/30 my-5" />
      {/* Likes header */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-3 w-12 rounded skeleton-shimmer" />
        <div className="w-7 h-7 rounded-full skeleton-shimmer" />
      </div>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <div className="w-11 h-11 rounded-lg skeleton-shimmer flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 rounded skeleton-shimmer" />
            <div className="h-3 w-2/3 rounded skeleton-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function HomePage() {
  const navigate = useNavigate();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const t = useT();
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const oauthToken = useUIStore((s) => s.oauthToken);
  const syncLikedPlaylists = useUIStore((s) => s.syncLikedPlaylists);

  const [data, setData] = useState<HomeData | null>(null);
  const localHistory = useHistoryStore((s) => s.entries);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [following, setFollowing] = useState<Set<number>>(new Set());
  const [suggestedArtists, setSuggestedArtists] = useState<any[]>([]);
  const [displayedArtists, setDisplayedArtists] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const isLoadingRef = useRef(false);
  const recentlyPlayedRef = useRef<HTMLDivElement>(null);
  const myTracksRef = useRef<HTMLDivElement>(null);
  const moreOfWhatYouLikeRef = useRef<HTMLDivElement>(null);
  const yourMoodsRef = useRef<HTMLDivElement>(null);

  const [recentlyPlayedArrow, setRecentlyPlayedArrow] = useState({ left: false, right: false });
  const [myTracksArrow, setMyTracksArrow] = useState({ left: false, right: false });
  const [moreOfWhatYouLikeArrow, setMoreOfWhatYouLikeArrow] = useState({ left: false, right: false });
  const [yourMoodsArrow, setYourMoodsArrow] = useState({ left: false, right: false });

  // ── Fetch all data in parallel, with cache ────────────────────────────────
  useEffect(() => {
    // Try cache first — restore immediately
    const cached = usePageCacheStore.getState().getPageCache<HomeData>(HOME_CACHE_KEY, HOME_CACHE_TTL_MS);
    if (cached) {
      setData(cached);
      setSuggestedArtists(cached.suggestedArtists);
      const shuffled = [...cached.suggestedArtists].sort(() => 0.5 - Math.random());
      setDisplayedArtists(shuffled.slice(0, Math.min(5, cached.suggestedArtists.length)));
      setLoading(false);
      return;
    }

    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        // Загружаем токен, clientId и userId параллельно — экономим 2 последовательных round-trip
        const [oauthToken, clientId, currentUserId] = (await Promise.all([
          window.electron?.settings?.get('oauthToken'),
          window.electron?.settings?.get('soundCloudClientId'),
          window.electron?.auth?.getUserId(),
        ])) as [string | null, string | null, number | null];

        if (!oauthToken) {
          setLoading(false);
          isLoadingRef.current = false;
          return;
        }

        // Все 5 запросов одновременно — ни один не ждёт другого
        const [historyRes, myTracksRes, suggestedRes, mixedSelectionsRes, likesRes] = await Promise.allSettled([
          window.electron?.net.authenticatedRequest(
            'https://api-v2.soundcloud.com/me/play-history/tracks?limit=20', 'GET', null, oauthToken
          ),
          window.electron?.net.authenticatedRequest(
            `https://api-v2.soundcloud.com/users/${currentUserId}/tracks?limit=20`, 'GET', null, oauthToken
          ),
          window.electron?.net.authenticatedRequest(
            'https://api-v2.soundcloud.com/me/suggested/users/who_to_follow?view=recommended-first&limit=21&offset=0&linked_partitioning=1&app_version=1777028773&app_locale=en',
            'GET', null, oauthToken
          ),
          window.electron?.net.authenticatedRequest(
            'https://api-v2.soundcloud.com/mixed-selections', 'GET', null, oauthToken
          ),
          scAPI.getTrackLikes(5),
        ]);

        if (cancelled) return;

        // Parse history
        let historyTracks: SCTrack[] = [];
        if (historyRes.status === 'fulfilled' && historyRes.value?.ok && historyRes.value?.body) {
          try { historyTracks = JSON.parse(historyRes.value.body).collection?.map((i: any) => i.track) || []; } catch {}
        }

        // Parse my tracks
        let myTracksData: SCTrack[] = [];
        if (myTracksRes.status === 'fulfilled' && myTracksRes.value?.ok && myTracksRes.value?.body) {
          try { myTracksData = JSON.parse(myTracksRes.value.body).collection || []; } catch {}
        }

        // Parse suggested artists
        let suggestedArtistsData: any[] = [];
        if (suggestedRes.status === 'fulfilled' && suggestedRes.value?.ok && suggestedRes.value?.body) {
          try { suggestedArtistsData = JSON.parse(suggestedRes.value.body).collection || []; } catch {}
        }

        // Parse mixed selections - extract personalized tracks without additional requests
        let moreOfWhatYouLikeData: SCTrack[] = [];
        let yourMoodsData: SCTrack[] = [];

        // Функция для поиска секции с personalized-tracks по строгому условию
        const findPersonalizedTracks = (data: any): any => {
          if (!data || !data.collection) return null;
          return data.collection.find((section: any) =>
            section.tracking_feature_name === 'personalized-tracks' || section.title === 'More of what you like'
          );
        };

        // Функция для поиска секции с your-moods
        const findYourMoods = (data: any): any => {
          if (!data || !data.collection) return null;
          return data.collection.find((section: any) =>
            section.tracking_feature_name === 'your-moods' || section.title?.includes('Mixed for')
          );
        };

        // Функция для извлечения треков из секции
        const extractTracksFromSection = (section: any): SCTrack[] => {
          if (!section || !section.items?.collection) return [];
          
          const rawItems = section.items.collection || [];
          
          const tracks = rawItems
            .map((item: any) => {
              // Для system-playlist создаем объект с метаданными плейлиста
              if (item.kind === 'system-playlist' || item.kind === 'playlist') {
                // Создаем объект трека с метаданными из плейлиста
                const track: any = {
                  id: item.id,
                  kind: 'playlist',
                  isSystemPlaylist: true,
                  title: item.short_title || item.title,
                  artwork_url: item.calculated_artwork_url || item.artwork_url,
                  // Сохраняем всю коллекцию треков для проигрывания
                  tracks: item.tracks || [],
                  // Метаданные для отображения
                  playlistTitle: item.short_title || item.title,
                  playlistDescription: item.short_description || '',
                  // URN для лайка системных плейлистов
                  urn: item.urn,
                  // Используем short_description как имя артиста/подзаголовок
                  user: {
                    username: item.short_description || (item.tracks?.[0]?.user?.username || 'SoundCloud'),
                    avatar_url: item.user?.avatar_url || null,
                  },
                  duration: item.duration || 0,
                  permalink: item.permalink,
                  permalink_url: item.permalink_url,
                  media: item.media || { transcodings: [] },
                };
                
                return track;
              }
              
              // Для обычных треков оставляем как есть
              const track = item;
              
              // Fallback на artwork_url если нет
              if (!track.artwork_url && track.user?.avatar_url) {
                track.artwork_url = track.user.avatar_url;
              }
              
              // Убираем префикс 'Related tracks:' из названия
              if (track.title && track.title.startsWith('Related tracks:')) {
                track.title = track.title.replace('Related tracks:', '').trim();
              }
              
              return track;
            })
            .filter(Boolean);
          
          return tracks;
        };

        if (mixedSelectionsRes.status === 'fulfilled' && mixedSelectionsRes.value?.ok && mixedSelectionsRes.value?.body) {
          try {
            const mixedData = JSON.parse(mixedSelectionsRes.value.body);
            
            // Ищем секцию по строгому условию
            const personalizedSection = findPersonalizedTracks(mixedData);
            
            if (personalizedSection) {
              moreOfWhatYouLikeData = extractTracksFromSection(personalizedSection);
              // Ограничиваем до 15 объектов для производительности
              moreOfWhatYouLikeData = moreOfWhatYouLikeData.slice(0, 15);
            } else {
              // Fallback на curated-global
              const curatedSection = mixedData.collection?.find((section: any) =>
                section.tracking_feature_name === 'personalised-curated-global' || section.title === 'Curated by SoundCloud'
              );
              if (curatedSection) {
                moreOfWhatYouLikeData = extractTracksFromSection(curatedSection);
                moreOfWhatYouLikeData = moreOfWhatYouLikeData.slice(0, 15);
              }
            }
            
            // Извлекаем треки из секции your-moods
            const yourMoodsSection = findYourMoods(mixedData);
            
            if (yourMoodsSection) {
              yourMoodsData = extractTracksFromSection(yourMoodsSection);
              yourMoodsData = yourMoodsData.slice(0, 15);
            }
            
          } catch (err) {
            // Error parsing mixed selections - ignore
          }
        } else {
          // Mixed selections request failed - ignore
        }

        const validFilter = (t: SCTrack) => t && t.user && t.user.username && t.user.username !== 'Unknown';
        const validHistory = historyTracks.filter(validFilter);
        const validMyTracks = myTracksData.filter(validFilter);
        // Временно убираем фильтр для moreOfWhatYouLike чтобы карусель появилась
        const validMoreOfWhatYouLike = moreOfWhatYouLikeData;
        // Временно убираем фильтр для yourMoodsData чтобы карусель появилась
        const validYourMoods = yourMoodsData;

        // Sidebar likes — загружены параллельно выше вместе с остальными запросами
        let sidebarLikesData: SCTrack[] = [];
        if (likesRes.status === 'fulfilled' && likesRes.value) {
          try { sidebarLikesData = (likesRes.value as any).collection.map((item: any) => item.track); } catch {}
        }

        const sidebarLikes = sidebarLikesData.slice(0, 5);

        if (cancelled) return;

        const homeData: HomeData = {
          recentlyPlayed: validHistory,
          myTracks: validMyTracks,
          sidebarLikes,
          suggestedArtists: suggestedArtistsData,
          moreOfWhatYouLike: validMoreOfWhatYouLike,
          yourMoods: validYourMoods,
        };

        setData(homeData);
        setSuggestedArtists(suggestedArtistsData);
        const shuffled = [...suggestedArtistsData].sort(() => 0.5 - Math.random());
        setDisplayedArtists(shuffled.slice(0, Math.min(5, suggestedArtistsData.length)));

        // Save to cache
        usePageCacheStore.getState().setPageCache(HOME_CACHE_KEY, homeData);

        // Синхронизация плейлистов — фоновый запрос, не блокирует снятие лоадера
        if (oauthToken) {
          scAPI.getLibraryAll(50)
            .then((libraryData) => { if (libraryData.collection) syncLikedPlaylists(libraryData.collection); })
            .catch(() => {});
        }

      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) { setLoading(false); isLoadingRef.current = false; }
      }
    })();

    return () => { cancelled = true; isLoadingRef.current = false; };
  }, []);

  // ── Carousel helpers ──────────────────────────────────────────────────────
  const smoothScroll = (el: HTMLElement, target: number, duration = 600) => {
    const start = el.scrollLeft;
    const change = target - start;
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      el.scrollLeft = start + change * (1 - Math.pow(1 - t, 3));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const handleScroll = (dir: 'left' | 'right', ref: React.RefObject<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const w = el.querySelector('.flex-shrink-0')?.clientWidth || 208;
    smoothScroll(el, el.scrollLeft + (dir === 'left' ? -(w * 3.5) : w * 3.5));
  };

  const updateArrows = (ref: React.RefObject<HTMLDivElement>, set: (s: { left: boolean; right: boolean }) => void) => {
    const el = ref.current;
    if (!el) return;
    set({ left: el.scrollLeft > 10, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 10 });
  };

  useEffect(() => {
    const onRp = () => updateArrows(recentlyPlayedRef, setRecentlyPlayedArrow);
    const onMt = () => updateArrows(myTracksRef, setMyTracksArrow);
    const onMwl = () => updateArrows(moreOfWhatYouLikeRef, setMoreOfWhatYouLikeArrow);
    const onYm = () => updateArrows(yourMoodsRef, setYourMoodsArrow);

    const rp = recentlyPlayedRef.current;
    const mt = myTracksRef.current;
    const mwl = moreOfWhatYouLikeRef.current;
    const ym = yourMoodsRef.current;

    rp?.addEventListener('scroll', onRp);
    mt?.addEventListener('scroll', onMt);
    mwl?.addEventListener('scroll', onMwl);
    ym?.addEventListener('scroll', onYm);

    // Запускаем обновление только когда данные загружены и DOM успел отрисоваться
    if (!loading) {
      // rAF гарантирует что layout уже посчитан
      const raf = requestAnimationFrame(() => {
        onRp(); onMt(); onMwl(); onYm();
      });
      return () => {
        cancelAnimationFrame(raf);
        rp?.removeEventListener('scroll', onRp);
        mt?.removeEventListener('scroll', onMt);
        mwl?.removeEventListener('scroll', onMwl);
        ym?.removeEventListener('scroll', onYm);
      };
    }

    return () => {
      rp?.removeEventListener('scroll', onRp);
      mt?.removeEventListener('scroll', onMt);
      mwl?.removeEventListener('scroll', onMwl);
      ym?.removeEventListener('scroll', onYm);
    };
  }, [data, loading]);

  // ── Artist actions ────────────────────────────────────────────────────────
  const handleFollow = async (userId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!oauthToken) return;

    // Optimistic update
    const previousState = following.has(userId);
    setFollowing(prev => {
      const s = new Set(prev);
      if (previousState) {
        s.delete(userId);
      } else {
        s.add(userId);
      }
      return s;
    });

    try {
      if (previousState) {
        await scAPI.unfollowUser(userId);
      } else {
        await scAPI.followUser(userId);
      }
    } catch (err) {
      console.error('Follow/unfollow error:', err);
      // Откатываем состояние при ошибке
      setFollowing(prev => {
        const s = new Set(prev);
        if (previousState) {
          s.add(userId);
        } else {
          s.delete(userId);
        }
        return s;
      });
      alert(previousState ? t('user_follow_error_sub') : t('user_follow_error_follow'));
    }
  };

  const handleRefreshArtists = () => {
    if (isRefreshing || suggestedArtists.length === 0) return;
    setIsRefreshing(true); setIsAnimating(true);
    setTimeout(() => {
      const shuffled = [...suggestedArtists].sort(() => 0.5 - Math.random());
      setDisplayedArtists(shuffled.slice(0, Math.min(5, suggestedArtists.length)));
      setTimeout(() => { setIsRefreshing(false); setIsAnimating(false); }, 300);
    }, 300);
  };

  const handlePlayTrack = (track: SCTrack, index: number) => {
    if (currentTrack?.id === track.id) togglePlay();
    else playTrack(track, data?.sidebarLikes ?? [], index);
  };

  const handleUrlResolution = async (url: string) => {
    try {
      const [oauthToken, resolveClientId] = (await Promise.all([
        window.electron?.settings?.get('oauthToken'),
        window.electron?.settings?.get('soundCloudClientId'),
      ])) as [string | null, string | null];
      const res = await window.electron?.net.authenticatedRequest(
        `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${resolveClientId || ''}`,
        'GET', null, oauthToken || ''
      );
      const resolved = res?.ok && res?.body ? JSON.parse(res.body) : null;
      if (!resolved?.id) { setUrlError(t('content_not_found')); setTimeout(() => setUrlError(null), 3000); return; }
      switch (resolved.kind) {
        case 'track': navigate(`/track/${resolved.id}`); break;
        case 'playlist': navigate(`/playlist/${resolved.id}`); break;
        case 'user': navigate(`/user/${resolved.id}`); break;
        default: setUrlError(t('content_unsupported')); setTimeout(() => setUrlError(null), 3000);
      }
    } catch { setUrlError(t('link_invalid')); setTimeout(() => setUrlError(null), 3000); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-8 h-full overflow-hidden">

      {/* ── Main column ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto pr-1 px-1">
        <PageHeader title={t('home_title')} subtitle={t('home_subtitle')} />

        {urlError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{urlError}</div>
        )}
        {error && <EmptyState title={t('error')} description={error} />}

        {!error && (
          <>
            <CarouselSection
              title={t('home_recent')}
              tracks={(() => {
                const local = localHistory.map(e => e.track);
                const localIds = new Set(local.map(t => t.id));
                return [
                  ...local,
                  ...(data?.recentlyPlayed ?? []).filter(t => !localIds.has(t.id)),
                ].slice(0, 20);
              })()}
              loading={loading}
              containerRef={recentlyPlayedRef}
              arrowState={recentlyPlayedArrow}
              onScroll={(d) => handleScroll(d, recentlyPlayedRef)}
            />
            <CarouselSection
              title={t('home_recommendations')}
              tracks={data?.moreOfWhatYouLike ?? []}
              loading={loading}
              containerRef={moreOfWhatYouLikeRef}
              arrowState={moreOfWhatYouLikeArrow}
              onScroll={(d) => handleScroll(d, moreOfWhatYouLikeRef)}
            />
            <CarouselSection
              title="Mixed for you"
              tracks={data?.yourMoods ?? []}
              loading={loading}
              containerRef={yourMoodsRef}
              arrowState={yourMoodsArrow}
              onScroll={(d) => handleScroll(d, yourMoodsRef)}
            />
            <CarouselSection
              title={t('home_my_tracks')}
              tracks={data?.myTracks ?? []}
              loading={loading}
              containerRef={myTracksRef}
              arrowState={myTracksArrow}
              onScroll={(d) => handleScroll(d, myTracksRef)}
            />

            {!loading && !data?.recentlyPlayed.length && !data?.myTracks.length && localHistory.length === 0 && (
              <EmptyState title={t('home_no_data')} description={t('home_login_hint')} />
            )}
          </>
        )}
      </div>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <div className="w-[300px] flex-shrink-0 hidden lg:flex flex-col border-l border-border/50 overflow-hidden">
        {loading ? (
          <SidebarSkeleton />
        ) : (
          <>
            {/* Artists */}
            <div className="overflow-y-auto overflow-x-hidden p-6 pt-[100px] scrollbar-hide">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold tracking-widest uppercase text-text-dim">{t('home_interesting_artists')}</h3>
                <button
                  onClick={handleRefreshArtists}
                  disabled={isRefreshing}
                  className={cn('w-7 h-7 rounded-full flex items-center justify-center text-text-dim hover:text-accent hover:bg-accent/10 transition-all', isRefreshing && 'animate-spin')}
                  style={{ animationDuration: isRefreshing ? '0.5s' : undefined }}
                >
                  <RotateCw size={13} />
                </button>
              </div>

              <div
                className="space-y-1"
                style={{
                  opacity: isAnimating ? 0 : 1,
                  transform: isAnimating ? 'scale(0.98)' : 'scale(1)',
                  filter: isAnimating ? 'blur(4px)' : 'none',
                  transition: 'opacity var(--dur-slow) var(--ease-ios), transform var(--dur-slow) var(--ease-ios), filter var(--dur-slow) var(--ease-ios)',
                }}
              >
                {displayedArtists.map((item) => {
                  const user = item.user;
                  if (!user?.username || user.username === 'Unknown') return null;
                  return (
                    <div
                      key={`artist-${user.id}`}
                      className="group flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-white/5 transition-all duration-200 cursor-pointer"
                      onClick={() => navigate(`/user/${user.id}`)}
                    >
                      <div className="thumb-hover w-11 h-11 rounded-full bg-surface-alt flex-shrink-0 shadow-md">
                        {user.avatar_url
                          ? <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" draggable={false} />
                          : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/20 to-accent/5">
                              <span className="text-accent/50 text-sm font-semibold">{user.username?.[0]?.toUpperCase() || '?'}</span>
                            </div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate group-hover:text-accent transition-colors leading-tight">{user.username}</div>
                        <div className="flex items-center gap-3 text-xs text-text-dim mt-0.5">
                          <span className="flex items-center gap-1"><Users size={9} />{formatCount(user.followers_count || 0)}</span>
                          <span className="flex items-center gap-1"><Music size={9} />{formatCount(user.track_count || 0)}</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleFollow(user.id, e)}
                        className={cn(
                          'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center border pb-button transition-[background-color,color,border-color,opacity] duration-200 opacity-0 group-hover:opacity-100',
                          following.has(user.id) ? 'border-accent/50 text-accent bg-accent/10' : 'border-white/20 text-text-dim hover:border-accent/50 hover:text-accent hover:bg-accent/10'
                        )}
                      >
                        {following.has(user.id) ? <Check size={12} /> : <Plus size={12} />}
                      </button>
                    </div>
                  );
                })}
                {!loading && displayedArtists.length === 0 && <div className="text-sm text-text-dim">{t('home_no_data_sidebar')}</div>}
              </div>
            </div>

            {/* Likes */}
            <div className="px-6 pb-4">
              <div className="h-px bg-border/40 mb-4" />
              <div className="flex items-center justify-between mb-3">
                <h3
                  className="text-sm font-semibold tracking-widest uppercase text-text-dim cursor-pointer hover:text-accent transition-colors"
                  onClick={() => navigate('/likes')}
                >
                  {t('home_sidebar_likes')}
                </h3>
                <button
                  onClick={() => navigate('/likes')}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-text-dim hover:text-accent hover:bg-accent/10 transition-all"
                >
                  <ArrowRight size={13} />
                </button>
              </div>

              <div className="space-y-1">
                {(data?.sidebarLikes ?? []).map((track, index) => {
                  const isCurrent = currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      className={cn(
                        'group flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 cursor-pointer transition-all duration-200',
                        isCurrent ? 'bg-accent/10' : 'hover:bg-white/5'
                      )}
                      onClick={(e) => { e.stopPropagation(); handlePlayTrack(track, index); }}
                    >
                      <div className="thumb-hover relative w-11 h-11 rounded-lg bg-surface-alt flex-shrink-0 shadow-md">
                        {(track.artwork_url || track.user?.avatar_url)
                          ? <img src={hiResArtwork(track.artwork_url || track.user?.avatar_url)} alt={track.title} className="w-full h-full object-cover" draggable={false} onError={(e) => { const img = e.currentTarget; const orig = track.artwork_url || track.user?.avatar_url || ''; if (img.src !== orig) { img.src = orig; } else { img.style.display = 'none'; } }} />
                          : <div className="w-full h-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center"><Music2 size={16} className="text-accent/40" /></div>}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          {isCurrent && isPlaying
                            ? <Pause size={14} className="text-white fill-white" />
                            : <Play size={14} className="text-white fill-white" />}
                        </div>
                        {isCurrent && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={cn('text-sm font-medium truncate transition-colors leading-tight', isCurrent ? 'text-accent' : 'text-text group-hover:text-accent')}
                          onClick={(e) => { e.stopPropagation(); navigate(`/track/${track.id}`); }}
                        >
                          {track.title}
                        </div>
                        <div
                          className="text-xs text-text-dim truncate mt-0.5 hover:text-accent transition-colors"
                          onClick={(e) => { e.stopPropagation(); navigate(`/user/${track.user?.id}`); }}
                        >
                          {track.user?.username || 'Unknown'}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!loading && (data?.sidebarLikes ?? []).length === 0 && <div className="text-sm text-text-dim">{t('home_no_data_sidebar')}</div>}
              </div>
            </div>

            {/* History */}
            {!loading && (data?.recentlyPlayed ?? []).length > 0 && (
              <div className="px-6 pb-4">
                <div className="h-px bg-border/40 mb-4" />
                <div className="flex items-center justify-between mb-3">
                  <h3
                    className="text-sm font-semibold tracking-widest uppercase text-text-dim cursor-pointer hover:text-accent transition-colors"
                    onClick={() => navigate('/history')}
                  >
                    {t('home_sidebar_history')}
                  </h3>
                  <button
                    onClick={() => navigate('/history')}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-text-dim hover:text-accent hover:bg-accent/10 transition-all"
                  >
                    <ArrowRight size={13} />
                  </button>
                </div>

                <div className="space-y-1">
                  {localHistory.slice(0, 5).map((entry, index) => {
                    const track = entry.track;
                    const isCurrent = currentTrack?.id === track.id;
                    return (
                      <div
                        key={track.id}
                        className={cn(
                          'group flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 cursor-pointer transition-all duration-200',
                          isCurrent ? 'bg-accent/10' : 'hover:bg-white/5'
                        )}
                        onClick={(e) => { e.stopPropagation(); handlePlayTrack(track, index); }}
                      >
                        <div className="thumb-hover relative w-11 h-11 rounded-lg bg-surface-alt flex-shrink-0 shadow-md">
                          {(track.artwork_url || track.user?.avatar_url)
                            ? <img src={hiResArtwork(track.artwork_url || track.user?.avatar_url)} alt={track.title} className="w-full h-full object-cover" draggable={false} onError={(e) => { const img = e.currentTarget; const orig = track.artwork_url || track.user?.avatar_url || ''; if (img.src !== orig) { img.src = orig; } else { img.style.display = 'none'; } }} />
                            : <div className="w-full h-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center"><Music2 size={16} className="text-accent/40" /></div>}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            {isCurrent && isPlaying
                              ? <Pause size={14} className="text-white fill-white" />
                              : <Play size={14} className="text-white fill-white" />}
                          </div>
                          {isCurrent && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className={cn('text-sm font-medium truncate transition-colors leading-tight', isCurrent ? 'text-accent' : 'text-text group-hover:text-accent')}
                            onClick={(e) => { e.stopPropagation(); navigate(`/track/${track.id}`); }}
                          >
                            {track.title}
                          </div>
                          <div
                            className="text-xs text-text-dim truncate mt-0.5 hover:text-accent transition-colors"
                            onClick={(e) => { e.stopPropagation(); navigate(`/user/${track.user?.id}`); }}
                          >
                            {track.user?.username || 'Unknown'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
