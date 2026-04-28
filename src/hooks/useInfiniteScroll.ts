import { useEffect, useRef, useState, useCallback } from 'react';
import { useScrollContainer } from '@/contexts/ScrollContainerContext';

interface UseInfiniteScrollOptions {
  threshold?: number;
  enabled?: boolean;
  /**
   * Скролл-контейнер, относительно которого отслеживается пересечение.
   * По умолчанию берётся из ScrollContainerContext. Передайте `null` явно,
   * чтобы использовать вьюпорт.
   */
  root?: Element | null;
}

export function useInfiniteScroll(
  callback: () => void,
  options: UseInfiniteScrollOptions = {}
) {
  const { threshold = 100, enabled = true } = options;
  const contextRoot = useScrollContainer();
  const root = options.root !== undefined ? options.root : contextRoot;

  const callbackRef = useRef(callback);
  const [targetEl, setTargetEl] = useState<HTMLDivElement | null>(null);

  // Держим свежий callback в ref, чтобы не пересоздавать observer на каждый рендер
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // ref-callback, чтобы хук корректно реагировал на появление/смену узла
  // (например, при условном рендере сентинела после загрузки данных)
  const targetRef = useCallback((node: HTMLDivElement | null) => {
    setTargetEl(node);
  }, []);

  useEffect(() => {
    if (!enabled || !targetEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          callbackRef.current();
        }
      },
      {
        root,
        rootMargin: `${threshold}px`,
        threshold: 0,
      }
    );

    observer.observe(targetEl);
    return () => observer.disconnect();
  }, [enabled, threshold, root, targetEl]);

  return targetRef;
}
