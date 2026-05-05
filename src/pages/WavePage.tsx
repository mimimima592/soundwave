import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, Waves } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { waveManager } from '@/managers/waveManager';
import { TrackCard } from '@/components/player/TrackCard';
import { TrackCardSkeleton } from '@/components/common/UI';

import { cn, hiResArtwork } from '@/utils/format';
import type { SCTrack } from '@/types/soundcloud';
import type { WaveState } from '@/managers/waveManager';
import { useT } from '@/store/i18n';

const gridClassName = 'main-grid-layout';

// ── Анимированные полосы ──────────────────────────────────────────────────────
function WaveBars({ active = true, size = 'md', color = 'white' }: {
  active?: boolean; size?: 'sm' | 'md' | 'lg'; color?: string;
}) {
  const heights = [0.4, 0.65, 1, 0.7, 0.45];
  const sizePx  = size === 'sm' ? 3 : size === 'md' ? 5 : 7;
  const maxH    = size === 'sm' ? 16 : size === 'md' ? 28 : 40;

  return (
    <div className="flex items-center gap-[3px]" style={{ height: maxH }}>
      {heights.map((h, i) => (
        <div
          key={i}
          className="wavebar-el rounded-full"
          style={{
            width: sizePx,
            height: maxH,
            background: color,
            // scaleY вместо height — compositor-only, не вызывает layout
            transformOrigin: 'center',
            transform: `scaleY(${active ? h : 0.15})`,
            willChange: 'transform',
            animationName: active ? 'wavebar' : 'none',
            animationDuration: '1.1s',
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDelay: `${i * 0.12}s`,
            animationPlayState: active ? 'running' : 'paused',
            opacity: active ? 1 : 0.3,
            transition: 'transform var(--dur-slow) var(--ease-ios), opacity var(--dur-base) var(--ease-ios)',
          }}
        />
      ))}
    </div>
  );
}

// ── Hero карточка ─────────────────────────────────────────────────────────────
function WaveHeroCard({ track, isPlaying, isCurrent, onPlay }: {
  track: SCTrack; isPlaying: boolean; isCurrent: boolean; onPlay: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const artwork  = hiResArtwork(track.artwork_url || track.user?.avatar_url);
  return (
    <div
      className="wave-hero-card relative rounded-2xl overflow-hidden mb-6 animate-slide-up"
      style={{ height: 196 }}
    >
      {/* Blur bg */}
      <div
        className="wave-hero-bg absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: artwork ? `url(${artwork})` : undefined,
          background: artwork ? undefined : 'rgb(var(--theme-surface-alt))',
          filter: 'blur(32px) brightness(0.3) saturate(1.6)',
          transform: 'scale(1.04)',
          transition: 'transform 700ms var(--ease-ios-out)',
        }}
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(120deg, rgba(0,0,0,0.4) 0%, transparent 70%)' }} />

      <div className="relative z-10 flex items-center gap-6 h-full px-8">
        {/* Обложка */}
        <div
          className="w-32 h-32 rounded-xl overflow-hidden flex-shrink-0 shadow-2xl ring-1 ring-white/10 cursor-pointer transition-all duration-200 hover:ring-white/30 hover:scale-[1.03]"
          onClick={() => navigate(`/track/${track.id}`)}
        >
          {artwork
            ? <img src={artwork} alt={track.title} className="w-full h-full object-cover" draggable={false} />
            : <div className="w-full h-full flex items-center justify-center bg-white/5"><Waves size={28} className="text-white/30" /></div>
          }
        </div>

        {/* Инфо */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-2">
            {isCurrent && isPlaying
              ? <WaveBars active size="sm" />
              : <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/50">{t('wave_now_playing')}</span>
            }
          </div>
          <h2
            className="font-bold text-white leading-snug line-clamp-2 mb-1 cursor-pointer hover:text-white/70 transition-colors"
            style={{ fontSize: 'clamp(15px, 2.2vw, 20px)' }}
            onClick={() => navigate(`/track/${track.id}`)}
          >
            {track.title}
          </h2>
          <p
            className="text-sm text-white/55 truncate cursor-pointer hover:text-white/85 transition-colors"
            onClick={() => navigate(`/user/${track.user?.id}`)}
          >
            {track.user?.username}
          </p>
        </div>

        {/* Play */}
        <button
          className={cn(
            'w-13 h-13 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer shadow-xl transition-all duration-200 select-none',
            isCurrent ? 'ring-2 ring-white/30' : 'ring-1 ring-white/15',
            hovered && !isCurrent && 'scale-105',
            isCurrent && 'scale-105',
          )}
          style={{
            width: 52, height: 52,
            background: isCurrent ? 'rgb(var(--theme-accent))' : 'rgba(255,255,255,0.12)',
            backdropFilter: 'blur(8px)',
            color: isCurrent ? 'rgb(var(--theme-accent-fg))' : 'white',
          }}
          onClick={onPlay}
        >
          {isCurrent && isPlaying
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><polygon points="5,3 19,12 5,21"/></svg>
          }
        </button>
      </div>
    </div>
  );
}

// ── Hero скелетон ─────────────────────────────────────────────────────────────
function WaveHeroSkeleton() {
  const t = useT();
  return (
    <div className="relative rounded-2xl overflow-hidden mb-6 skeleton-shimmer" style={{ height: 196 }}>
      <div className="absolute inset-0" style={{ background: 'rgb(var(--theme-surface-alt) / 0.6)' }} />
      <div className="relative z-10 flex items-center gap-6 h-full px-8">
        <div className="w-32 h-32 rounded-xl flex-shrink-0 skeleton-shimmer" style={{ background: 'rgb(var(--theme-border) / 0.5)' }} />
        <div className="flex-1 space-y-3">
          <div className="h-3 w-20 rounded-full skeleton-shimmer" style={{ background: 'rgb(var(--theme-border) / 0.5)' }} />
          <div className="h-5 w-3/4 rounded-lg skeleton-shimmer" style={{ background: 'rgb(var(--theme-border) / 0.5)' }} />
          <div className="h-3.5 w-1/3 rounded-full skeleton-shimmer" style={{ background: 'rgb(var(--theme-border) / 0.4)' }} />
        </div>
        <div className="w-13 h-13 rounded-full flex-shrink-0 skeleton-shimmer" style={{ width: 52, height: 52, background: 'rgb(var(--theme-border) / 0.4)' }} />
      </div>
    </div>
  );
}

// ── Стартовый экран ───────────────────────────────────────────────────────────
function WaveStartScreen({ onStart, loading }: { onStart: () => void; loading: boolean }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-slide-up">
      <div className="text-center max-w-sm">
        <div className="flex justify-center mb-8">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center"
            style={{
              background: 'rgb(var(--theme-accent) / 0.1)',
              border: '1px solid rgb(var(--theme-accent) / 0.18)',
              boxShadow: '0 0 40px rgb(var(--theme-accent) / 0.08)',
            }}
          >
            <WaveBars active={!loading} size="lg" color="rgb(var(--theme-accent))" />
          </div>
        </div>
        <h2 className="font-bold mb-3 text-text" style={{ fontSize: '1.4rem', letterSpacing: '-0.03em' }}>
          {t('wave_title')}
        </h2>
        <p className="text-sm text-text-dim mb-8 leading-relaxed">
          {t('wave_desc')}
        </p>
        <button
          onClick={onStart}
          disabled={loading}
          className="inline-flex items-center gap-2.5 px-9 py-3 rounded-full text-sm font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'rgb(var(--theme-accent))',
            boxShadow: '0 4px 20px rgb(var(--theme-accent) / 0.35)',
            color: 'rgb(var(--theme-accent-fg))',
          }}
        >
          {loading ? (
            <>
              <WaveBars active size="sm" />
              <span>{t('wave_loading')}</span>
            </>
          ) : (
            <>
              <Waves size={15} />
              <span>{t('wave_start')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Разделитель с заголовком ───────────────────────────────────────────────────
function SectionDivider({ label, count, scanning }: { label: string; count?: number; scanning?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-dim whitespace-nowrap">{label}</p>
      <div className="flex-1 h-px" style={{ background: 'rgb(var(--theme-border) / 0.4)' }} />
      {scanning && <WaveBars active size="sm" color="rgb(var(--theme-accent))" />}
      {!scanning && count !== undefined && (
        <span className="text-[11px] text-text-dim opacity-40 tabular-nums">{count}</span>
      )}
    </div>
  );
}

// ── Основная страница ─────────────────────────────────────────────────────────
export function WavePage() {
  const t = useT();
  const oauthToken    = useUIStore((s) => s.oauthToken);
  const likedTrackIds = useUIStore((s) => s.likedTrackIds);
  const playTrack     = usePlayerStore((s) => s.playTrack);
  const togglePlay    = usePlayerStore((s) => s.togglePlay);
  const setWaveMode   = usePlayerStore((s) => s.setWaveMode);
  const currentTrack  = usePlayerStore((s) => s.currentTrack);
  const isPlaying     = usePlayerStore((s) => s.isPlaying);

  // Используем ref чтобы избежать stale closure в subscribe
  const [waveState, setWaveState] = useState<WaveState>(() => waveManager.getCurrentState());
  const [loading, setLoading]     = useState(false);


  // Считаем isStarted из самого стейта — не отдельный флаг который может рассинхронизироваться
  const isStarted   = waveState.isAutonomous || waveState.queue.length > 0;
  // Показываем грид когда есть треки или deep scan уже идёт (скелетоны)
  // Показываем hero skeleton пока нет ни одного трека и идёт генерация
  const showHeroSkeleton = isStarted && waveState.queue.length === 0 && waveState.isGenerating;

  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = waveManager.subscribe((newState) => {
      setWaveState({ ...newState });
    });
    return unsub;
  }, []);

  useEffect(() => {
    waveManager.updateLikedTrackIds(likedTrackIds);
  }, [likedTrackIds]);

  useEffect(() => {
    if (isStarted) setWaveMode(true);
    return () => { setWaveMode(false); };
  }, [isStarted, setWaveMode]);


  const handleStartWave = useCallback(async () => {
    if (!oauthToken || loading) return;
    setLoading(true);
    try {
      await waveManager.refreshWave();
      // После refreshWave instant-трек уже в очереди — сразу играем
      const state = waveManager.getCurrentState();
      if (state.queue.length > 0) {
        playTrack(state.queue[0], state.queue, 0);
      }
    } catch (e) {
      console.error('[WavePage] startWave error:', e);
    } finally {
      setLoading(false);
    }
  }, [oauthToken, loading, playTrack]);

  const handleRefresh = useCallback(async () => {
    if (loading || waveState.isGenerating) return;
    setLoading(true);
    try {
      await waveManager.refreshWave();
      const state = waveManager.getCurrentState();
      if (state.queue.length > 0) {
        playTrack(state.queue[0], state.queue, 0);
      }
    } catch (e) {
      console.error('[WavePage] refresh error:', e);
    } finally {
      setLoading(false);
    }
  }, [loading, waveState.isGenerating, playTrack]);

  // Hero = текущий играющий трек если он из волны, иначе первый upcoming
  const heroTrack = (currentTrack && waveState.queue.some(t => t.id === currentTrack.id))
    ? currentTrack
    : (waveState.queue[waveState.currentIndex] ?? waveState.queue[0] ?? null);

  // Upcoming — треки которые ещё не сыграли (после currentIndex)
  const upcomingTracks = waveState.queue.slice(waveState.currentIndex);
  const showGrid       = upcomingTracks.length > 0 || waveState.isDeepScanning;

  const isGenerating = loading || waveState.isGenerating;

  // ── Нет токена ────────────────────────────────────────────────────────────
  if (!oauthToken) {
    return (
      <div>
        <WaveHeader status="" onRefresh={handleRefresh} isGenerating={false} loading={false} />
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: 'rgb(var(--theme-surface-alt))' }}
          >
            <Waves size={24} className="text-text-dim" />
          </div>
          <p className="text-base font-semibold text-text mb-1">{t('wave_auth_title')}</p>
          <p className="text-sm text-text-dim">{t('wave_auth_desc')}</p>
        </div>
      </div>
    );
  }

  // ── Стартовый экран ───────────────────────────────────────────────────────
  if (!isStarted) {
    return (
      <div>
        <WaveHeader status="" onRefresh={handleRefresh} isGenerating={false} loading={false} showRefresh={false} />
        <WaveStartScreen onStart={handleStartWave} loading={loading} />
      </div>
    );
  }

  // ── Основной экран ────────────────────────────────────────────────────────
  return (
    <div>
      <WaveHeader
        status={(() => {
          const s = waveState;
          if (s.isGenerating) return t('wave_status_generating');
          if (s.isDeepScanning) return t('wave_status_scanning');
          const upcoming = s.queue.length - s.currentIndex;
          if (s.seeds && upcoming > 0) return `${upcoming} ${t('wave_queue')}`;
          return s.seeds && s.seeds.length > 0
            ? `${t('wave_status_based_on')} ${s.seeds.length} ${t('wave_status_likes')}`
            : t('wave_status_waiting');
        })()}
        onRefresh={handleRefresh}
        isGenerating={isGenerating || waveState.isDeepScanning}
        loading={loading}
      />

      {/* Hero */}
      {showHeroSkeleton && <WaveHeroSkeleton />}
      {heroTrack && !showHeroSkeleton && (
        <WaveHeroCard
          track={heroTrack}
          isPlaying={isPlaying}
          isCurrent={currentTrack?.id === heroTrack.id}
          onPlay={() => {
            if (currentTrack?.id === heroTrack.id) {
              togglePlay();
            } else {
              const idx = waveState.queue.findIndex(t => t.id === heroTrack.id);
              playTrack(heroTrack, waveState.queue, idx >= 0 ? idx : 0);
            }
          }}
        />
      )}

      {/* Грид треков */}
      {showGrid && (
        <>
          <SectionDivider
            label={t('wave_queue')}
            count={upcomingTracks.length > 0 ? upcomingTracks.length : undefined}
            scanning={waveState.isDeepScanning && upcomingTracks.length < 4}
          />
          <div
            className={cn(gridClassName, 'animate-fade-in-only')}
            ref={gridRef}
          >
            {upcomingTracks.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                queue={waveState.queue}
                index={waveState.queue.indexOf(track)}
              />
            ))}
            {/* Скелетоны пока идёт deepScan и треков мало */}
            {waveState.isDeepScanning && upcomingTracks.length < 8 && (
              Array.from({ length: Math.max(8 - upcomingTracks.length, 4) }, (_, i) => (
                <TrackCardSkeleton key={`skel-${i}`} />
              ))
            )}
          </div>
        </>
      )}

      {/* Пусто — после deep scan, но треков нет */}
      {!showGrid && !isGenerating && !showHeroSkeleton && (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: 'rgb(var(--theme-surface-alt))' }}
          >
            <WaveBars active={false} size="md" color="rgb(var(--theme-text-dim))" />
          </div>
          <p className="text-base font-semibold text-text mb-1">{t('wave_no_tracks_title')}</p>
          <p className="text-sm text-text-dim mb-6">{t('wave_no_tracks_desc')}</p>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all hover:scale-105"
            style={{
              background: 'rgb(var(--theme-surface-alt))',
              border: '1px solid rgb(var(--theme-border) / 0.5)',
              color: 'rgb(var(--theme-text-dim))',
            }}
          >
            <RefreshCw size={13} />
            {t('try_again')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Хедер ─────────────────────────────────────────────────────────────────────
function WaveHeader({ status, onRefresh, isGenerating, loading, showRefresh = true }: {
  status: string; onRefresh: () => void; isGenerating: boolean; loading: boolean; showRefresh?: boolean;
}) {
  const t = useT();
  return (
    <div className="mb-7 flex items-end justify-between gap-6 animate-slide-up">
      <div>
        <div className="flex items-center gap-3 mb-1.5">
          <WaveBars active size="sm" color="rgb(var(--theme-accent))" />
          <h1
            className="font-bold leading-none text-text"
            style={{ fontSize: '2.1rem', letterSpacing: '-0.04em' }}
          >
            {t('wave_header_title')}
          </h1>
        </div>
        {status && (
          <p className="text-sm text-text-dim" style={{ paddingLeft: 1 }}>{status}</p>
        )}
      </div>

      {showRefresh && (
        <button
          onClick={onRefresh}
          disabled={loading || isGenerating}
          title={t('wave_refresh')}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-30 hover:scale-110 text-text-dim hover:text-accent hover:bg-accent/10"
        >
          <RefreshCw
            size={15}
            className={cn('transition-transform duration-300', (loading || isGenerating) && 'animate-spin text-accent')}
          />
        </button>
      )}
    </div>
  );
}
