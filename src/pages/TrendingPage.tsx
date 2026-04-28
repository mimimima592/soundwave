import { useEffect, useState, useRef } from 'react';
import { scAPI } from '@/api/soundcloud';
import type { SCTrack } from '@/types/soundcloud';
import { TrackCard } from '@/components/player/TrackCard';
import { PageHeader, EmptyState, PillFilters, TrackCardSkeleton } from '@/components/common/UI';
import { usePageCacheStore } from '@/store/pageCache';
import { useGridSidebarAnim } from '@/hooks/useGridSidebarAnim';

const GENRES = [
  { id: 'all-music', label: 'Всё' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'hiphoprap', label: 'Hip-hop' },
  { id: 'rock', label: 'Rock' },
  { id: 'pop', label: 'Pop' },
  { id: 'rbsoul', label: 'R&B' },
  { id: 'ambient', label: 'Ambient' },
  { id: 'deephouse', label: 'Deep House' },
  { id: 'techno', label: 'Techno' },
] as const;

type Genre = typeof GENRES[number]['id'];

export function TrendingPage() {
  const [genre, setGenre] = useState<Genre>('all-music');
  const [tracks, setTracks] = useState<SCTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gridClassName = 'main-grid-layout';
  const skeletonItems = Array.from({ length: 28 });
  const sidebarAnimRef = useGridSidebarAnim();

  useEffect(() => {
    const cacheKey = `page:trending:${genre}`;
    const cached = usePageCacheStore.getState().getPageCache<SCTrack[]>(cacheKey, 2 * 60 * 1000);
    if (cached) {
      setTracks(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await scAPI.getCharts('trending', genre);
        if (!cancelled) {
          const parsedTracks = res.collection.map((c) => c.track).filter(Boolean);
          setTracks(parsedTracks);
          usePageCacheStore.getState().setPageCache(cacheKey, parsedTracks);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [genre]);

  return (
    <div>
      <PageHeader title="Тренды" subtitle="Что сейчас слушают по всему миру" />

      <PillFilters options={GENRES} active={genre} onChange={setGenre} />

      {error && <EmptyState title="Ошибка" description={error} />}

      {!error && (
        loading ? (
          <div className={gridClassName} ref={sidebarAnimRef}>
            {skeletonItems.map((_, i) => (
              <TrackCardSkeleton key={`trend-skeleton-${i}`} />
            ))}
          </div>
        ) : (
          <div className={`${gridClassName} animate-slide-up`} ref={sidebarAnimRef}>
            {tracks.map((track, i) => (
              <TrackCard key={track.id} track={track} queue={tracks} index={i} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
