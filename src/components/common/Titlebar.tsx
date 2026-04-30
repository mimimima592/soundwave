import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Square, X, Copy, ChevronLeft, ChevronRight } from 'lucide-react';

export function Titlebar() {
  const navigate = useNavigate();
  const [isMaximized, setIsMaximized] = useState(false);
  const isMac = window.electron?.platform === 'darwin';

  useEffect(() => {
    window.electron?.window.isMaximized().then((v) => setIsMaximized(Boolean(v)));
    const off = window.electron?.window.onMaximizeChange(setIsMaximized);
    return () => { if (off) off(); };
  }, []);

  return (
    <div
      className="titlebar-drag h-10 flex items-center justify-between relative z-40"
      style={{ background: 'transparent' }}
    >
      {/* Логотип + навигация */}
      <div className={`flex items-center gap-2 pl-3 ${isMac ? 'pl-[76px]' : ''}`}>
        <div className="titlebar-nodrag flex items-center gap-0.5">
          <button
            onClick={() => navigate(-1)}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-surface-alt/60 transition-all duration-150 active:scale-95"
            aria-label="Назад"
          >
            <ChevronLeft size={15} className="text-text-dim" strokeWidth={2.2} />
          </button>
          <button
            onClick={() => navigate(1)}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-surface-alt/60 transition-all duration-150 active:scale-95"
            aria-label="Вперед"
          >
            <ChevronRight size={15} className="text-text-dim" strokeWidth={2.2} />
          </button>
        </div>

        {/* Логотип */}
        <div className="flex items-center gap-2 ml-1">
          <div
            className="w-[22px] h-[22px] rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgb(var(--theme-accent)), rgb(var(--theme-accent-hover)))',
              boxShadow: '0 2px 10px rgb(var(--theme-accent) / 0.4)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 256 256" fill="none">
              <path
                d="M 28 128 Q 70 28 112 128 Q 154 228 196 128 Q 218 78 238 128"
                stroke="white"
                strokeWidth="52"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span
            className="text-[11px] font-semibold tracking-[0.12em] uppercase"
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              color: 'rgb(var(--theme-text) / 0.6)',
              letterSpacing: '0.14em',
            }}
          >
            Soundwave
          </span>
        </div>
      </div>

      {/* Window controls — только для Windows */}
      {!isMac && (
        <div className="titlebar-nodrag flex items-center">
          <button
            onClick={() => window.electron?.window.minimize()}
            className="h-10 w-11 flex items-center justify-center hover:bg-surface-alt/50 transition-colors group"
            aria-label="Свернуть"
          >
            <Minus size={13} strokeWidth={1.8} className="text-text-dim group-hover:text-text transition-colors" />
          </button>
          <button
            onClick={() => window.electron?.window.maximize()}
            className="h-10 w-11 flex items-center justify-center hover:bg-surface-alt/50 transition-colors group"
            aria-label="Развернуть"
          >
            {isMaximized ? (
              <Copy size={11} strokeWidth={1.8} className="text-text-dim group-hover:text-text transition-colors" />
            ) : (
              <Square size={11} strokeWidth={1.8} className="text-text-dim group-hover:text-text transition-colors" />
            )}
          </button>
          <button
            onClick={() => window.electron?.window.close()}
            className="h-10 w-11 flex items-center justify-center hover:bg-red-500 transition-colors group"
            aria-label="Закрыть"
          >
            <X size={13} strokeWidth={1.8} className="text-text-dim group-hover:text-white transition-colors" />
          </button>
        </div>
      )}
    </div>
  );
}
