import { useEffect, useState, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { scAPI } from '@/api/soundcloud';
import type { SCTrack } from '@/types/soundcloud';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { usePageCacheStore } from '@/store/pageCache';
import { useHistoryStore } from '@/store/history';
import { formatTime, hiResArtwork, formatCount, cn } from '@/utils/format';
import { PageHeader, EmptyState, TrackCardSkeleton } from '@/components/common/UI';
import { TrackCard } from '@/components/player/TrackCard';
import { useInfiniteGrid } from '@/hooks/useInfiniteGrid';
import { useGridSidebarAnim } from '@/hooks/useGridSidebarAnim';

const PAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE_SIZE = 50;

function calcInitialLimit(): number {
  const minCardWidth = 180;
  const gap = 20;
  const padding = 32;
  const cols = Math.floor((window.innerWidth - padding + gap) / (minCardWidth + gap));
  return Math.max(cols * 6, PAGE_SIZE);
}

export function HistoryPage() {
  const oauthToken = useUIStore((s) => s.oauthToken);
  const localEntries = useHistoryStore((s) => s.entries);
  const [tracks, setTracks] = useState<SCTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextHref, setNextHref] = useState<string | null>(null);
  const gridClassName = 'main-grid-layout';

  const hasMore = Boolean(nextHref);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const loadMoreTracks = useCallback(async () => {
    if (!oauthToken || !nextHref || loadingMore) return;
    setLoadingMore(true);
    try {
      const historyData = await scAPI.fetchNext<{ track: SCTrack }>(nextHref);

      const historyTracks = historyData.collection
        .map((item: any) => item.track)
        .filter(Boolean);

      setTracks((prev) => {
        const existing = new Set(prev.map((t) => t.id));
        return [...prev, ...historyTracks.filter((t: SCTrack) => !existing.has(t.id))];
      });
      setNextHref(historyData.next_href);
    } catch (err) {
      console.error('Ошибка загрузки дополнительной истории:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [oauthToken, nextHref, loadingMore]);

  const { sentinelRef, gridRef, skeletonCount, initialSkeletonCount } = useInfiniteGrid({
    loading,
    loadingMore,
    hasMore,
    items: tracks,
    onLoadMore: loadMoreTracks,
  });
  const sidebarAnimRef = useGridSidebarAnim();

  useEffect(() => {
    const cacheKey = 'page:history';
    const cached = usePageCacheStore.getState().getPageCache<{
      tracks: SCTrack[];
      nextHref: string | null;
    }>(cacheKey, PAGE_CACHE_TTL_MS);
    if (cached) {
      const localTracks = useHistoryStore.getState().entries.map(e => e.track);
      const localIds = new Set(localTracks.map(t => t.id));
      setTracks([
        ...localTracks,
        ...cached.tracks.filter((t: SCTrack) => !localIds.has(t.id)),
      ]);
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
        const limit = calcInitialLimit();

        const historyRes = await window.electron?.net.authenticatedRequest(
          `https://api-v2.soundcloud.com/me/play-history/tracks?limit=${limit}`,
          'GET',
          null,
          oauthToken
        );

        if (!historyRes?.ok || !historyRes?.body) {
          throw new Error('Failed to fetch play history');
        }

        const historyData = JSON.parse(historyRes.body);
        const historyTracks = historyData.collection
          .map((item: any) => item.track)
          .filter(Boolean);

        if (!cancelled) {
          // Мержим: локальные треки первыми (они актуальнее),
          // затем SC история без дубликатов
          const localTracks = useHistoryStore.getState().entries.map(e => e.track);
          const localIds = new Set(localTracks.map(t => t.id));
          const merged = [
            ...localTracks,
            ...historyTracks.filter(t => !localIds.has(t.id)),
          ];
          setTracks(merged);
          setNextHref(historyData.next_href);
          usePageCacheStore.getState().setPageCache(cacheKey, {
            tracks: historyTracks, // кешируем только SC данные
            nextHref: historyData.next_href,
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
  }, [oauthToken]);

  if (!oauthToken) {
    return (
      <div>
        <PageHeader title="История" />
        <EmptyState
          icon={<Clock size={40} />}
          title="Требуется авторизация"
          description="Авторизуйся через Настройки → Авторизация, чтобы видеть историю прослушивания"
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="История прослушивания" subtitle="Твои недавно прослушанные треки" />

      {error ? (
        <EmptyState
          icon={<Clock size={40} />}
          title="Ошибка загрузки"
          description={error}
        />
      ) : loading ? (
        <div className={gridClassName}>
          {Array.from({ length: initialSkeletonCount }, (_, i) => (
            <TrackCardSkeleton key={i} />
          ))}
        </div>
      ) : tracks.length === 0 ? (
        <EmptyState
          icon={<Clock size={40} />}
          title="История пуста"
          description="Начни слушать треки, чтобы они появились здесь"
        />
      ) : (
        <>
          <div
            ref={(el) => { (gridRef as any).current = el; (sidebarAnimRef as any).current = el; }}
            className={`${gridClassName} animate-slide-up`}
          >
            {tracks.map((track, index) => (
              <TrackCard
                key={track.id}
                track={track}
                queue={tracks}
                index={index}
              />
            ))}
            {loadingMore && Array.from({ length: skeletonCount }, (_, i) => (
              <TrackCardSkeleton key={`loading-${i}`} />
            ))}
          </div>
          {hasMore && <div ref={sentinelRef} className="h-1" />}
        </>
      )}
    </div>
  );
}
