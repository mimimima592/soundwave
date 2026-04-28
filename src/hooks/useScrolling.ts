import { useEffect, useRef } from 'react';

/**
 * Если enabled=true — вешает data-scrolling на элемент пока идёт скролл.
 * CSS замораживает hover-transitions во время прокрутки, снижая нагрузку на GPU.
 */
export function useScrolling(
  elementRef: React.RefObject<HTMLElement> | HTMLElement | null,
  enabled = true,
  delay = 150,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el =
      elementRef && 'current' in elementRef ? elementRef.current : elementRef;
    if (!el) return;

    if (!enabled) {
      el.removeAttribute('data-scrolling');
      return;
    }

    const onScroll = () => {
      el.setAttribute('data-scrolling', 'true');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        el.removeAttribute('data-scrolling');
      }, delay);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
      el.removeAttribute('data-scrolling');
    };
  }, [elementRef, enabled, delay]);
}
