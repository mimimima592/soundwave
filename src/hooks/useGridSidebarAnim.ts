import { useEffect, useRef } from 'react';
import { useUIStore } from '@/store/ui';

/**
 * Вешает blur-анимацию на div грида при toggle сайдбара.
 * Blur-in быстро, blur-out плавно — эффект "дыхания".
 */
export function useGridSidebarAnim() {
  const gridRef = useRef<HTMLDivElement>(null);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const el = gridRef.current;
    if (!el) return;

    // Отменяем предыдущие анимации
    el.getAnimations().forEach(a => a.cancel());

    // Blur in — быстро (пока сайдбар раскрывается)
    const anim1 = el.animate(
      [{ filter: 'blur(0px)', opacity: '1' }, { filter: 'blur(6px)', opacity: '0.4' }],
      { duration: 120, easing: 'ease-out', fill: 'forwards' }
    );

    // Blur out — стартует через 130ms, плавно возвращается
    const t = setTimeout(() => {
      el.animate(
        [{ filter: 'blur(6px)', opacity: '0.4' }, { filter: 'blur(0px)', opacity: '1' }],
        { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
      );
    }, 130);

    // Сбрасываем fill:forwards после завершения
    const cleanup = setTimeout(() => {
      el.getAnimations().forEach(a => a.cancel());
    }, 130 + 270);

    return () => {
      clearTimeout(t);
      clearTimeout(cleanup);
      anim1.cancel();
    };
  }, [sidebarCollapsed]);

  return gridRef;
}
