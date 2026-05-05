import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseInfiniteGridOptions {
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  items: any[];
  onLoadMore: () => void;
  rootMargin?: string;
  threshold?: number;
  disableResizeLoad?: boolean; // отключить авто-подгрузку при ресайзе
}

export function useInfiniteGrid({
  loading,
  loadingMore,
  hasMore,
  items,
  onLoadMore,
  rootMargin = '200px',
  threshold = 0.1,
  disableResizeLoad = false,
}: UseInfiniteGridOptions) {
  const getInitialColumnCount = () => {
    const minCardWidth = 180;
    const gap = 20;
    const padding = 32;
    // window.innerWidth доступен сразу, даже до mount
    return Math.max(1, Math.floor((window.innerWidth - padding + gap) / (minCardWidth + gap)));
  };

  const sentinelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(getInitialColumnCount);

  const getColumnsCount = useCallback(() => {
    if (gridRef.current) {
      const gridStyle = window.getComputedStyle(gridRef.current);
      const cols = gridStyle.getPropertyValue('grid-template-columns');
      return cols.split(' ').filter(Boolean).length;
    }
    return 5;
  }, []);

  // Dynamic limit: columnsCount * 6, minimum 30
  const getDynamicLimit = useCallback(() => {
    const cols = getColumnsCount();
    return Math.max(cols * 6, 30);
  }, [getColumnsCount]);

  // Update column count on mount and resize
  useEffect(() => {
    const update = () => {
      if (gridRef.current) {
        const gridWidth = gridRef.current.offsetWidth;
        const minCardWidth = 180;
        const gap = 20;
        const padding = 32;
        const cols = Math.floor((gridWidth - padding + gap) / (minCardWidth + gap));
        setColumnCount(Math.max(1, cols));
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Auto-load on resize if last row is incomplete (с debounce)
  useEffect(() => {
    if (disableResizeLoad) return;
    let timer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!loading && !loadingMore && hasMore && items.length > 0) {
          const cols = getColumnsCount();
          if (items.length % cols !== 0) onLoadMore();
        }
      }, 150);
    };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); clearTimeout(timer); };
  }, [loading, loadingMore, hasMore, items.length, getColumnsCount, onLoadMore, disableResizeLoad]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Проверяем актуальные значения в момент срабатывания
        // чтобы не тригерить loadMore когда hasMore уже false
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          onLoadMore();
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, rootMargin, threshold]);

  // Dynamic skeleton count: fill last row + one full row
  const skeletonCount = useMemo(() => {
    if (!loadingMore) return 0;
    const cols = getColumnsCount();
    const mod = items.length % cols;
    const remaining = mod === 0 ? 0 : cols - mod;
    return remaining + cols;
  }, [loadingMore, items.length, getColumnsCount]);

  // Initial skeleton count: 5 полных строк, минимум 15
  const initialSkeletonCount = useMemo(() => Math.max(columnCount * 5, 15), [columnCount]);

  return {
    sentinelRef,
    gridRef,
    columnCount,
    getColumnsCount,
    getDynamicLimit,
    skeletonCount,
    initialSkeletonCount,
  };
}
