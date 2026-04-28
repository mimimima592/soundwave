import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, Heart, MessageCircle, Share2, Clock, Calendar, Music2, Send } from 'lucide-react';
import { scAPI } from '@/api/soundcloud';
import type { SCTrack, SCComment } from '@/types/soundcloud';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { usePageCacheStore } from '@/store/pageCache';
import { formatTime, hiResArtwork, formatCount, cn } from '@/utils/format';
import { Spinner, EmptyState, TrackRow, CoverHeaderSkeleton, RowSkeleton } from '@/components/common/UI';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

const TRACK_CACHE_TTL_MS = 10 * 60 * 1000;

// ─── Comment Timeline ────────────────────────────────────────────────────────

function CommentTimeline({
  duration,
  comments,
  currentTime,
  isCurrent,
  activeCommentId,
  onSeek,
}: {
  duration: number;
  comments: SCComment[];
  currentTime: number;
  isCurrent: boolean;
  activeCommentId: number | null;
  onSeek: (ts: number) => void;
}) {
  const [hoveredComment, setHoveredComment] = useState<SCComment | null>(null);
  const [tooltipLeft, setTooltipLeft] = useState(0);
  const [activePct, setActivePct] = useState<number | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const POPUP_DURATION_MS = 3500;
  const progressPct = isCurrent ? Math.min(100, (currentTime / (duration / 1000)) * 100) : 0;

  const activeComment = activeCommentId
    ? comments.find(c => c.id === activeCommentId) ?? null
    : null;

  // Show popup briefly when active comment changes, then auto-hide
  useEffect(() => {
    if (activeComment) {
      setActivePct(Math.min(100, Math.max(0, (activeComment.timestamp / duration) * 100)));
      setPopupVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setPopupVisible(false), POPUP_DURATION_MS);
    } else {
      setPopupVisible(false);
    }
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [activeComment?.id, duration]);

  const autoPopup = popupVisible && !hoveredComment && isCurrent && activeComment;
  const shownPopup = hoveredComment ?? (autoPopup ? activeComment : null);

  // Флаг: попап только что переключился с hover → auto, даём 1 frame без transition
  const prevHoveredRef = useRef<boolean>(false);
  const [suppressTransition, setSuppressTransition] = useState(false);

  useEffect(() => {
    const wasHovered = prevHoveredRef.current;
    const isHovered = !!hoveredComment;
    prevHoveredRef.current = isHovered;

    if (wasHovered && !isHovered) {
      // Только что отпустили hover — подавляем transition на 1 кадр,
      // чтобы попап телепортировался к auto-позиции без дёргания
      setSuppressTransition(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSuppressTransition(false));
      });
    }
  }, [hoveredComment]);

  // Compute clamped pixel left for popup so it never overflows the bar
  const getClampedLeft = (pctOrPx: number | string): string => {
    const bar = barRef.current;
    const popup = popupRef.current;
    if (!bar) return typeof pctOrPx === 'string' ? pctOrPx : `${pctOrPx}px`;

    const barWidth = bar.offsetWidth;
    const popupWidth = popup?.offsetWidth ?? 200;
    const half = popupWidth / 2;
    const margin = 8;

    let rawPx: number;
    if (typeof pctOrPx === 'string') {
      rawPx = (parseFloat(pctOrPx) / 100) * barWidth;
    } else {
      rawPx = pctOrPx;
    }

    const clamped = Math.max(half + margin, Math.min(barWidth - half - margin, rawPx));
    return `${clamped}px`;
  };

  const popupRawLeft = hoveredComment
    ? tooltipLeft
    : activePct !== null ? `${activePct}%` : null;

  const popupLeft = popupRawLeft !== null ? getClampedLeft(popupRawLeft) : null;

  return (
    <div className="relative mb-10 select-none" ref={barRef}>
      {/* Main bar */}
      <div
        className="relative h-2 rounded-full bg-surface-alt cursor-pointer overflow-visible"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          onSeek(pct * duration);
        }}
      >
        {/* Progress fill */}
        {isCurrent && (
          <div
            className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
            style={{ width: '100%', transformOrigin: 'left', transform: `scaleX(${progressPct / 100})`, background: 'rgb(var(--theme-accent) / 0.45)', transition: 'transform 0.5s linear' }}
          />
        )}

        {/* Comment dots */}
        {comments.map((c) => {
          const pct = Math.min(100, Math.max(0, (c.timestamp / duration) * 100));
          const isActive = c.id === activeCommentId;
          const isHov = hoveredComment?.id === c.id;
          return (
            <button
              key={c.id}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 focus:outline-none"
              style={{ left: `${pct}%` }}
              onMouseEnter={(e) => {
                setHoveredComment(c);
                const bar = barRef.current;
                if (bar) {
                  const br = bar.getBoundingClientRect();
                  const btn = e.currentTarget.getBoundingClientRect();
                  setTooltipLeft(btn.left - br.left + btn.width / 2);
                }
              }}
              onMouseLeave={() => setHoveredComment(null)}
              onClick={(e) => { e.stopPropagation(); onSeek(c.timestamp); }}
            >
              <div className={cn(
                'rounded-full overflow-hidden border-2 transition-all duration-300 shadow-sm',
                isActive
                  ? 'w-7 h-7 border-accent shadow-md shadow-accent/40'
                  : isHov
                  ? 'w-6 h-6 border-accent/70'
                  : 'w-3.5 h-3.5 border-white/20 hover:w-5 hover:h-5 hover:border-accent/50'
              )}>
                {c.user?.avatar_url ? (
                  <img src={c.user.avatar_url} alt="" className="w-full h-full object-cover" draggable={false} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[5px] font-bold"
                    style={{ background: 'rgb(var(--theme-accent)/0.3)', color: 'rgb(var(--theme-accent))' }}>
                    {c.user?.username?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Time labels */}
      <div className="flex justify-between mt-1.5 text-[10px] text-text-dim">
        <span>0:00</span>
        <span>{formatTime(duration / 1000)}</span>
      </div>

      {/* Popup — под таймлайном */}
      {shownPopup && popupLeft !== null && (
        <div
          ref={popupRef}
          className="absolute z-30 pointer-events-none"
          style={{
            top: '28px',
            left: popupLeft,
            transform: 'translateX(-50%)',
            transition: (hoveredComment || suppressTransition) ? 'none' : 'transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            animation: 'popupFadeIn 0.2s ease-out',
          }}
        >
          {/* Arrow pointing up */}
          <div className="flex justify-center mb-0.5">
            <div className="w-2 h-2 rotate-45"
              style={{
                background: 'rgb(var(--theme-surface) / 0.92)',
                border: '1px solid rgb(var(--theme-border) / 0.5)',
                clipPath: 'polygon(0 0, 100% 0, 0 100%)',
              }}
            />
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl shadow-xl"
            style={{
              minWidth: '150px',
              maxWidth: '240px',
              background: 'rgb(var(--theme-surface))',
              border: '1px solid rgb(var(--theme-border) / 0.5)',
            }}
          >
            <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-surface-alt ring-1 ring-white/10">
              {shownPopup.user?.avatar_url
                ? <img src={shownPopup.user.avatar_url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-[9px] font-bold"
                    style={{ background: 'rgb(var(--theme-accent)/0.2)', color: 'rgb(var(--theme-accent))' }}>
                    {shownPopup.user?.username?.[0]?.toUpperCase() || '?'}
                  </div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[11px] font-semibold truncate leading-tight">{shownPopup.user?.username || '?'}</span>
                <span className="text-[10px] font-mono text-accent flex-shrink-0">{formatTime(shownPopup.timestamp / 1000)}</span>
              </div>
              <div className="text-[11px] text-text-dim leading-tight line-clamp-2">{shownPopup.body}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function TrackPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [track, setTrack] = useState<SCTrack | null>(null);
  const [relatedTracks, setRelatedTracks] = useState<SCTrack[]>([]);
  const [comments, setComments] = useState<SCComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [isToastHiding, setIsToastHiding] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsNextHref, setCommentsNextHref] = useState<string | null>(null);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<number | null>(null);
  const isLoadingMoreCommentsRef = useRef(false);
  const commentListRef = useRef<HTMLDivElement>(null);
  const commentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const oauthToken = useUIStore((s) => s.oauthToken);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const toggleLike = useUIStore((s) => s.toggleLike);
  const likedTrackIds = useUIStore((s) => s.likedTrackIds);
  const seek = usePlayerStore((s) => s.seek);
  const currentTime = usePlayerStore((s) => s.currentTime);

  const isCurrent = currentTrack?.id === Number(id);
  const showPlaying = isCurrent && isPlaying;
  const isLiked = likedTrackIds.has(track?.id ?? -1);

  // ── Auto-highlight active comment as track plays ──────────────────────────
  useEffect(() => {
    if (!isCurrent || !comments.length || !track) return;

    const currentMs = currentTime * 1000;

    // Find the comment closest to current time (last one whose timestamp <= currentTime)
    let best: SCComment | null = null;
    for (const c of comments) {
      if (c.timestamp <= currentMs) {
        if (!best || c.timestamp > best.timestamp) best = c;
      }
    }

    if (best && best.id !== activeCommentId) {
      setActiveCommentId(best.id);
    }
  }, [currentTime, isCurrent, comments, track]);

  const handleSeekToComment = (timestamp: number) => {
    if (!track) return;
    if (isCurrent) seek(timestamp / 1000);
    else { playTrack(track, relatedTracks, 0); setTimeout(() => seek(timestamp / 1000), 300); }
  };

  useEffect(() => {
    if (!id) return;
    setComments([]); setCommentsNextHref(null); setCommentsLoading(false); setActiveCommentId(null);

    const cacheKey = `page:track:${id}`;
    const cached = usePageCacheStore.getState().getPageCache<{
      track: SCTrack; relatedTracks: SCTrack[]; comments: SCComment[]; commentsNextHref: string | null;
    }>(cacheKey, TRACK_CACHE_TTL_MS);

    if (cached) {
      setTrack(cached.track); setRelatedTracks(cached.relatedTracks);
      setComments(cached.comments); setCommentsNextHref(cached.commentsNextHref ?? null);
      setLoading(false); return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError(null);
        const [trackData, relatedData, commentsData] = await Promise.all([
          (async () => {
            const tracks = await scAPI.getTracks([Number(id)]);
            return tracks[0] ?? null;
          })(),
          scAPI.getRelatedTracks(Number(id), 10),
          scAPI.getTrackComments(Number(id), 50).catch(() => null),
        ]);
        if (cancelled) return;
        setTrack(trackData); setRelatedTracks(relatedData.collection);
        if (commentsData) {
          setComments(commentsData.collection);
          setCommentsNextHref(commentsData.next_href ?? null);
        }
        if (!cancelled) usePageCacheStore.getState().setPageCache(cacheKey, {
          track: trackData, relatedTracks: relatedData.collection,
          comments: commentsData?.collection ?? [], commentsNextHref: commentsData?.next_href ?? null,
        });
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const loadMoreComments = useCallback(async () => {
    if (!commentsNextHref || isLoadingMoreCommentsRef.current) return;
    isLoadingMoreCommentsRef.current = true; setLoadingMoreComments(true);
    try {
      const data = await scAPI.fetchNext<SCComment>(commentsNextHref);
      setComments(prev => { const s = new Set(prev.map(c => c.id)); return [...prev, ...data.collection.filter(c => !s.has(c.id))]; });
      setCommentsNextHref(data.next_href ?? null);
    } finally { isLoadingMoreCommentsRef.current = false; setLoadingMoreComments(false); }
  }, [commentsNextHref]);

  const commentsSentinelRef = useInfiniteScroll(loadMoreComments, { enabled: Boolean(commentsNextHref) && !loadingMoreComments });

  const handlePostComment = async () => {
    if (!track || !commentText.trim() || !oauthToken) return;
    const text = commentText.trim();
    const timestamp = isCurrent ? currentTime * 1000 : 0;
    setCommentLoading(true); setCommentText('');

    const optimisticId = Date.now();
    const optimistic: SCComment = {
      id: optimisticId, kind: 'comment', body: text, timestamp,
      created_at: new Date().toISOString(),
      user: { id: 0, username: 'Вы', avatar_url: '', kind: 'user', permalink_url: '' } as any,
      track_id: track.id,
    };
    setComments(prev => [optimistic, ...prev]);
    setTrack(prev => prev ? { ...prev, comment_count: (prev.comment_count ?? 0) + 1 } : prev);

    try {
      await scAPI.postComment(track.id, text, timestamp);
      const fresh = await scAPI.getTrackComments(track.id, 50);
      setComments(prev => {
        const without = prev.filter(c => c.id !== optimisticId);
        const ids = new Set(without.map(c => c.id));
        return [...fresh.collection.filter(c => !ids.has(c.id)), ...without];
      });
      setCommentsNextHref(prev => prev ?? fresh.next_href ?? null);
    } catch {
      setComments(prev => prev.filter(c => c.id !== optimisticId));
      setTrack(prev => prev ? { ...prev, comment_count: Math.max(0, (prev.comment_count ?? 1) - 1) } : prev);
      setCommentText(text);
      alert('Не удалось опубликовать комментарий');
    } finally { setCommentLoading(false); }
  };

  const handleShare = async () => {
    if (!track) return;
    try {
      await navigator.clipboard.writeText(track.permalink_url || window.location.href);
      setShowToast(true); setIsToastHiding(false);
      setTimeout(() => setIsToastHiding(true), 2700);
      setTimeout(() => { setShowToast(false); setIsToastHiding(false); }, 3000);
    } catch {}
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <CoverHeaderSkeleton />
        {/* Timeline skeleton */}
        <div className="h-2 w-full rounded-full skeleton-shimmer mb-8" />
        {/* Two-col skeleton */}
        <div className="flex gap-6">
          <div className="flex-1 space-y-0.5">
            <div className="h-5 w-32 rounded skeleton-shimmer mb-4" />
            <div className="h-10 w-full rounded-xl skeleton-shimmer mb-3" />
            {Array.from({ length: 7 }, (_, i) => <RowSkeleton key={i} avatar />)}
          </div>
          <div className="flex-shrink-0 min-w-0" style={{ flexBasis: '220px', flexGrow: 1, maxWidth: '320px' }}>
            <div className="h-5 w-28 rounded skeleton-shimmer mb-4" />
            {Array.from({ length: 8 }, (_, i) => <RowSkeleton key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !track) {
    return <EmptyState title="Не удалось загрузить трек" description={error || 'Трек не найден'} />;
  }

  const createdDate = new Date(track.created_at).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
  const hasComments = (track.comment_count ?? 0) > 0 || commentsLoading;

  return (
    <div key={id} className="max-w-6xl mx-auto animate-slide-up">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-8 mb-8">
        <div className="flex-shrink-0">
          <div className="relative w-64 h-64 lg:w-72 lg:h-72 rounded-2xl overflow-hidden bg-surface-alt shadow-2xl group ring-1 ring-white/5">
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
                <Music2 size={56} className="text-accent/40" />
              </div>
            )}
            <button
              onClick={() => { isCurrent ? togglePlay() : playTrack(track, relatedTracks, 0); }}
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center shadow-xl shadow-accent/40 transition-transform hover:scale-110" style={{ color: 'rgb(var(--theme-accent-fg))' }}>
                {showPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="translate-x-0.5" />}
              </div>
            </button>
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-bold mb-1.5 leading-tight" style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '-0.03em', fontSize: 'clamp(20px, 2.5vw, 28px)' }}>{track.title}</h1>
              <button
                className="text-base text-text-dim hover:text-accent transition-colors font-medium"
                onClick={() => track.user?.id && navigate(`/user/${track.user.id}`)}
              >
                {track.user?.username || 'Unknown Artist'}
              </button>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => toggleLike(track.id, track)}
                className={cn('w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110', isLiked ? 'text-accent bg-accent/10' : 'text-text-dim hover:text-accent hover:bg-surface-alt')}
              >
                <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={handleShare}
                className="w-9 h-9 rounded-full flex items-center justify-center text-text-dim hover:text-accent hover:bg-surface-alt transition-all hover:scale-110"
              >
                <Share2 size={18} />
              </button>
            </div>
          </div>

          {/* Stats pills */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim mb-4">
            {track.playback_count !== undefined && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px]" style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}>
                <Play size={11} />{formatCount(track.playback_count)}
              </div>
            )}
            {track.favoritings_count !== undefined && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px]" style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}>
                <Heart size={11} />{formatCount(track.favoritings_count)}
              </div>
            )}
            {track.comment_count !== undefined && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px]" style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}>
                <MessageCircle size={11} />{formatCount(track.comment_count)}
              </div>
            )}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px]" style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}>
              <Clock size={11} />{formatTime(track.duration / 1000)}
            </div>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px]" style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}>
              <Calendar size={11} />{createdDate}
            </div>
          </div>

          {track.genre && (
            <div className="mb-4">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-accent/15 text-accent border border-accent/20">{track.genre}</span>
            </div>
          )}

          {track.description && (
            <div>
              <div className={cn('overflow-hidden transition-[max-height] duration-500 ease-out', !showFullDescription ? 'max-h-20' : 'max-h-[600px]')}>
                <p className="text-sm text-text-dim whitespace-pre-wrap leading-relaxed">{track.description}</p>
              </div>
              {track.description.length > 180 && (
                <button className="mt-2 text-xs text-accent hover:text-accent/80 transition-colors font-medium" onClick={() => setShowFullDescription(!showFullDescription)}>
                  {showFullDescription ? 'Свернуть' : 'Показать всё'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Timeline — full width above both columns ─────────────────────── */}
      {track.duration > 0 && hasComments && (
        <CommentTimeline
          duration={track.duration}
          comments={comments}
          currentTime={currentTime}
          isCurrent={isCurrent}
          activeCommentId={activeCommentId}
          onSeek={handleSeekToComment}
        />
      )}

      {/* ── Two-column ───────────────────────────────────────────────────── */}
      {hasComments ? (
        <div className="flex gap-6 items-start">

          {/* Comments */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-4">
              <MessageCircle size={17} className="text-accent flex-shrink-0" />
              <h2 className="text-base font-semibold">Комментарии</h2>
              <span className="text-sm text-text-dim bg-surface-alt px-2 py-0.5 rounded-full tabular-nums">
                {track.comment_count ?? comments.length}
              </span>
            </div>

            {/* Comment input */}
            {oauthToken && (
              <div className="mb-5 flex gap-2.5 items-start">
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-accent">Я</span>
                </div>
                <div className="flex-1 relative group/input">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostComment(); } }}
                    placeholder={isCurrent ? `Комментарий к ${formatTime(currentTime)}...` : 'Напиши комментарий...'}
                    disabled={commentLoading}
                    rows={2}
                    className="w-full px-3 py-2.5 pr-12 bg-surface-alt/40 border border-border/40 rounded-xl text-sm resize-none focus:outline-none focus:border-accent/50 focus:bg-surface-alt/60 transition-all disabled:opacity-50 leading-relaxed"
                  />
                  {/* Send button — floating in bottom-right corner */}
                  <button
                    onClick={handlePostComment}
                    disabled={commentLoading || !commentText.trim()}
                    className={cn(
                      'absolute right-2.5 bottom-2.5 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200',
                      commentText.trim()
                        ? 'bg-accent hover:opacity-90 hover:scale-105 shadow-md shadow-accent/30'
                        : 'bg-surface-alt text-text-dim/40 cursor-not-allowed'
                    )}
                    style={commentText.trim() ? { color: 'rgb(var(--theme-accent-fg))' } : undefined}
                  >
                    {commentLoading
                      ? <div className="w-3 h-3 border border-white/50 border-t-white rounded-full animate-spin" />
                      : <Send size={13} />}
                  </button>
                </div>
              </div>
            )}

            {/* Comment list */}
            <div className="space-y-0.5" ref={commentListRef}>
              {commentsLoading && Array.from({ length: 6 }, (_, i) => <RowSkeleton key={i} avatar />)}

              {!commentsLoading && comments.map((comment) => {
                const isActive = comment.id === activeCommentId;
                const date = new Date(comment.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
                return (
                  <div
                    key={comment.id}
                    ref={(el) => { if (el) commentRefs.current.set(comment.id, el); else commentRefs.current.delete(comment.id); }}
                    className="group flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-surface/50 transition-colors duration-150"
                  >
                    <button
                      onClick={() => comment.user?.id && navigate(`/user/${comment.user.id}`)}
                      className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-surface-alt hover:ring-2 hover:ring-accent/40 transition-all mt-0.5"
                    >
                      {comment.user?.avatar_url ? (
                        <img src={comment.user.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold"
                          style={{ background: 'rgb(var(--theme-accent)/0.15)', color: 'rgb(var(--theme-accent))' }}>
                          {comment.user?.username?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <button
                          onClick={() => comment.user?.id && navigate(`/user/${comment.user.id}`)}
                          className="text-base font-semibold hover:text-accent transition-colors leading-tight"
                        >
                          {comment.user?.username || 'Unknown'}
                        </button>
                        <button
                          onClick={() => handleSeekToComment(comment.timestamp)}
                          className={cn(
                            'text-xs font-mono flex items-center gap-0.5 transition-colors',
                            isActive ? 'text-accent' : 'text-accent/60 hover:text-accent'
                          )}
                        >
                          <Clock size={10} />
                          {formatTime(comment.timestamp / 1000)}
                        </button>
                        <span className="text-xs text-text-dim/50">{date}</span>
                      </div>
                      <p className="text-base text-text-dim leading-relaxed select-text cursor-text" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{comment.body}</p>
                    </div>
                  </div>
                );
              })}

              {loadingMoreComments && <div className="flex justify-center py-3"><Spinner size={16} /></div>}
              <div ref={commentsSentinelRef} className="h-2" />
            </div>
          </div>

          {/* Related tracks */}
          {relatedTracks.length > 0 && (
            <div className="flex-shrink-0 min-w-0" style={{ flexBasis: '220px', flexGrow: 1, maxWidth: '320px' }}>
              <h2 className="text-base font-semibold mb-4">Похожие треки</h2>
              <div className="space-y-0.5">
                {relatedTracks.map((rt, i) => (
                  <TrackRow
                    key={rt.id}
                    track={rt}
                    isCurrent={currentTrack?.id === rt.id}
                    isPlaying={isPlaying}
                    onPlay={() => { if (currentTrack?.id === rt.id) togglePlay(); else playTrack(rt, relatedTracks, i); }}
                    onNavigateTrack={() => navigate(`/track/${rt.id}`)}
                    onNavigateUser={rt.user?.id ? () => navigate(`/user/${rt.user!.id}`) : undefined}
                    showStats={false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        relatedTracks.length > 0 && (
          <div className="mt-2">
            <h2 className="text-base font-semibold mb-4">Похожие треки</h2>
            <div className="main-grid-layout animate-fade-in-only">
              {relatedTracks.slice(0, 10).map((rt, i) => {
                const isRel = currentTrack?.id === rt.id;
                const showRel = isRel && isPlaying;
                return (
                  <div key={rt.id} className="group cursor-pointer" onClick={() => navigate(`/track/${rt.id}`)}>
                    <div className="relative aspect-square rounded-xl overflow-hidden bg-surface-alt mb-3 ring-1 ring-white/5 group-hover:ring-white/10">
                      {rt.artwork_url ? (
                        <img src={hiResArtwork(rt.artwork_url)} alt={rt.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" draggable={false} loading="lazy" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center"><Music2 size={32} className="text-accent/40" /></div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <button
                        onClick={(e) => { e.stopPropagation(); if (isRel) togglePlay(); else playTrack(rt, relatedTracks, i); }}
                        className="absolute bottom-3 right-3 w-12 h-12 rounded-full bg-accent flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 hover:scale-110 shadow-lg shadow-accent/40"
                        style={{ color: 'rgb(var(--theme-accent-fg))' }}
                      >
                        {showRel ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="translate-x-0.5" />}
                      </button>
                    </div>
                    <div className="space-y-0.5">
                      <div className={cn('text-sm font-semibold truncate', isRel && 'text-accent')}>{rt.title}</div>
                      <div className="text-xs text-text-dim truncate">{rt.user?.username || 'Unknown'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
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
