import { Play, Pause, Heart, Music2, ListMusic } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, memo, useCallback } from 'react';
import type { SCTrack } from '@/types/soundcloud';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';
import { formatTime, hiResArtwork, formatCount, cn } from '@/utils/format';

interface Props {
  track: SCTrack;
  queue?: SCTrack[];
  index?: number;
  variant?: 'grid' | 'row';
}

const TrackCardInner = memo(function TrackCardInner({
  track,
  variant = 'grid',
  isCurrent,
  showPlaying,
  isLiked,
  onPlay,
  onLike,
}: {
  track: SCTrack;
  variant?: 'grid' | 'row';
  isCurrent: boolean;
  showPlaying: boolean;
  isLiked: boolean;
  onPlay: () => void;
  onLike: (e: React.MouseEvent) => void;
}) {
  const navigate = useNavigate();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [likeAnim, setLikeAnim] = useState<'pop' | 'unpop' | null>(null);
  const isPlaylistItem = (track as any).kind === 'playlist' || (track as any).isSystemPlaylist;

  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLikeAnim(isLiked ? 'unpop' : 'pop');
    onLike(e);
  };

  const artworkSrc = track.artwork_url ?? (() => {
    if (!isPlaylistItem) return track.user?.avatar_url ?? null;
    // Для плейлистов: перебираем треки в поисках обложки
    const pts: any[] = (track as any).tracks || [];
    const maxIdx = Math.min(4, pts.length - 1);
    for (let i = maxIdx; i >= 0; i--) {
      if (pts[i]?.artwork_url) return pts[i].artwork_url as string;
    }
    // Фолбек: аватар владельца плейлиста (как в оригинальном SC)
    if (track.user?.avatar_url) return track.user.avatar_url;
    return null;
  })();

  const handleCardClick = () => {
    if (isPlaylistItem) {
      const urn = (track as any).urn as string | undefined;
      const isSystemUrn = urn?.startsWith('soundcloud:system-playlists:');
      if ((track as any).tracks?.length > 0) {
        navigate('/playlist/system', { state: { tracks: (track as any).tracks, title: (track as any).playlistTitle || track.title, description: (track as any).playlistDescription || '', artwork_url: track.artwork_url, isSystemPlaylist: true } });
        return;
      }
      if (isSystemUrn && urn) { navigate(`/playlist/${encodeURIComponent(urn)}`); return; }
      if ((track as any).id) { navigate(`/playlist/${(track as any).id}`); return; }
    }
    navigate(`/track/${track.id}`);
  };

  if (variant === 'row') {
    return (
      <div
        className={cn(
          'group flex items-center gap-3 p-2 rounded-xl transition-all duration-150 cursor-pointer',
          isCurrent ? 'bg-surface-alt/50' : 'hover:bg-surface-alt/40'
        )}
        onClick={handleCardClick}
        onDoubleClick={onPlay}
      >
        <div className="w-11 h-11 rounded-lg overflow-hidden relative flex-shrink-0" style={{ background: 'rgb(var(--theme-surface-alt))' }}>
          {!imgLoaded && artworkSrc && <div className="absolute inset-0 skeleton-shimmer" />}
          {artworkSrc && (
            <img
              src={imgError ? artworkSrc : hiResArtwork(artworkSrc)}
              alt=""
              className={cn('w-full h-full object-cover transition-opacity duration-300', imgLoaded ? 'opacity-100' : 'opacity-0')}
              draggable={false}
              onLoad={() => setImgLoaded(true)}
              onError={(e) => { if (!imgError) { setImgError(true); } else { (e.target as HTMLImageElement).style.display = 'none'; setImgLoaded(true); } }}
            />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            className={cn('absolute inset-0 flex items-center justify-center transition-opacity', showPlaying ? 'opacity-100 bg-black/50' : 'opacity-0 group-hover:opacity-100 bg-black/50')}
          >
            {showPlaying ? <Pause size={16} fill="white" className="text-white" /> : <Play size={16} fill="white" className="text-white translate-x-0.5" />}
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn('text-[14px] font-semibold truncate leading-tight', isCurrent && 'text-accent')}>{track.title}</div>
          <div
            className="text-[12.5px] text-text-dim truncate hover:text-accent cursor-pointer transition-colors mt-0.5"
            onClick={(e) => { e.stopPropagation(); if (track.user?.id) navigate(`/user/${track.user.id}`); }}
          >
            {track.user?.username || 'Unknown Artist'}
          </div>
        </div>
        <button
          onClick={handleLikeClick}
          className={cn('p-1.5 rounded-full transition-all duration-200 opacity-0 group-hover:opacity-100 flex-shrink-0 hover:scale-110 active:scale-90', isLiked ? 'opacity-100 text-accent' : 'text-text-dim hover:text-accent')}
        >
          <Heart
            size={12}
            fill={isLiked ? 'currentColor' : 'none'}
            className={cn('transition-colors', likeAnim === 'pop' && 'heart-pop', likeAnim === 'unpop' && 'heart-unpop')}
            onAnimationEnd={() => setLikeAnim(null)}
          />
        </button>
        <span className="text-[11px] text-text-dim opacity-70 tabular-nums">{formatTime(track.duration / 1000)}</span>
      </div>
    );
  }

  return (
    <div className="group cursor-pointer min-w-0" onClick={handleCardClick}>
      {/* Обложка */}
      <div
        className="relative aspect-square rounded-2xl overflow-hidden mb-3"
        style={{ background: 'rgb(var(--theme-surface-alt))' }}
        onDoubleClick={onPlay}
      >
        {!imgLoaded && artworkSrc && <div className="absolute inset-0 skeleton-shimmer z-[1]" />}
        {artworkSrc ? (
          <img
            src={imgError ? artworkSrc : hiResArtwork(artworkSrc)}
            alt={track.title}
            className={cn('track-artwork-scale w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.06]', imgLoaded ? 'opacity-100' : 'opacity-0')}
            draggable={false}
            onLoad={() => setImgLoaded(true)}
            onError={(e) => { if (!imgError) { setImgError(true); } else { (e.target as HTMLImageElement).style.display = 'none'; setImgLoaded(true); } }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-accent/15 to-accent/5 flex items-center justify-center">
            {isPlaylistItem ? <ListMusic size={36} className="text-accent/30" /> : <Music2 size={36} className="text-accent/30" />}
          </div>
        )}

        {/* Градиент поверх */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Play кнопка */}
        <button
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
          className={cn(
            'absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300',
            'hover:scale-110 active:scale-90',
            showPlaying
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0'
          )}
          style={{
            background: 'rgb(var(--theme-accent))',
            color: 'rgb(var(--theme-accent-fg))',
            boxShadow: '0 4px 20px rgb(var(--theme-accent) / 0.55)',
          }}
        >
          {showPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="translate-x-0.5" />}
        </button>

        {/* Like кнопка */}
        <button
          onClick={handleLikeClick}
          className={cn(
            'absolute bottom-3 left-3 w-8 h-8 rounded-full flex items-center justify-center transition-[opacity,transform] duration-300',
            'hover:scale-110 active:scale-90',
            isLiked
              ? 'opacity-100 translate-y-0 shadow-lg'
              : 'opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 bg-black/40 hover:bg-black/60'
          )}
          style={isLiked ? { background: 'rgb(var(--theme-accent) / 0.85)', boxShadow: '0 0 16px rgb(var(--theme-accent) / 0.5)' } : {}}
        >
          <Heart
            size={13}
            fill={isLiked ? 'currentColor' : 'none'}
            className={cn('transition-colors duration-200', likeAnim === 'pop' && 'heart-pop', likeAnim === 'unpop' && 'heart-unpop')}
            style={{ color: isLiked ? 'rgb(var(--theme-accent-fg))' : 'white' }}
            onAnimationEnd={() => setLikeAnim(null)}
          />
        </button>

        {/* Счётчик */}
        {!isPlaylistItem && track.playback_count !== undefined && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/70 text-[10px] text-white font-medium">
            {formatCount(track.playback_count)}
          </div>
        )}
        {isPlaylistItem && (track as any).track_count !== undefined && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/70 text-[10px] text-white font-medium">
            {(track as any).track_count} тр.
          </div>
        )}

        {/* Активный индикатор */}
        {isCurrent && (
          <div
            className="absolute bottom-0 left-0 right-0 h-[3px]"
            style={{ background: 'rgb(var(--theme-accent))' }}
          />
        )}
      </div>

      {/* Метаданные */}
      <div className="space-y-1 px-0.5">
        <div
          className={cn('text-[14px] font-semibold truncate-2 leading-snug', isCurrent && 'text-accent')}
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          {track.title}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div
            className={cn(
              'text-[12.5px] text-text-dim truncate transition-colors',
              !isPlaylistItem && 'hover:text-accent cursor-pointer'
            )}
            onClick={(e) => {
              if (!isPlaylistItem) {
                e.stopPropagation();
                if (track.user?.id) navigate(`/user/${track.user.id}`);
              }
            }}
          >
            {track.user?.username || (isPlaylistItem ? 'SoundCloud' : 'Unknown Artist')}
          </div>
          {isPlaylistItem
            ? ((track as any).track_count !== undefined && (
                <div className="text-[12px] text-text-dim flex-shrink-0 whitespace-nowrap opacity-70">
                  {(track as any).track_count} треков
                </div>
              ))
            : (track.duration !== undefined && (
                <div className="text-[12px] text-text-dim flex-shrink-0 whitespace-nowrap opacity-70">
                  {formatTime(track.duration / 1000)}
                </div>
              ))
          }</div>
      </div>
    </div>
  );
});

export function TrackCard({ track, queue, index, variant = 'grid' }: Props) {
  const {
    currentTrackId,
    isPlaying,
    currentPlaylistId,
    playerQueueFirstId,
    playTrack,
    playPlaylist,
    togglePlay,
    setCurrentPlaylistId,
  } = usePlayerStore(useShallow((s) => ({
    currentTrackId: s.currentTrack?.id,
    isPlaying: s.isPlaying,
    currentPlaylistId: s.currentPlaylistId,
    playerQueueFirstId: s.queue[0]?.id,
    playTrack: s.playTrack,
    playPlaylist: s.playPlaylist,
    togglePlay: s.togglePlay,
    setCurrentPlaylistId: s.setCurrentPlaylistId,
  })));

  const { toggleLike, togglePlaylistLike, isLiked } = useUIStore(useShallow((s) => ({
    toggleLike: s.toggleLike,
    togglePlaylistLike: s.togglePlaylistLike,
    isLiked: s.isLiked,
  })));
  const allLikedIds = useUIStore((s) => s.allLikedIds);

  const isPlaylist = (track as any).kind === 'playlist' || (track as any).isSystemPlaylist || (track as any).urn?.startsWith('soundcloud:system-playlists:');
  const trackUrn = (track as any).urn;
  const isCurrent = !isPlaylist && currentTrackId === track.id;

  const cardTracks: SCTrack[] = (track as any).tracks || [];
  const isThisPlaylistActive = isPlaylist && (
    currentPlaylistId === track.id ||
    currentPlaylistId === trackUrn ||
    (cardTracks.length > 0 && currentTrackId != null && cardTracks.some(t => t.id === currentTrackId)) ||
    (playerQueueFirstId != null && cardTracks.length > 0 && playerQueueFirstId === cardTracks[0]?.id)
  );
  const showPlaying = (isCurrent || isThisPlaylistActive) && isPlaying;
  const liked = isLiked(track.id, trackUrn);

  const handlePlay = useCallback(async () => {
    if (isCurrent || isThisPlaylistActive) { togglePlay(); return; }
    const isPlaylistKind = (track as any).kind === 'playlist' || (track as any).isSystemPlaylist;
    if (isPlaylistKind) {
      const urn = (track as any).urn as string | undefined;
      const isSystemUrn = urn?.startsWith('soundcloud:system-playlists:');
      if ((track as any).tracks?.length > 0) {
        const rawTracks: SCTrack[] = (track as any).tracks;
        const playlistId = urn ?? track.id;
        if (rawTracks.length > 0 && !rawTracks[0]?.title) {
          setCurrentPlaylistId(playlistId);
          await playPlaylist({ urn: isSystemUrn ? urn : undefined, id: !isSystemUrn ? track.id : undefined });
          return;
        }
        await playTrack(rawTracks[0], rawTracks, 0, playlistId);
        return;
      }
      setCurrentPlaylistId(urn ?? track.id);
      if (isSystemUrn && urn) await playPlaylist({ urn });
      else if (track.id) await playPlaylist({ id: track.id });
      return;
    }
    playTrack(track, queue, index);
  }, [isCurrent, isThisPlaylistActive, track, queue, index, togglePlay, playTrack, playPlaylist, setCurrentPlaylistId]);

  const handleLike = useCallback((_e: React.MouseEvent) => {
    if (isPlaylist) togglePlaylistLike(track.id, track as any);
    else toggleLike(track.id, track);
  }, [isPlaylist, track, toggleLike, togglePlaylistLike]);

  return (
    <TrackCardInner
      track={track}
      variant={variant}
      isCurrent={isCurrent}
      showPlaying={showPlaying}
      isLiked={liked}
      onPlay={handlePlay}
      onLike={handleLike}
    />
  );
}
