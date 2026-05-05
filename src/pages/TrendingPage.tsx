import { useEffect, useState, useRef, useMemo } from 'react';
import { scAPI } from '@/api/soundcloud';
import type { SCTrack } from '@/types/soundcloud';
import { TrackCard } from '@/components/player/TrackCard';
import { PageHeader, EmptyState, PillFilters, TrackCardSkeleton } from '@/components/common/UI';
import { usePageCacheStore } from '@/store/pageCache';

import { useT } from '@/store/i18n';

type Genre = 'all-music' | 'electronic' | 'hiphoprap' | 'rock' | 'pop' | 'rbsoul' | 'ambient' | 'deephouse' | 'techno';

export function TrendingPage() {
  const t = useT();
  const GENRES = [
    { id: 'all-music', label: t('trending_all') },
    { id: 'electronic', label: 'Electronic' },
    { id: 'hiphoprap', label: 'Hip-hop' },
    { id: 'rock', label: 'Rock' },
    { id: 'pop', label: 'Pop' },
    { id: 'rbsoul', label: 'R&B' },
    { id: 'ambient', label: 'Ambient' },
    { id: 'deephouse', label: 'Deep House' },
    { id: 'techno', label: 'Techno' },
  ] as const;
  const [genre, setGenre] = useState<Genre>('all-music');
  const [tracks, setTracks] = useState<SCTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gridClassName = 'main-grid-layout';
  const skeletonItems = useMemo(() => {
    // Считаем сколько карточек помещается на экран: колонки × строки + запас
    const minCardWidth = 180;
    const gap = 20;
    const padding = 32;
    const availableWidth = window.innerWidth - padding;
    const cols = Math.max(1, Math.floor((availableWidth + gap) / (minCardWidth + gap)));
    const availableHeight = window.innerHeight - 200; // вычитаем header
    const cardHeight = 220; // примерная высота карточки
    const rows = Math.ceil(availableHeight / (cardHeight + gap)) + 1;
    return Array.from({ length: cols * rows });
  }, []);


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
      <PageHeader title={t('trending_title')} subtitle={t('trending_subtitle')} />

      <PillFilters options={GENRES} active={genre} onChange={setGenre} />

      {error && <EmptyState title={t('error')} description={error} />}

      {!error && (
        loading ? (
          <div className={gridClassName}>
            {skeletonItems.map((_, i) => (
              <TrackCardSkeleton key={`trend-skeleton-${i}`} />
            ))}
          </div>
        ) : (
          <div className={`${gridClassName} animate-slide-up`}>
            {tracks.map((track, i) => (
              <TrackCard key={track.id} track={track} queue={tracks} index={i} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
