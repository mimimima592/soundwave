import React, { type ReactNode, useState, useEffect, useRef, memo } from 'react';
import { Play, Pause, Heart, Clock, User, Music2 } from 'lucide-react';
import { cn, formatTime, formatCount, hiResArtwork } from '@/utils/format';
import type { SCTrack, SCUser } from '@/types/soundcloud';
import { useUIStore } from '@/store/ui';
import { useListenPartyStore } from '@/store/listenParty';
import { scAPI } from '@/api/soundcloud';
import { useT } from '@/store/i18n';

export function Spinner({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn('border-2 border-border border-t-accent rounded-full animate-spin', className)}
      style={{ width: size, height: size }}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  animate = true,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  animate?: boolean;
}) {
  return (
    <div className={cn('mb-8 flex items-end justify-between gap-6', animate && 'animate-slide-up')}>
      <div>
        <h1
          className="text-[2.2rem] font-bold tracking-tight leading-none mb-2"
          style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '-0.04em' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-text-dim font-inter">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in select-none">
      {icon && (
        <div
          className="mb-5 flex items-center justify-center w-20 h-20 rounded-3xl"
          style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))', opacity: 0.55 }}
        >
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold mb-1.5 font-inter" style={{ color: 'rgb(var(--theme-text))' }}>
        {title}
      </h3>
      {description && (
        <p className="text-[13px] max-w-xs leading-relaxed" style={{ color: 'rgb(var(--theme-text-dim))' }}>
          {description}
        </p>
      )}
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-10 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-lg font-bold tracking-tight"
          style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '-0.03em' }}
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Unified track row */
function TrackRowImpl({
  track,
  index,
  isCurrent,
  isPlaying,
  onPlay,
  onNavigateTrack,
  onNavigateUser,
  showStats = true,
  showIndex = false,
}: {
  track: SCTrack;
  index?: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onNavigateTrack: () => void;
  onNavigateUser?: () => void;
  showStats?: boolean;
  showIndex?: boolean;
}) {
  const showPlaying = isCurrent && isPlaying;
  const t = useT();
  const likedTrackIds = useUIStore((s) => s.likedTrackIds);
  const toggleLike = useUIStore((s) => s.toggleLike);
  const oauthToken = useUIStore((s) => s.oauthToken);
  const isLiked = likedTrackIds.has(track.id);
  // prefetch — через ref чтобы не вызывать re-render строки при каждом движении мыши
  const prefetchedRef = useRef(false);
  const [prefetchedUrl, setPrefetchedUrl] = useState<string | null>(null);

  const { role, status } = useListenPartyStore();

  const handlePlay = () => {
    // Блокируем запуск треков для слушателей в Listen Party
    if (role === 'listener' && status === 'connected') {
      return;
    }
    onPlay();
  };

  // Prefetch stream URL при первом hover. Без re-render строки.
  const handleMouseEnter = () => {
    if (prefetchedRef.current || prefetchedUrl) return;
    prefetchedRef.current = true;
    if (track.media?.transcodings) {
      scAPI.getStreamUrl(track)
        .then(({ url }) => setPrefetchedUrl(url))
        .catch((err) => console.error('[TrackRow] Failed to preload stream:', err));
    }
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-150',
        isCurrent
          ? 'bg-surface-alt/70'
          : 'hover:bg-surface-alt/40'
      )}
      onMouseEnter={handleMouseEnter}
    >
      {showIndex ? (
        <div className="w-6 flex-shrink-0 flex items-center justify-center">
          <span className={cn('text-[11px] tabular-nums text-text-dim group-hover:hidden', isCurrent && 'hidden')}>{(index ?? 0) + 1}</span>
          <button
            onClick={(e) => { e.stopPropagation(); handlePlay(); }}
            className={cn('hidden group-hover:flex items-center justify-center text-text-dim hover:text-accent transition-colors', isCurrent && '!flex text-accent')}
          >
            {showPlaying ? <Pause size={13} className="fill-current" /> : <Play size={13} className="fill-current" />}
          </button>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); handlePlay(); }}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150 hover:scale-105 active:scale-95',
            isCurrent
              ? 'text-white'
              : 'text-text hover:text-accent'
          )}
          style={isCurrent ? { background: 'rgb(var(--theme-accent))' } : { background: 'rgb(var(--theme-surface-alt))' }}
        >
          {showPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="translate-x-px" />}
        </button>
      )}

      <div
        className="thumb-hover w-10 h-10 rounded-lg flex-shrink-0 cursor-pointer"
        style={{ background: 'rgb(var(--theme-surface-alt))' }}
        onClick={onNavigateTrack}
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
          <div className="w-full h-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
            <Music2 size={14} className="text-accent/40" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div
          className={cn('text-[14px] font-semibold font-inter truncate cursor-pointer transition-colors leading-tight', isCurrent ? 'text-accent' : 'hover:text-accent')}
          onClick={onNavigateTrack}
        >
          {track.title}
        </div>
        <div
          className={cn('text-[12.5px] text-text-dim truncate mt-0.5 leading-tight transition-colors', onNavigateUser && 'hover:text-accent cursor-pointer')}
          onClick={onNavigateUser}
        >
          {track.user?.username || 'Unknown Artist'}
        </div>
      </div>

      {showStats && (
        <div className="flex items-center gap-2.5 text-[12px] text-text-dim flex-shrink-0 opacity-70">
          {track.playback_count !== undefined && (
            <div className="flex items-center gap-1">
              <Play size={10} />{formatCount(track.playback_count)}
            </div>
          )}
          {track.favoritings_count !== undefined && (
            <div className="flex items-center gap-1">
              <Heart size={10} />{formatCount(track.favoritings_count)}
            </div>
          )}
          <div className="flex items-center gap-1">
            <Clock size={10} />{formatTime(track.duration / 1000)}
          </div>
        </div>
      )}

      {oauthToken && (
        <button
          onClick={(e) => { e.stopPropagation(); toggleLike(track.id, track); }}
          className={cn(
            'flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-[background-color,color,opacity] duration-200',
            'opacity-0 group-hover:opacity-100',
            isLiked ? 'opacity-100 text-accent' : 'text-text-dim hover:text-accent hover:bg-accent/10'
          )}
          aria-label={isLiked ? t('unlike') : t('like')}
        >
          <Heart
            size={13}
            className={cn(
              'transition-[transform,fill,color] duration-[120ms]',
              '[button:hover_&]:scale-110 [button:active_&]:scale-90',
              isLiked && 'fill-current'
            )}
            style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          />
        </button>
      )}
    </div>
  );
}

// memo предотвращает re-render всех строк когда у родителя меняется не относящееся к ним состояние
export const TrackRow = memo(TrackRowImpl);

/** User row */

export function UserRow({ user, onClick, action }: { user: SCUser; onClick: () => void; action?: ReactNode }) {
  const t = useT();
  return (
    <div
      className="group flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-150 cursor-pointer hover:bg-surface-alt/40"
      onClick={onClick}
    >
      <div className="thumb-hover w-10 h-10 rounded-full flex-shrink-0"
        style={{ background: 'rgb(var(--theme-surface-alt))' }}
      >
        {user.avatar_url ? (
          <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/20 to-accent/5">
            <User size={16} className="text-accent/50" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="text-[13.5px] font-semibold truncate group-hover:text-accent transition-colors leading-tight">{user.username}</div>
          {user.verified && <span className="text-accent text-xs flex-shrink-0">✓</span>}
        </div>
        <div className="text-[12px] text-text-dim mt-0.5 opacity-80">
          {user.followers_count !== undefined ? `${formatCount(user.followers_count)} ${t('user_followers')}` : t('user')}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Skeleton */
export function RowSkeleton({ avatar = false }: { avatar?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className={cn('w-10 h-10 flex-shrink-0 skeleton-shimmer', avatar ? 'rounded-full' : 'rounded-lg')} />
      <div className="flex-1">
        <div className="h-4 w-2/3 rounded-lg skeleton-shimmer mb-1.5" />
        <div className="h-3 w-1/3 rounded-lg skeleton-shimmer" />
      </div>
    </div>
  );
}

export function TrackCardSkeleton() {
  return (
    <div className="min-w-0">
      <div className="aspect-square rounded-2xl skeleton-shimmer mb-3" />
      <div className="h-[13px] w-4/5 rounded-md skeleton-shimmer mb-1.5" />
      <div className="h-[11px] w-3/5 rounded-md skeleton-shimmer" />
    </div>
  );
}

/** Tab bar */
export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = React.useState({ left: 0, width: 0 });

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLElement>('[data-active="true"]');
    if (!activeBtn) return;
    setIndicator({ left: activeBtn.offsetLeft + 12, width: activeBtn.offsetWidth - 24 });
  }, [active]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-0.5 mb-6"
      style={{ borderBottom: '1px solid rgb(var(--theme-border) / 0.4)' }}
    >
      {/* Плавно скользящий индикатор активной вкладки */}
      <div
        className="absolute bottom-0 h-[2px] rounded-t-full pointer-events-none"
        style={{
          background: 'rgb(var(--theme-accent))',
          left: indicator.left,
          width: indicator.width,
          transition: `left var(--dur-base) var(--ease-ios), width var(--dur-base) var(--ease-ios)`,
        }}
      />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-active={active === tab.id ? 'true' : undefined}
          onClick={() => onChange(tab.id)}
          className={cn(
            'px-4 py-2.5 text-[13.5px] font-medium font-inter transition-colors duration-150 relative whitespace-nowrap rounded-t-lg',
            active === tab.id
              ? 'text-accent'
              : 'text-text-dim hover:text-text hover:bg-surface-alt/30'
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={cn('ml-1.5 text-[11.5px] font-normal', active === tab.id ? 'text-accent/70' : 'text-text-dim/60')}>
              {formatCount(tab.count)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Pill filters */
export function PillFilters<T extends string>({
  options,
  active,
  onChange,
}: {
  options: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-[12.5px] font-medium pb-button',
            active === opt.id
              ? 'text-white shadow-sm'
              : 'text-text-dim hover:text-text'
          )}
          style={
            active === opt.id
              ? { background: 'rgb(var(--theme-accent))', boxShadow: '0 2px 12px rgb(var(--theme-accent) / 0.35)' }
              : { background: 'rgb(var(--theme-surface-alt))' }
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}


/** Grid card skeleton — alias for TrackCardSkeleton */
export function CardSkeleton() {
  return <TrackCardSkeleton />;
}

/** Full-page header skeleton for track/playlist/user pages */
export function CoverHeaderSkeleton({ round = false }: { round?: boolean }) {
  return (
    <div className="flex flex-col lg:flex-row gap-8 mb-8">
      <div className={cn('w-64 h-64 lg:w-72 lg:h-72 flex-shrink-0 skeleton-shimmer', round ? 'rounded-full' : 'rounded-2xl')} />
      <div className="flex-1 min-w-0 flex flex-col justify-center space-y-3">
        <div className="h-8 lg:h-10 w-3/4 rounded-lg skeleton-shimmer" />
        <div className="h-6 w-1/3 rounded-lg skeleton-shimmer" />
        <div className="space-y-2 pt-1">
          <div className="h-4 w-full rounded skeleton-shimmer" />
          <div className="h-4 w-5/6 rounded skeleton-shimmer" />
          <div className="h-4 w-4/6 rounded skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

/** Profile page header skeleton */
export function UserHeaderSkeleton() {
  return (
    <div className="flex flex-col md:flex-row gap-6 mb-8">
      <div className="w-32 h-32 md:w-48 md:h-48 rounded-full flex-shrink-0 skeleton-shimmer" />
      <div className="flex-1 min-w-0 flex flex-col justify-center space-y-4">
        <div className="h-10 md:h-14 w-1/2 rounded-lg skeleton-shimmer" />
        <div className="h-8 w-1/3 rounded-lg skeleton-shimmer" />
        <div className="space-y-2">
          <div className="h-4 w-full rounded skeleton-shimmer" />
          <div className="h-4 w-5/6 rounded skeleton-shimmer" />
        </div>
        <div className="flex gap-4 pt-2">
          <div className="h-10 w-24 rounded-full skeleton-shimmer" />
          <div className="h-10 w-24 rounded-full skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}
