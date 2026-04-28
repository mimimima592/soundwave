import { NavLink } from 'react-router-dom';
import { Home, Search, Library, Heart, Settings, TrendingUp, Radio, Waves, User, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/format';
import { useUIStore } from '@/store/ui';

const nav = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/search', label: 'Поиск', icon: Search },
  { to: '/wave', label: 'Волна', icon: Waves },
  { to: '/feed', label: 'Лента', icon: Radio },
  { to: '/history', label: 'История', icon: Clock },
  { to: '/library', label: 'Библиотека', icon: Library },
  { to: '/likes', label: 'Любимое', icon: Heart },
];

const ANIM_DURATION = 300;
const COLLAPSED_W = 60;
const DEFAULT_W = 236;
const MIN_W = 160;
const MAX_W = 420;

export function Sidebar() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try { return Number(localStorage.getItem('sidebar-width')) || DEFAULT_W; } catch { return DEFAULT_W; }
  });
  const [isDragging, setIsDragging] = useState(false);

  const asideRef = useRef<HTMLElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);
  const currentWRef = useRef(sidebarWidth);

  useEffect(() => { currentWRef.current = sidebarWidth; }, [sidebarWidth]);

  useEffect(() => {
    if (isDragging) return;
    const spacer = document.getElementById('sidebar-spacer');
    if (!spacer) return;
    spacer.classList.add('sidebar-animating-spacer');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      spacer.classList.remove('sidebar-animating-spacer');
    }, ANIM_DURATION + 50);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [sidebarCollapsed, isDragging]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = e.clientX - startXRef.current;
      const newW = Math.max(MIN_W, Math.min(MAX_W, startWRef.current + delta));
      currentWRef.current = newW;
      if (asideRef.current) asideRef.current.style.width = `${newW}px`;
      const spacer = document.getElementById('sidebar-spacer');
      if (spacer) spacer.style.width = `${newW}px`;
    };

    const onUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const w = currentWRef.current;
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
    e.preventDefault();
  };

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
          transition: isDragging ? 'none' : `width ${ANIM_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
          willChange: 'width',
          background: 'rgb(var(--theme-surface) / var(--theme-surface-opacity, 0.95))',
          borderRight: '1px solid rgb(var(--theme-border) / 0.3)',
        }}
      >
        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-hidden">
          {/* Раздел навигации */}
          <div className={cn(
            'px-3 pt-1 pb-2.5 transition-all duration-300 whitespace-nowrap overflow-hidden',
            sidebarCollapsed ? 'opacity-0 max-w-0 p-0 h-0' : 'opacity-100'
          )}>
            <span
              className="text-[10.5px] uppercase tracking-[0.16em] font-semibold"
              style={{ color: 'rgb(var(--theme-text-dim) / 0.5)', fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              Навигация
            </span>
          </div>

          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center rounded-xl text-sm transition-all duration-200 overflow-hidden',
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
                    <Icon
                      size={17}
                      strokeWidth={isActive ? 2.3 : 1.7}
                      fill={isActive ? 'rgb(var(--theme-accent) / 0.12)' : 'none'}
                    />
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

        {/* Низ сайдбара */}
        <div
          className="px-2 py-2 space-y-0.5"
          style={{ borderTop: '1px solid rgb(var(--theme-border) / 0.25)' }}
        >
          {[
            { to: '/user', label: 'Профиль', icon: User },
            { to: '/settings', label: 'Настройки', icon: Settings },
          ].map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/user'}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center rounded-xl text-sm transition-all duration-200 overflow-hidden',
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

        {/* Drag handle */}
        {!sidebarCollapsed && (
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-50 group/drag"
            onMouseDown={onDragStart}
          >
            <div className="absolute inset-y-0 -left-1 right-0 w-3 group-hover/drag:bg-accent/15 transition-colors duration-200" />
          </div>
        )}

        {/* Toggle button — переработанный, изящный */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3.5 top-1/2 -translate-y-1/2 z-40 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
          style={{
            background: 'rgb(var(--theme-surface))',
            border: '1px solid rgb(var(--theme-border) / 0.5)',
            boxShadow: '0 2px 12px rgb(0 0 0 / 0.3)',
            color: 'rgb(var(--theme-text-dim))',
          }}
        >
          {sidebarCollapsed
            ? <ChevronRight size={13} strokeWidth={2} />
            : <ChevronLeft size={13} strokeWidth={2} />}
        </button>
      </aside>

      <div
        id="sidebar-spacer"
        className="flex-shrink-0 h-full"
        style={{
          width: `${currentWidth}px`,
          transition: isDragging ? 'none' : `width ${ANIM_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }}
        aria-hidden="true"
      />
    </>
  );
}
