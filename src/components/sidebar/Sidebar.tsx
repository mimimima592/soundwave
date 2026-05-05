import { NavLink } from 'react-router-dom';
import { Home, Search, Library, Heart, Settings, Radio, Waves, User, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/format';
import { useUIStore } from '@/store/ui';
import { useT } from '@/store/i18n';

const ANIM_DURATION = 300;
const COLLAPSED_W = 60;
const DEFAULT_W = 236;
const MIN_W = 160;
const MAX_W = 420;

export function Sidebar() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const t = useT();

  const nav = [
    { to: '/', label: t('nav_home'), icon: Home, end: true },
    { to: '/search', label: t('nav_search'), icon: Search },
    { to: '/wave', label: t('nav_wave'), icon: Waves },
    { to: '/feed', label: t('nav_feed'), icon: Radio },
    { to: '/history', label: t('nav_history'), icon: Clock },
    { to: '/library', label: t('nav_library'), icon: Library },
    { to: '/likes', label: t('nav_likes'), icon: Heart },
  ];

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try { return Number(localStorage.getItem('sidebar-width')) || DEFAULT_W; } catch { return DEFAULT_W; }
  });
  const [isDragging, setIsDragging] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);
  const currentWRef = useRef(sidebarWidth);
  const prevWidthRef = useRef(sidebarCollapsed ? COLLAPSED_W : sidebarWidth);

  useEffect(() => { currentWRef.current = sidebarWidth; }, [sidebarWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = e.clientX - startXRef.current;
      const newW = Math.max(MIN_W, Math.min(MAX_W, startWRef.current + delta));
      currentWRef.current = newW;
      // Aside (position:fixed) — двигаем напрямую, layout не страдает.
      if (asideRef.current) asideRef.current.style.width = `${newW}px`;
      // Main двигаем через transform, БЕЗ изменения spacer.
      // Spacer обновляется только на mouseup → один relayout вместо
      // 60/сек. Visible-сдвиг main = разница между текущей и старой шириной.
      const offset = startWRef.current - newW;
      // offset > 0 при сужении → main уже должен быть «как при сужении»,
      // но spacer ещё держит старую ширину, поэтому main фактически
      // в старой позиции. Чтобы он визуально следовал за aside, нужно
      // сдвинуть его на -offset (если уменьшили — двигаем влево).
      document.documentElement.style.setProperty(
        '--sidebar-anim-offset',
        `${-offset}px`,
      );
    };
    const onUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const w = currentWRef.current;
      // Финал: один relayout. Spacer прыгает на новую ширину,
      // одновременно убираем transform (offset=0) — main на правильном
      // месте без визуального скачка, т.к. layout и transform
      // компенсируют друг друга в один кадр.
      const root = document.documentElement;
      root.style.removeProperty('--sidebar-anim-offset');
      root.removeAttribute('data-sidebar-anim');
      const spacer = document.getElementById('sidebar-spacer');
      if (spacer) spacer.style.width = `${w}px`;
      // Синхронизируем prevWidthRef, чтобы следующий toggle-эффект
      // сравнивал с актуальной шириной, а не с той, что была до drag.
      prevWidthRef.current = w;
      setSidebarWidth(w);
      try { localStorage.setItem('sidebar-width', String(w)); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const onDragStart = (e: React.MouseEvent) => {
    if (sidebarCollapsed) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWRef.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    // Активируем CSS-режим: transform применяется без transition.
    // Main двигается «прилипшим» к курсору, без задержек.
    const root = document.documentElement;
    root.style.setProperty('--sidebar-anim-offset', '0px');
    root.setAttribute('data-sidebar-anim', 'snap');
    e.preventDefault();
  };

  // ─── FLIP-анимация main при тоггле сайдбара ───
  // Раньше main двигался плавно через анимацию ширины spacer'а.
  // Это вызывало relayout всех карточек грида на каждом кадре → лаги.
  // Теперь spacer прыгает мгновенно (layout пересчитывается ровно один раз),
  // а визуальная плавность достигается через transform: translateX на main.
  // Transform композитится на GPU и не вызывает relayout.
  useEffect(() => {
    const newWidth = sidebarCollapsed ? COLLAPSED_W : sidebarWidth;
    const oldWidth = prevWidthRef.current;
    prevWidthRef.current = newWidth;
    if (oldWidth === newWidth) return;
    if (isDragging) return; // drag сам управляет визуалом

    const root = document.documentElement;
    const offset = oldWidth - newWidth; // на сколько main «уехал» в layout

    // Шаг 1: layout уже изменился (sidebarCollapsed обновил currentWidth → spacer
    // сразу прыгнул на новую ширину). Возвращаем main визуально на старое место
    // через transform, БЕЗ transition — мгновенно.
    root.style.setProperty('--sidebar-anim-offset', `${offset}px`);
    root.setAttribute('data-sidebar-anim', 'snap');

    // Шаг 2: на следующем кадре включаем transition и сбрасываем offset в 0.
    // Браузер плавно анимирует transform с offset до 0 — визуально main едет.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        root.setAttribute('data-sidebar-anim', 'play');
        root.style.setProperty('--sidebar-anim-offset', '0px');
      });
    });

    const cleanupTimer = setTimeout(() => {
      root.removeAttribute('data-sidebar-anim');
      root.style.removeProperty('--sidebar-anim-offset');
    }, ANIM_DURATION + 50);

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      clearTimeout(cleanupTimer);
    };
    // ВАЖНО: sidebarWidth НЕ в deps — изменение ширины через drag не должно
    // запускать FLIP-анимацию. Drag сам управляет transform'ом main.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarCollapsed]);

  const currentWidth = sidebarCollapsed ? COLLAPSED_W : sidebarWidth;

  return (
    <>
      <aside
        ref={asideRef}
        className="fixed left-0 z-30 flex flex-col overflow-hidden"
        style={{
          top: '40px',
          bottom: '88px',
          width: `${currentWidth}px`,
          transition: isDragging ? 'none' : `width ${ANIM_DURATION}ms var(--ease-ios)`,
          // willChange только во время drag — иначе браузер постоянно держит сайдбар
          // в отдельном compositor-слое и пересчитывает его на каждый repaint
          willChange: isDragging ? 'width' : undefined,
          background: 'rgb(var(--theme-surface) / var(--theme-surface-opacity, 0.95))',
          borderRight: '1px solid rgb(var(--theme-border) / 0.3)',
        }}
      >
        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-hidden">
          <div className={cn(
            'px-3 pt-1 pb-2.5 transition-all duration-300 whitespace-nowrap overflow-hidden',
            sidebarCollapsed ? 'opacity-0 max-w-0 p-0 h-0' : 'opacity-100'
          )}>
            <span
              className="text-[10.5px] uppercase tracking-[0.16em] font-semibold"
              style={{ color: 'rgb(var(--theme-text-dim) / 0.5)', fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              {t('nav_navigation')}
            </span>
          </div>

          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center rounded-xl text-sm overflow-hidden',
                  sidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-surface-alt/70 text-text'
                    : 'text-text-dim hover:bg-surface-alt/40 hover:text-text'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="nav-active-bar" />}
                  <div
                    className="flex items-center justify-center w-5 flex-shrink-0"
                    style={{ color: isActive ? 'rgb(var(--theme-accent))' : undefined }}
                  >
                    <Icon size={17} strokeWidth={isActive ? 2.3 : 1.7} fill={isActive ? 'rgb(var(--theme-accent) / 0.12)' : 'none'} />
                  </div>
                  <span className={cn(
                    'whitespace-nowrap transition-all duration-300 nav-label text-[14px] font-medium',
                    sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                  )}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-2 py-2 space-y-0.5" style={{ borderTop: '1px solid rgb(var(--theme-border) / 0.25)' }}>
          {[
            { to: '/user', label: t('nav_profile'), icon: User },
            { to: '/settings', label: t('nav_settings'), icon: Settings },
          ].map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/user'}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center rounded-xl text-sm transition-colors duration-[120ms] overflow-hidden',
                  sidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-surface-alt/70 text-text'
                    : 'text-text-dim hover:bg-surface-alt/40 hover:text-text'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="nav-active-bar" />}
                  <div
                    className="flex items-center justify-center w-5 flex-shrink-0"
                    style={{ color: isActive ? 'rgb(var(--theme-accent))' : undefined }}
                  >
                    <Icon size={17} strokeWidth={isActive ? 2.3 : 1.7} />
                  </div>
                  <span className={cn(
                    'whitespace-nowrap transition-all duration-300 nav-label text-[14px] font-medium',
                    sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                  )}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {!sidebarCollapsed && (
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-50 group/drag"
            onMouseDown={onDragStart}
          >
            <div className="absolute inset-y-0 -left-1 right-0 w-3 group-hover/drag:bg-accent/15 transition-colors duration-200" />
          </div>
        )}

        {/*
          Wrapper держит позиционирование (translateY(-50%)),
          внутренняя кнопка отвечает за hover/active scale.
          Если scale-трансформ навесить на тот же элемент, что и translateY,
          ховер перезаписывает translate и кнопка "уезжает" вниз.
        */}
        <div
          className="absolute -right-3.5 top-1/2 -translate-y-1/2 z-40 w-7 h-7"
        >
          <button
            onClick={toggleSidebar}
            className="sidebar-toggle-button w-full h-full rounded-full flex items-center justify-center"
            style={{
              background: 'rgb(var(--theme-surface))',
              border: '1px solid rgb(var(--theme-border) / 0.5)',
              boxShadow: '0 2px 12px rgb(0 0 0 / 0.3)',
              color: 'rgb(var(--theme-text-dim))',
            }}
          >
            {sidebarCollapsed ? <ChevronRight size={13} strokeWidth={2} /> : <ChevronLeft size={13} strokeWidth={2} />}
          </button>
        </div>
      </aside>

      <div
        id="sidebar-spacer"
        className="flex-shrink-0 h-full"
        style={{
          width: `${currentWidth}px`,
          /*
            ВАЖНО: spacer НЕ анимирует ширину через CSS-transition.
            Раньше он плавно тянул ширину 300мс, и каждый кадр анимации
            заставлял main перекладываться → грид с сотней карточек
            пересчитывался ~18 раз → лаги.
            Теперь spacer прыгает на финальную ширину одним кадром:
            main перекладывается ровно один раз. Сам сайдбар (aside)
            анимирует ширину отдельно — он position:fixed, на main
            не влияет, его overflow:hidden скрывает зазор/наложение
            между его краем и main во время анимации.
            При drag-ресайзе ширина пишется напрямую через style.width
            из onMove — там transition тоже не нужен.
          */
        }}
        aria-hidden="true"
      />
    </>
  );
}
