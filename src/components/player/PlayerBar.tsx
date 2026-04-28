import { useState, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { formatTime, hiResArtwork, cn } from '@/utils/format';
import { useListenPartyStore } from '@/store/listenParty';
import { ListenPartyModal } from '@/components/player/ListenPartyModal';
import { EqualizerPanel } from '@/components/player/EqualizerPanel';

export function PlayerBar() {
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
  const allLikedIds = useUIStore((s) => s.allLikedIds);

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
              className="p-2 rounded-full hover:bg-surface-alt/60 transition-all duration-200 hover:scale-110 active:scale-90"
              aria-label="В избранное"
            >
              <Heart
                size={15}
                fill={isTrackLiked ? 'currentColor' : 'none'}
                className={isTrackLiked ? 'text-accent' : 'text-text-dim hover:text-text transition-colors duration-200'}
              />
            </button>
          </>
        ) : (
          <div className="text-sm text-text-dim italic opacity-60">Нет трека</div>
        )}
      </div>

      {/* Центральная секция: контролы */}
      <div className="flex-1 flex flex-col items-center gap-2.5 max-w-xl mx-auto">
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleShuffle}
            className={cn(
              'p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-90',
              shuffle ? 'text-accent bg-accent/10' : 'text-text-dim hover:text-text hover:bg-surface-alt/50'
            )}
            aria-label="Перемешать"
          >
            <Shuffle size={15} strokeWidth={shuffle ? 2.2 : 1.8} />
          </button>
          <button
            onClick={previous}
            className="p-2 rounded-full text-text-dim hover:text-text hover:bg-surface-alt/50 transition-all duration-200 hover:scale-110 active:scale-90"
            aria-label="Предыдущий"
          >
            <SkipBack size={17} fill="currentColor" />
          </button>

          {/* Главная кнопка Play */}
          <button
            onClick={togglePlay}
            disabled={!track || isLoading || isRefreshingStream || (isInParty && partyRole === 'listener')}
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-40',
              'hover:scale-108 active:scale-92'
            )}
            style={{
              background: 'rgb(var(--theme-accent))',
              color: 'rgb(var(--theme-accent-fg))',
            }}
            aria-label={isPlaying ? 'Пауза' : 'Играть'}
            title={isInParty && partyRole === 'listener' ? 'Управление у лидера сессии' : undefined}
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
            className="p-2 rounded-full text-text-dim hover:text-text hover:bg-surface-alt/50 transition-all duration-200 hover:scale-110 active:scale-90"
            aria-label="Следующий"
          >
            <SkipForward size={17} fill="currentColor" />
          </button>
          <button
            onClick={cycleRepeat}
            className={cn(
              'p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-90',
              repeat !== 'off' ? 'text-accent bg-accent/10' : 'text-text-dim hover:text-text hover:bg-surface-alt/50'
            )}
            aria-label="Повтор"
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
            'relative p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-90',
            (showEq || eqEnabled)
              ? 'text-accent bg-accent/10'
              : 'text-text-dim hover:text-text hover:bg-surface-alt/50'
          )}
          aria-label="Эквалайзер"
          title="Эквалайзер"
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
            'relative p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-90',
            isInParty
              ? 'text-accent bg-accent/10'
              : 'text-text-dim hover:text-text hover:bg-surface-alt/50'
          )}
          aria-label="Слушать вместе"
          title="Слушать вместе"
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
            'p-2 rounded-full transition-all duration-200 disabled:opacity-30 hover:scale-110 active:scale-90',
            isOnLyrics ? 'text-accent bg-accent/10' : 'text-text-dim hover:text-text hover:bg-surface-alt/50'
          )}
          aria-label="Текст песни"
        >
          <Mic2 size={16} strokeWidth={isOnLyrics ? 2.2 : 1.8} />
        </button>
        <button
          onClick={() => showQueue ? handleQueueClose() : setShowQueue(true)}
          className="p-2 rounded-full text-text-dim hover:text-text hover:bg-surface-alt/50 transition-all duration-200 hover:scale-110 active:scale-90"
          aria-label="Очередь"
        >
          <ListMusic size={16} strokeWidth={1.8} />
        </button>
        <button
          onClick={toggleMute}
          className="p-2 rounded-full text-text-dim hover:text-text hover:bg-surface-alt/50 transition-all duration-200 hover:scale-110 active:scale-90"
          aria-label="Звук"
        >
          <VolIcon size={16} strokeWidth={1.8} />
        </button>
        <div className="w-20">
          <ProgressSlider
            value={muted ? 0 : volume * 100}
            onSeek={(pct) => setVolume(pct / 100)}
          />
        </div>
      </div>

      {/* Очередь */}
      {(showQueue || isClosing) && (
        <div
          className="absolute bottom-[92px] right-4 w-[360px] max-h-[420px] rounded-2xl shadow-2xl overflow-hidden z-30"
          style={{
            background: 'rgb(var(--theme-surface) / 0.99)',
            border: '1px solid rgb(var(--theme-border) / 0.4)',

            animation: isClosing ? 'fadeOutSlideDown 0.2s ease-out' : 'fadeInSlideUp 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <div
            className="px-4 py-3.5 flex items-center justify-between"
            style={{ borderBottom: '1px solid rgb(var(--theme-border) / 0.3)' }}
          >
            <h3
              className="font-semibold text-[14px]"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '-0.02em' }}
            >
              Очередь
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleAutoplay}
                className={cn(
                  'px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-200',
                  autoplay
                    ? ''
                    : 'bg-surface-alt text-text-dim hover:text-text'
                )}
                style={autoplay ? { background: 'rgb(var(--theme-accent))', color: 'rgb(var(--theme-accent-fg))' } : {}}
              >
                Autoplay
              </button>
              <button
                onClick={handleQueueClose}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-surface-alt/60 transition-colors"
              >
                <X size={14} strokeWidth={2} className="text-text-dim" />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto max-h-[360px]">
            {queue && queue.length > 0 ? (
              queue.map((track, i) => {
                const isPlayed = i < queueIndex;
                const isCurrent = i === queueIndex;

                return (
                  <div
                    key={`${track.id}-${i}`}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all duration-150',
                      isCurrent ? 'bg-surface-alt/60' : 'hover:bg-surface-alt/30',
                      isPlayed ? 'opacity-40' : ''
                    )}
                    onClick={() => playTrack(track, queue, i)}
                  >
                    {isCurrent && (
                      <div className="w-0.5 h-8 rounded-full flex-shrink-0" style={{ background: 'rgb(var(--theme-accent))' }} />
                    )}
                    <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'rgb(var(--theme-surface-alt))' }}>
                      {track.artwork_url ? (
                        <img
                          src={hiResArtwork(track.artwork_url)}
                          alt={track.title}
                          className={cn('w-full h-full object-cover', isPlayed ? 'grayscale' : '')}
                          draggable={false}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ListMusic size={13} className="text-text-dim" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={cn('text-[12.5px] font-medium truncate leading-tight', isCurrent ? 'text-accent' : '')}>
                        {track.title}
                      </div>
                      <div className="text-[11px] text-text-dim truncate mt-0.5">{track.user?.username || 'Unknown Artist'}</div>
                    </div>
                    <span className="text-[11px] text-text-dim opacity-60">{formatTime(track.duration / 1000)}</span>
                  </div>
                );
              })
            ) : (
              <div className="p-10 text-center text-text-dim text-sm opacity-60">Очередь пуста</div>
            )}
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
      <div className="progress-slider-fill" style={{ transform: `scaleX(${value / 100})`, transformOrigin: 'left' }} />
      <div className="progress-slider-thumb" style={{ left: `${value}%` }} />
    </div>
  );
}
