import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Volume1,
  Heart,
  ListMusic,
  Mic2,
  X,
  Users,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { formatTime, hiResArtwork, cn } from '@/utils/format';
import { useListenPartyStore } from '@/store/listenParty';
import { ListenPartyModal } from '@/components/player/ListenPartyModal';
import { EqualizerPanel } from '@/components/player/EqualizerPanel';
import { useT } from '@/store/i18n';

export function PlayerBar() {
  const t = useT();
  const navigate = useNavigate();
  // Батчевые селекторы — один ре-рендер вместо 12
  const {
    track, isPlaying, isLoading, isRefreshingStream,
    currentTime, duration, volume, muted,
    shuffle, repeat, autoplay, queue, queueIndex,
  } = usePlayerStore((s) => ({
    track:              s.currentTrack,
    isPlaying:          s.isPlaying,
    isLoading:          s.isLoading,
    isRefreshingStream: s.isRefreshingStream,
    currentTime:        s.currentTime,
    duration:           s.duration,
    volume:             s.volume,
    muted:              s.muted,
    shuffle:            s.shuffle,
    repeat:             s.repeat,
    autoplay:           s.autoplay,
    queue:              s.queue,
    queueIndex:         s.queueIndex,
  }), (a, b) =>
    a.track?.id        === b.track?.id        &&
    a.isPlaying        === b.isPlaying        &&
    a.isLoading        === b.isLoading        &&
    a.isRefreshingStream === b.isRefreshingStream &&
    a.currentTime      === b.currentTime      &&
    a.duration         === b.duration         &&
    a.volume           === b.volume           &&
    a.muted            === b.muted            &&
    a.shuffle          === b.shuffle          &&
    a.repeat           === b.repeat           &&
    a.autoplay         === b.autoplay         &&
    a.queueIndex       === b.queueIndex       &&
    a.queue.length     === b.queue.length
  );
  const toggleLike = useUIStore((s) => s.toggleLike);
  const togglePlaylistLike = useUIStore((s) => s.togglePlaylistLike);
  const isLiked = useUIStore((s) => s.isLiked);

  const [showQueue, setShowQueue] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showParty, setShowParty] = useState(false);
  const [showEq, setShowEq] = useState(false);

  const partyStatus = useListenPartyStore((s) => s.status);
  const eqEnabled   = useUIStore((s) => s.eqEnabled);
  const partyRole = useListenPartyStore((s) => s.role);
  const isInParty = partyStatus === 'connected' || partyStatus === 'hosting' || partyStatus === 'joining';

  const handleQueueClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowQueue(false);
      setIsClosing(false);
    }, 200);
  };

  const currentTrackRef = useRef<HTMLDivElement | null>(null);

  // Автоскролл к текущему треку при открытии панели
  useEffect(() => {
    if (showQueue && currentTrackRef.current) {
      setTimeout(() => {
        currentTrackRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 50);
    }
  }, [showQueue]);

  const location = useLocation();
  const isOnLyrics = location.pathname === '/lyrics';

  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const next = usePlayerStore((s) => s.next);
  const previous = usePlayerStore((s) => s.previous);
  const seek = usePlayerStore((s) => s.seek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const toggleAutoplay = usePlayerStore((s) => s.toggleAutoplay);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const queueLoader = usePlayerStore((s) => s.queueLoader);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const isTrackLiked = track
    ? ((track as any).kind === 'playlist' || (track as any).isSystemPlaylist || (track as any).urn?.startsWith('soundcloud:system-playlists:'))
      ? isLiked(track.id, (track as any).urn)
      : isLiked(track.id)
    : false;

  return (
    <>
    <div
      className="player-bar-root h-[88px] relative z-20 px-4 flex items-center gap-4"
      style={{
        background: 'rgb(var(--theme-surface) / var(--theme-surface-opacity, 0.95))',
        borderTop: '1px solid rgb(var(--theme-border) / 0.3)',
      }}
    >
      {/* Прогресс-бар вверху */}
      <div className="absolute top-0 left-0 right-0 px-0">
        <ProgressSlider
          value={progress}
          onSeek={(pct) => seek((pct / 100) * duration)}
          topBar
        />
      </div>

      {/* Левая секция: трек */}
      <div className="flex items-center gap-3 min-w-0 w-[280px]">
        {track ? (
          <>
            <div
              onClick={() => navigate(`/track/${track.id}`)}
              className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
            >
              <div
                className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 relative"
                style={{ background: 'rgb(var(--theme-surface-alt))' }}
              >
                {(track.artwork_url || track.user?.avatar_url) ? (
                  <img
                    src={hiResArtwork(track.artwork_url || track.user?.avatar_url)}
                    alt={track.title}
                    className="w-full h-full object-cover"
                    draggable={false}
                    onError={(e) => {
                      const img = e.currentTarget;
                      const orig = track.artwork_url || track.user?.avatar_url || '';
                      if (img.src !== orig) { img.src = orig; }
                      else { img.style.display = 'none'; }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ListMusic size={18} className="text-text-dim" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-300 rounded-xl" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-[14px] font-semibold truncate group-hover:text-accent transition-colors duration-200 leading-tight"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '-0.02em' }}
                >
                  {track.title}
                </div>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (track.user?.id) navigate(`/user/${track.user.id}`);
                  }}
                  className="text-[12.5px] text-text-dim truncate group-hover:text-accent cursor-pointer transition-colors duration-200 mt-0.5"
                >
                  {track.user.username}
                </div>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!track) return;
                const isPlaylist = (track as any).kind === 'playlist' || (track as any).isSystemPlaylist || (track as any).urn?.startsWith('soundcloud:system-playlists:');
                if (isPlaylist) togglePlaylistLike(track.id, track as any);
                else toggleLike(track.id, track);
              }}
              className="p-2 rounded-full hover:bg-surface-alt/60 pb-button"
              aria-label={t('player_favorites')}
            >
              <Heart
                size={15}
                fill={isTrackLiked ? 'currentColor' : 'none'}
                className={isTrackLiked ? 'text-accent' : 'text-text-dim hover:text-text transition-colors duration-200'}
              />
            </button>
          </>
        ) : (
          <div className="text-sm text-text-dim italic opacity-60">{t('player_no_track')}</div>
        )}
      </div>

      {/* Центральная секция: контролы */}
      <div className="flex-1 flex flex-col items-center gap-2.5 max-w-xl mx-auto">
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleShuffle}
            className={cn(
              'p-2 rounded-full pb-button',
              shuffle ? 'text-accent bg-accent/10' : 'text-text-dim hover:text-text hover:bg-surface-alt/50'
            )}
            aria-label={t('player_shuffle')}
            title={t('player_shuffle')}
          >
            <Shuffle size={15} strokeWidth={shuffle ? 2.2 : 1.8} />
          </button>
          <button
            onClick={previous}
            className="p-2 rounded-full text-text-dim hover:text-text hover:bg-surface-alt/50 pb-button"
            aria-label={t('player_previous')}
            title={t('player_previous')}
          >
            <SkipBack size={17} fill="currentColor" />
          </button>

          {/* Главная кнопка Play */}
          <button
            onClick={togglePlay}
            disabled={!track || isLoading || isRefreshingStream || (isInParty && partyRole === 'listener')}
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-200 disabled:opacity-40',
              'hover:scale-108 active:scale-92'
            )}
            style={{
              background: 'rgb(var(--theme-accent))',
              color: 'rgb(var(--theme-accent-fg))',
            }}
            aria-label={isPlaying ? t('player_pause') : t('player_play')}
            title={isInParty && partyRole === 'listener' ? t('player_party_host_control') : undefined}
          >
            {isLoading || isRefreshingStream ? (
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgb(var(--theme-accent-fg) / 0.3)', borderTopColor: 'rgb(var(--theme-accent-fg))' }} />
            ) : isPlaying ? (
              <Pause size={17} fill="currentColor" />
            ) : (
              <Play size={17} fill="currentColor" className="translate-x-0.5" />
            )}
          </button>

          <button
            onClick={next}
            className="p-2 rounded-full text-text-dim hover:text-text hover:bg-surface-alt/50 pb-button"
            aria-label={t('player_next')}
            title={t('player_next')}
          >
            <SkipForward size={17} fill="currentColor" />
          </button>
          <button
            onClick={cycleRepeat}
            className={cn(
              'p-2 rounded-full pb-button',
              repeat !== 'off' ? 'text-accent bg-accent/10' : 'text-text-dim hover:text-text hover:bg-surface-alt/50'
            )}
            aria-label={t('player_repeat')}
            title={t('player_repeat')}
          >
            {repeat === 'one' ? <Repeat1 size={15} strokeWidth={2.2} /> : <Repeat size={15} strokeWidth={repeat !== 'off' ? 2.2 : 1.8} />}
          </button>
        </div>

        {/* Время */}
        <div className="flex items-center gap-2.5 w-full">
          <span className="text-[10.5px] text-text-dim tabular-nums w-9 text-right opacity-70">
            {formatTime(currentTime)}
          </span>
          <ProgressSlider
            value={progress}
            onSeek={isInParty && partyRole === 'listener' ? () => {} : (pct) => seek((pct / 100) * duration)}
          />
          <span className="text-[10.5px] text-text-dim tabular-nums w-9 opacity-70">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Правая секция */}
      <div className="flex items-center gap-1 w-[280px] justify-end">
        {/* Equalizer */}
        <button
          onClick={() => setShowEq(v => !v)}
          className={cn(
            'relative p-2 rounded-full pb-button',
            (showEq || eqEnabled)
              ? 'text-accent bg-accent/10'
              : 'text-text-dim hover:text-text hover:bg-surface-alt/50'
          )}
          aria-label={t('player_equalizer')}
          title={t('player_equalizer')}
        >
          <SlidersHorizontal size={16} strokeWidth={(showEq || eqEnabled) ? 2.2 : 1.8} />
          {eqEnabled && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: 'rgb(var(--theme-accent))' }} />
          )}
        </button>

        {/* Listen Party */}
        <button
          onClick={() => setShowParty(true)}
          className={cn(
            'relative p-2 rounded-full pb-button',
            isInParty
              ? 'text-accent bg-accent/10'
              : 'text-text-dim hover:text-text hover:bg-surface-alt/50'
          )}
          aria-label={t('player_listen_together')}
          title={t('player_listen_together')}
        >
          <Users size={16} strokeWidth={isInParty ? 2.2 : 1.8} />
          {partyStatus === 'connected' && (
            <span
              className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
              style={{ background: 'rgb(34 197 94)' }}
            />
          )}
        </button>

        <button
          onClick={() => isOnLyrics ? navigate(-1) : navigate('/lyrics')}
          disabled={!track}
          className={cn(
            'p-2 rounded-full pb-button disabled:opacity-30',
            isOnLyrics ? 'text-accent bg-accent/10' : 'text-text-dim hover:text-text hover:bg-surface-alt/50'
          )}
          aria-label={t('player_lyrics')}
        >
          <Mic2 size={16} strokeWidth={isOnLyrics ? 2.2 : 1.8} />
        </button>
        <button
          onClick={() => showQueue ? handleQueueClose() : setShowQueue(true)}
          className="p-2 rounded-full text-text-dim hover:text-text hover:bg-surface-alt/50 pb-button"
          aria-label={t('player_queue')}
        >
          <ListMusic size={16} strokeWidth={1.8} />
        </button>
        <button
          onClick={toggleMute}
          className="p-2 rounded-full text-text-dim hover:text-text hover:bg-surface-alt/50 pb-button"
          aria-label={t('player_volume')}
        >
          <VolIcon size={16} strokeWidth={1.8} />
        </button>
        <div className="relative w-20 group/vol">
          <ProgressSlider
            value={muted ? 0 : volume * 100}
            onSeek={(pct) => setVolume(pct / 100)}
          />
          {/* Tooltip с процентом громкости */}
          <div
            className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md text-[11px] font-medium pointer-events-none opacity-0 group-hover/vol:opacity-100 transition-opacity duration-150 whitespace-nowrap"
            style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text))', border: '1px solid rgb(var(--theme-border) / 0.4)' }}
          >
            {muted ? '0%' : `${Math.round(volume * 100)}%`}
          </div>
        </div>
      </div>

      {/* Очередь */}
      {(showQueue || isClosing) && (
        <div
          className="absolute bottom-[92px] right-4 w-[360px] rounded-2xl shadow-2xl overflow-hidden z-30 flex flex-col"
          style={{
            maxHeight: '520px',
            background: 'rgb(var(--theme-surface))',
            border: '1px solid rgb(var(--theme-border) / 0.4)',
            // contain изолирует layout/paint этой панели от остального документа
            contain: 'layout style paint',
            // willChange подсказывает браузеру держать панель в отдельном compositor-слое
            willChange: 'transform, opacity',
            animation: isClosing ? 'fadeOutSlideDown 0.2s ease-out' : 'fadeInSlideUp 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {/* Заголовок */}
          <div className="flex items-center justify-between px-4 pt-3.5 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid rgb(var(--theme-border) / 0.2)' }}>
            <span className="font-semibold text-[13px]" style={{ color: 'rgb(var(--theme-text))', letterSpacing: '-0.02em' }}>
              {t('queue_title')}
            </span>
            <div className="flex items-center gap-2">
              {queue.length > 1 && (
                <button
                  onClick={() => {
                    const current = queue[queueIndex];
                    usePlayerStore.setState({ queue: current ? [current] : [], queueIndex: 0 });
                  }}
                  className="queue-header-btn text-[11px] font-medium px-2.5 py-1 rounded-lg"
                >
                  {t('queue_clear')}
                </button>
              )}
              <button
                onClick={handleQueueClose}
                className="queue-header-btn w-7 h-7 rounded-full flex items-center justify-center"
              >
                <X size={14} strokeWidth={2.2} />
              </button>
            </div>
          </div>

          {/* Список */}
          <div
            className="overflow-y-auto flex-1"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgb(var(--theme-border) / 0.3) transparent' }}
          >
            {queue && queue.length > 0 ? (
              <QueueList
                queue={queue}
                queueIndex={queueIndex}
                isPlaying={isPlaying}
                currentTrackRef={currentTrackRef}
                onPlay={(track, i) => playTrack(track, queue, i)}
                onRemove={removeFromQueue}
                onReorder={(from, to) => {
                  const newQueue = [...queue];
                  const [moved] = newQueue.splice(from, 1);
                  newQueue.splice(to, 0, moved);
                  let newIndex = queueIndex;
                  if (from === queueIndex) newIndex = to;
                  else if (from < queueIndex && to >= queueIndex) newIndex = queueIndex - 1;
                  else if (from > queueIndex && to <= queueIndex) newIndex = queueIndex + 1;
                  usePlayerStore.setState({ queue: newQueue, queueIndex: newIndex });
                }}
                togglePlay={togglePlay}
                navigate={navigate}
                queueLoader={queueLoader ? async () => {
                  // loader страницы (Likes/Feed/…) обновляет свой стейт и
                  // возвращает новые треки. Здесь мы дополнительно добавляем
                  // их в store-queue, чтобы они появились в списке очереди.
                  const moreTracks = await queueLoader();
                  if (moreTracks.length > 0) {
                    const cur = usePlayerStore.getState().queue;
                    usePlayerStore.setState({ queue: [...cur, ...moreTracks] });
                  }
                  return moreTracks;
                } : null}
              />
            ) : (
              <div className="py-12 text-center text-[13px]" style={{ color: 'rgb(var(--theme-text-dim))' }}>
                {t('queue_empty')}
              </div>
            )}
          </div>

          {/* Футер — autoplay */}
          <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0" style={{ borderTop: '1px solid rgb(var(--theme-border) / 0.2)' }}>
            <span className="text-[12px]" style={{ color: 'rgb(var(--theme-text-dim))' }}>{t('queue_autoplay')}</span>
            <button
              onClick={toggleAutoplay}
              className="relative rounded-full transition-colors duration-200 flex-shrink-0"
              style={{ width: 32, height: 18, background: autoplay ? 'rgb(var(--theme-accent))' : 'rgb(var(--theme-border))' }}
            >
              <span
                className="absolute top-0.5 rounded-full bg-white transition-transform duration-200"
                style={{ width: 14, height: 14, left: 2, transform: autoplay ? 'translateX(14px)' : 'translateX(0)' }}
              />
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Equalizer */}
    {showEq && <EqualizerPanel onClose={() => setShowEq(false)} />}

    {/* Listen Party Modal */}
    {showParty && <ListenPartyModal onClose={() => setShowParty(false)} />}
    </>
  );
}

// ─── Queue components ─────────────────────────────────────────────────────────

function QueueList({ queue, queueIndex, isPlaying, currentTrackRef, onPlay, onRemove, onReorder, togglePlay, navigate, queueLoader }: {
  queue: any[];
  queueIndex: number;
  isPlaying: boolean;
  currentTrackRef: React.RefObject<HTMLDivElement>;
  onPlay: (track: any, i: number) => void;
  onRemove: (i: number) => void;
  onReorder: (from: number, to: number) => void;
  togglePlay: () => void;
  navigate: (path: string) => void;
  queueLoader: (() => Promise<any[]>) | null;
}) {
  const dragIndexRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loaderRef = useRef(queueLoader);
  loaderRef.current = queueLoader;
  // Ref-guard: предотвращает двойной вызов из-за пересоздания observer
  // при изменении loadingMore (stale closure внутри async-колбэка)
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !queueLoader) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || !loaderRef.current || loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      loaderRef.current()
        .catch((e) => console.error('[Queue] loadMore error:', e))
        .finally(() => {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        });
    }, { threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
    // loadingMore намеренно НЕ в deps — иначе observer пересоздаётся
    // после каждой подгрузки и сразу срабатывает снова на видимом sentinel
  }, [queueLoader]);

  return (
    <div className="py-1">
      {queue.map((track, i) => (
        <QueueRow
          key={`${track.id}-${i}`}
          track={track}
          isCurrent={i === queueIndex}
          isPlayed={i < queueIndex}
          isPlaying={isPlaying}
          isDragOver={dragOver === i}
          currentTrackRef={i === queueIndex ? currentTrackRef : undefined}
          onClick={() => onPlay(track, i)}
          onRemove={i !== queueIndex ? () => onRemove(i) : undefined}
          togglePlay={togglePlay}
          onNavigate={() => navigate(`/track/${track.id}`)}
          draggable={i !== queueIndex}
          onDragStart={() => { dragIndexRef.current = i; }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={() => {
            setDragOver(null);
            const from = dragIndexRef.current;
            dragIndexRef.current = null;
            if (from !== null && from !== i) onReorder(from, i);
          }}
          onDragEnd={() => { dragIndexRef.current = null; setDragOver(null); }}
        />
      ))}

      {queueLoader && (
        <div ref={sentinelRef} className="flex items-center justify-center py-3 px-4">
          {loadingMore ? (
            <div className="flex items-center gap-2" style={{ color: 'rgb(var(--theme-text-dim))' }}>
              <svg className="animate-spin w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <span className="text-[11px]">Загружаем...</span>
            </div>
          ) : (
            <div className="h-1 w-full" />
          )}
        </div>
      )}
    </div>
  );
}

const QueueRow = memo(function QueueRow({ track, isCurrent, isPlayed, isPlaying, isDragOver, currentTrackRef, onClick, onRemove, togglePlay, onNavigate, draggable, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }: {
  track: any;
  isCurrent: boolean;
  isPlayed: boolean;
  isPlaying: boolean;
  isDragOver: boolean;
  currentTrackRef?: React.RefObject<HTMLDivElement>;
  onClick: () => void;
  onRemove?: () => void;
  togglePlay: () => void;
  onNavigate: () => void;
  draggable: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  // hover-стили вынесены в CSS — нет re-render при движении мыши
  const showPlaying = isCurrent && isPlaying;
  const rowClass = [
    'queue-row flex items-center gap-3 px-4 py-2.5 relative',
    isCurrent ? 'is-current' : '',
    isPlayed ? 'is-played' : '',
    isPlaying ? 'is-playing' : '',
    isDragOver ? 'is-drag-over' : '',
    !onRemove ? 'no-trash' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={currentTrackRef as React.RefObject<HTMLDivElement>}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={isCurrent ? undefined : onClick}
      className={rowClass}
      style={{ cursor: draggable ? 'grab' : 'default' }}
    >
      {/* Обложка с play/pause оверлеем */}
      <div
        className="relative flex-shrink-0 rounded-lg overflow-hidden cursor-pointer"
        style={{ width: 44, height: 44, background: 'rgb(var(--theme-surface-alt))' }}
        onClick={(e) => { e.stopPropagation(); isCurrent ? togglePlay() : onClick(); }}
      >
        {track.artwork_url ? (
          <img
            src={hiResArtwork(track.artwork_url)}
            alt={track.title}
            className="queue-artwork-img w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgb(var(--theme-accent) / 0.08)' }}>
            <ListMusic size={16} style={{ color: 'rgb(var(--theme-accent) / 0.35)' }} />
          </div>
        )}
        <div
          className="queue-artwork-overlay absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgb(0 0 0 / 0.45)' }}
        >
          {/* Soundbar: виден только когда играет и не hover (через CSS) */}
          <div className="queue-soundbar items-end gap-[3px]" style={{ height: 14 }}>
            {[0, 1, 2].map(i => (
              <div key={i} className="w-[3px] rounded-full bg-white"
                style={{ height: '100%', animation: `soundbar 0.7s ease-in-out ${i * 0.18}s infinite alternate` }}
              />
            ))}
          </div>
          {/* Play кнопка: видна на hover (через CSS) */}
          <div className="queue-play-btn w-7 h-7 rounded-full items-center justify-center" style={{ background: 'rgb(var(--theme-accent))' }}>
            {showPlaying
              ? <Pause size={12} fill="white" color="white" />
              : <Play size={12} fill="white" color="white" className="translate-x-px" />
            }
          </div>
        </div>
      </div>

      {/* Текст */}
      <div className="flex-1 min-w-0">
        <div
          className="text-[13px] font-medium truncate leading-snug cursor-pointer"
          style={{ color: isCurrent ? 'rgb(var(--theme-accent))' : 'rgb(var(--theme-text))' }}
          onClick={(e) => { e.stopPropagation(); onNavigate(); }}
        >
          {track.title}
        </div>
        <div className="text-[11.5px] truncate mt-0.5 leading-snug" style={{ color: 'rgb(var(--theme-text-dim))' }}>
          {track.user?.username || 'Unknown Artist'}
        </div>
      </div>

      {/* Время или удалить — переключаются через :hover в CSS */}
      <div className="flex-shrink-0 flex items-center justify-end" style={{ width: 36 }}>
        <span className="queue-time text-[11px] tabular-nums" style={{ color: 'rgb(var(--theme-text-dim))' }}>
          {formatTime(track.duration / 1000)}
        </span>
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="queue-trash w-7 h-7 rounded-full items-center justify-center"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
});

interface ProgressSliderProps {
  value: number;
  onSeek: (value: number) => void;
  topBar?: boolean;
}

function ProgressSlider({ value, onSeek, topBar = false }: ProgressSliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const calcPct = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, pct));
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    onSeek(calcPct(e.clientX));
    const onMove = (ev: MouseEvent) => onSeek(calcPct(ev.clientX));
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (topBar) {
    return (
      <div
        ref={ref}
        className="h-[2px] cursor-pointer relative group/topbar"
        style={{ background: 'rgb(var(--theme-border) / 0.5)' }}
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => setHoverPct(calcPct(e.clientX))}
        onMouseLeave={() => setHoverPct(null)}
      >
        <div
          className="absolute inset-y-0 left-0 right-0 transition-none origin-left"
          style={{ transform: `scaleX(${value / 100})`, background: 'rgb(var(--theme-accent) / 0.8)' }}
        />
        {hoverPct !== null && (
          <div
            className="absolute inset-y-0 pointer-events-none"
            style={{ width: `${hoverPct}%`, background: 'rgb(var(--theme-text) / 0.08)' }}
          />
        )}
        {/* Hover indicator */}
        <div className="absolute inset-0 group-hover/topbar:h-[3px] h-[2px] transition-all duration-150" />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="progress-slider flex-1"
      onMouseDown={handleMouseDown}
      onMouseMove={(e) => setHoverPct(calcPct(e.clientX))}
      onMouseLeave={() => setHoverPct(null)}
    >
      {hoverPct !== null && !dragging && (
        <div
          className="absolute top-0 bottom-0 rounded-inherit"
          style={{ width: `${hoverPct}%`, background: 'rgb(var(--theme-text) / 0.1)' }}
        />
      )}
      <div className="progress-slider-fill" style={{ transform: `scaleX(${value / 100})`, transformOrigin: 'left center' }} />
      <div className="progress-slider-thumb" style={{ left: `${value}%` }} />
    </div>
  );
}
