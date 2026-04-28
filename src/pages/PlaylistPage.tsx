import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Play, Pause, Clock, Calendar, ListMusic, Heart, Share2 } from 'lucide-react';
import { scAPI } from '@/api/soundcloud';
import type { SCPlaylist, SCTrack } from '@/types/soundcloud';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { formatTime, hiResArtwork, formatCount, cn } from '@/utils/format';
import { Spinner, EmptyState, TrackRow, RowSkeleton, CoverHeaderSkeleton } from '@/components/common/UI';
import { usePageCacheStore } from '@/store/pageCache';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

const PLAYLIST_CACHE_TTL_MS = 10 * 60 * 1000;
// Запрашиваем сразу все треки плейлиста как stub'ы (id + частичные поля).
// Полные данные гидрируются порциями по мере скролла.
const PLAYLIST_STUB_LIMIT = 9999;
const PAGE_SIZE = 50;

function isFullTrack(track: any): boolean {
  return Boolean(track && track.title && track.user?.username);
}

export function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [playlist, setPlaylist] = useState<SCPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [isHydrating, setIsHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showToast, setShowToast] = useState(false);
  const [isToastHiding, setIsToastHiding] = useState(false);

  // Чтобы не запускать параллельные гидрации и не гидрировать одно и то же дважды
  const hydratingRef = useRef(false);
  const hydratedIdsRef = useRef<Set<number>>(new Set());

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const togglePlaylistLike = useUIStore((s) => s.togglePlaylistLike);
  const isLiked = useUIStore((s) => s.isLiked);

  // Гидрирует (догружает полные данные через батчевый /tracks?ids=...) заданный диапазон
  const hydrateRange = useCallback(async (from: number, to: number) => {
    if (!playlist) return;
    const slice = playlist.tracks.slice(from, to);
    const needIds = slice
      .filter(t => !isFullTrack(t) && !hydratedIdsRef.current.has(t.id))
      .map(t => t.id);

    if (needIds.length === 0) return;

    needIds.forEach(tid => hydratedIdsRef.current.add(tid));

    try {
      const full = await scAPI.getTracks(needIds);
      const fullMap = new Map<number, SCTrack>();
      full.forEach(t => { if (t) fullMap.set(t.id, t); });

      setPlaylist(prev => {
        if (!prev) return prev;
        const nextTracks = prev.tracks.map(t => fullMap.get(t.id) ?? t);
        return { ...prev, tracks: nextTracks };
      });
    } catch (err) {
      console.error('Ошибка гидрации треков плейлиста:', err);
      // Если не удалось — разрешаем попробовать ещё раз в следующий раз
      needIds.forEach(tid => hydratedIdsRef.current.delete(tid));
    }
  }, [playlist]);

  const loadMoreRef = useInfiniteScroll(
    useCallback(async () => {
      if (!playlist || hydratingRef.current) return;
      const totalTracks = playlist.tracks?.length || 0;
      if (visibleCount >= totalTracks) return;

      const nextVisible = Math.min(visibleCount + PAGE_SIZE, totalTracks);

      hydratingRef.current = true;
      try {
        await hydrateRange(visibleCount, nextVisible);
        setVisibleCount(nextVisible);
      } finally {
        hydratingRef.current = false;
      }
    }, [playlist, visibleCount, hydrateRange]),
    { enabled: true }
  );

  useEffect(() => {
    // Проверяем, если это системный плейлист из карусели "More of what you like"
    const state = location.state as { tracks?: SCTrack[], title?: string, description?: string, artwork_url?: string, isSystemPlaylist?: boolean };
    if (state?.isSystemPlaylist && state.tracks) {
      const systemPlaylist: SCPlaylist = {
        id: 0, // временный id
        kind: 'system-playlist',
        permalink: 'personalized',
        permalink_url: '',
        title: state.title || 'Personalized',
        description: state.description || null,
        duration: state.tracks.reduce((sum, t) => sum + (t.duration || 0), 0),
        artwork_url: state.artwork_url || null,
        tracks: state.tracks,
        track_count: state.tracks.length,
        user: {
          id: 0,
          kind: 'user',
          username: 'SoundCloud',
          permalink: 'soundcloud',
          permalink_url: '',
          avatar_url: null as any, // avatar_url может быть null
        },
        created_at: new Date().toISOString(),
      };
      setPlaylist(systemPlaylist);
      hydratedIdsRef.current = new Set(state.tracks.filter(isFullTrack).map(t => t.id));
      setLoading(false);
      
      // Гидрируем треки системного плейлиста (дозагружаем метаданные)
      const hydrateSystemPlaylist = async () => {
        const needIds = state.tracks?.filter(t => !isFullTrack(t)).map(t => t.id) || [];
        if (needIds.length === 0) return;
        setIsHydrating(true);
        needIds.forEach(tid => hydratedIdsRef.current.add(tid));
        
        try {
          const full = await scAPI.getTracks(needIds);
          const fullMap = new Map<number, SCTrack>();
          full.forEach(t => { if (t) fullMap.set(t.id, t); });
          
          setPlaylist(prev => {
            if (!prev) return prev;
            const nextTracks = prev.tracks.map(t => fullMap.get(t.id) ?? t);
            return { ...prev, tracks: nextTracks };
          });
        } catch (err) {
          console.error('[PlaylistPage] Error hydrating system playlist tracks:', err);
          needIds.forEach(tid => hydratedIdsRef.current.delete(tid));
        } finally {
          setIsHydrating(false);
        }
      };
      
      hydrateSystemPlaylist();
      return;
    }

    if (!id) return;

    // Проверяем, если это URN системного плейлиста
    const isUrn = id.includes(':') || id.startsWith('soundcloud:');
    const cacheKey = `page:playlist:${id}`;
    const cached = usePageCacheStore.getState().getPageCache<SCPlaylist>(cacheKey, PLAYLIST_CACHE_TTL_MS);
    if (cached) {
      setPlaylist(cached);
      // Помечаем уже гидрированные треки в кеше, чтобы не запрашивать их снова
      hydratedIdsRef.current = new Set(
        cached.tracks.filter(isFullTrack).map(t => t.id)
      );
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        
        let playlistData: SCPlaylist;
        if (isUrn) {
          // Загружаем системный плейлист по URN
          playlistData = await scAPI.getSystemPlaylist(id);
        } else {
          // Загружаем обычный плейлист по ID
          playlistData = await scAPI.getPlaylist(Number(id), PLAYLIST_STUB_LIMIT);
        }

        // Добавляем fallback обложку для плейлиста без обложки
        // Берём с 5-го трека (индекс 4), если нет — с 4-го, и т.д.
        if (!playlistData.artwork_url && playlistData.tracks && playlistData.tracks.length > 0) {
          const tracks = playlistData.tracks;
          const maxIdx = Math.min(4, tracks.length - 1); // начинаем с 5-го (индекс 4) или последнего
          let fallbackArtwork: string | null = null;
          for (let i = maxIdx; i >= 0; i--) {
            if (tracks[i]?.artwork_url) {
              fallbackArtwork = tracks[i].artwork_url;
              break;
            }
          }
          if (fallbackArtwork) {
            playlistData.artwork_url = fallbackArtwork;
          }
        }

        // Гидрируем только первую видимую страницу одним батчевым запросом
        const tracks = playlistData.tracks || [];
        const firstPage = tracks.slice(0, PAGE_SIZE);
        const needIds = firstPage.filter(t => !isFullTrack(t)).map(t => t.id);

        let fullMap = new Map<number, SCTrack>();
        if (needIds.length > 0) {
          try {
            const full = await scAPI.getTracks(needIds);
            full.forEach(t => { if (t) fullMap.set(t.id, t); });
          } catch (err) {
            console.error('Ошибка гидрации первой страницы плейлиста:', err);
          }
        }

        const hydratedTracks = tracks.map(t => fullMap.get(t.id) ?? t);

        if (!cancelled) {
          const parsed = { ...playlistData, tracks: hydratedTracks };
          setPlaylist(parsed);
          hydratedIdsRef.current = new Set(
            hydratedTracks.filter(isFullTrack).map(t => t.id)
          );
          usePageCacheStore.getState().setPageCache(cacheKey, parsed);
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
  }, [id, location.state]);

  const handlePlayTrack = (track: SCTrack, index: number) => {
    const isCurrent = currentTrack?.id === track.id;
    if (isCurrent) togglePlay();
    else if (playlist) playTrack(track, playlist.tracks, index);
  };

  const handlePlayAll = () => {
    if (playlist && playlist.tracks.length > 0) {
      const isCurrentTrackInPlaylist = currentTrack && playlist.tracks.some(t => t.id === currentTrack.id);
      if (isCurrentTrackInPlaylist && isPlaying) {
        togglePlay();
      } else if (isCurrentTrackInPlaylist && !isPlaying) {
        togglePlay();
      } else {
        playTrack(playlist.tracks[0], playlist.tracks, 0);
      }
    }
  };

  const handleShare = async () => {
    if (!playlist) return;
    try {
      await navigator.clipboard.writeText(playlist.permalink_url || window.location.href);
      setShowToast(true);
      setIsToastHiding(false);
      setTimeout(() => setIsToastHiding(true), 2700);
      setTimeout(() => { setShowToast(false); setIsToastHiding(false); }, 3000);
    } catch {}
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <CoverHeaderSkeleton />
        <div className="space-y-0.5">
          {Array.from({ length: 12 }).map((_, i) => <RowSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <EmptyState
        title="Не удалось загрузить плейлист"
        description={error || 'Плейлист не найден'}
      />
    );
  }

  const createdDate = new Date(playlist.created_at).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const totalDuration = playlist.tracks.reduce((acc, track) => acc + track.duration, 0);

  return (
    <div key={id} className="max-w-6xl mx-auto animate-slide-up">
      {/* Header с обложкой и основной информацией */}
      <div className="flex flex-col lg:flex-row gap-8 mb-8">
        {/* Обложка */}
        <div className="flex-shrink-0">
          <div className="relative w-64 h-64 lg:w-80 lg:h-80 rounded-xl overflow-hidden bg-surface-alt shadow-2xl group">
            {playlist.artwork_url ? (
              <img
                src={hiResArtwork(playlist.artwork_url)}
                alt={playlist.title}
                className="w-full h-full object-cover"
                draggable={false}
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src !== playlist.artwork_url!) { img.src = playlist.artwork_url!; }
                  else { img.style.display = 'none'; }
                }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
                <ListMusic size={56} className="text-accent/40" />
              </div>
            )}

            {/* Кнопка play поверх обложки */}
            <button
              onClick={handlePlayAll}
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
                style={{
                  background: 'rgb(var(--theme-accent))',
                  color: 'rgb(var(--theme-accent-fg))',
                  boxShadow: '0 4px 24px rgb(var(--theme-accent) / 0.6)',
                }}
              >
                {currentTrack && playlist.tracks.some(t => t.id === currentTrack.id) && isPlaying ? (
                  <Pause size={24} fill="currentColor" />
                ) : (
                  <Play size={24} fill="currentColor" className="translate-x-0.5" />
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Информация о плейлисте */}
        <div className="flex-1 min-w-0">
          <div className="mb-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {playlist.is_album && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-accent/20 text-accent">
                    Album
                  </span>
                )}
                <h1 className="text-3xl md:text-5xl font-bold mb-2 truncate" title={playlist.title}>{playlist.title}</h1>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => togglePlaylistLike(playlist.id, playlist)}
                  className={cn('w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110', isLiked(playlist.id, playlist.urn) ? 'text-accent bg-accent/10' : 'text-text-dim hover:text-accent hover:bg-surface-alt')}
                >
                  <Heart size={18} fill={isLiked(playlist.id, playlist.urn) ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={handleShare}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-text-dim hover:text-accent hover:bg-surface-alt transition-all hover:scale-110"
                >
                  <Share2 size={18} />
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 mb-4">
            {playlist.kind === 'system-playlist' ? (
              // Для системных плейлистов - обычный текст без клика
              <div className="flex items-center gap-2">
                {playlist.user.avatar_url && (
                  <img
                    src={playlist.user.avatar_url}
                    alt={playlist.user.username}
                    className="w-6 h-6 rounded-full"
                    draggable={false}
                  />
                )}
                <span className="text-base text-text">
                  {playlist.user.username}
                </span>
              </div>
            ) : (
              // Для обычных плейлистов - кликабельная ссылка
              <div
                onClick={() => navigate(`/user/${playlist.user.id}`)}
                className="flex items-center gap-2 cursor-pointer"
              >
                {playlist.user.avatar_url && (
                  <img
                    src={playlist.user.avatar_url}
                    alt={playlist.user.username}
                    className="w-6 h-6 rounded-full"
                    draggable={false}
                  />
                )}
                <span className="text-base text-text hover:text-accent transition-colors">
                  {playlist.user.username}
                </span>
              </div>
            )}
            {playlist.user.verified && (
              <span className="text-accent">✓</span>
            )}
          </div>

          {playlist.description && (
            <p className="text-base text-text mb-4 whitespace-pre-wrap max-w-2xl">
              {playlist.description}
            </p>
          )}

          {/* Статистика */}
          <div className="flex flex-wrap items-center gap-6 text-base">
            <div className="flex items-center gap-2">
              <ListMusic size={18} className="text-text-dim" />
              <span className="font-bold">{playlist.track_count}</span>
              <span className="text-text">tracks</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-text-dim" />
              <span className="font-bold">{formatTime(totalDuration / 1000)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-text-dim" />
              <span className="text-text">{createdDate}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Список треков */}
      {isHydrating ? (
        <div>
          <h2 className="text-2xl font-bold mb-4">Треки</h2>
          <div className="space-y-1">
            {Array.from({ length: Math.min(playlist.tracks.length, 10) }, (_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : playlist.tracks.length > 0 ? (
        <div>
          <h2 className="text-2xl font-bold mb-4">Треки</h2>
          <div className="space-y-1">
            {playlist.tracks.slice(0, visibleCount).map((track, index) => {
              const isCurrent = currentTrack?.id === track.id;
              return (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index}
                  isCurrent={isCurrent}
                  isPlaying={isPlaying}
                  onPlay={() => handlePlayTrack(track, index)}
                  onNavigateTrack={() => navigate(`/track/${track.id}`)}
                  onNavigateUser={track.user?.id ? () => navigate(`/user/${track.user!.id}`) : undefined}
                  showIndex
                />
              );
            })}
          </div>
          <div ref={loadMoreRef} className="flex justify-center py-4">
            {visibleCount < (playlist.tracks?.length || 0) && <Spinner />}
          </div>
        </div>
      ) : (
        <EmptyState title="Плейлист пуст" description="В этом плейлисте пока нет треков" />
      )}

      {/* Toast — portal в document.body чтобы обойти contain:layout на main */}
      {showToast && createPortal(
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-surface border border-white/10 shadow-2xl text-sm font-medium select-none transition-all duration-300 ${
            isToastHiding ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
          }`}
        >
          <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-400"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <span>Ссылка скопирована</span>
        </div>,
        document.body
      )}
    </div>
  );
}
