import { useEffect, useRef } from 'react';
import { X, Music2 } from 'lucide-react';
import { useLyrics } from '@/hooks/useLyrics';
import { usePlayerStore } from '@/store/player';
import { hiResArtwork, cn } from '@/utils/format';

interface LyricsPanelProps {
  isClosing: boolean;
  onClose: () => void;
}

export function LyricsPanel({ isClosing, onClose }: LyricsPanelProps) {
  const { lines, plainLyrics, instrumental, loading, notFound, synced, activeIndex } = useLyrics();
  const track = usePlayerStore((s) => s.currentTrack);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);
  const prevActiveIndex = useRef(-1);

  useEffect(() => {
    if (activeIndex !== prevActiveIndex.current && activeRef.current && synced) {
      prevActiveIndex.current = activeIndex;
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex, synced]);

  return (
    <div
      className="absolute bottom-24 right-4 w-[420px] h-[560px] queue-glass rounded-xl shadow-2xl overflow-hidden z-30 flex flex-col"
      style={{
        animation: isClosing
          ? 'fadeOutSlideDown 0.2s ease-out forwards'
          : 'fadeInSlideUp 0.2s ease-out',
      }}
    >
      {/* Заголовок */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border/20 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {track?.artwork_url ? (
            <img
              src={hiResArtwork(track.artwork_url)}
              alt=""
              className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
              draggable={false}
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-surface-alt flex-shrink-0 flex items-center justify-center">
              <Music2 size={16} className="text-text-dim" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">{track?.title ?? '—'}</p>
            <p className="text-xs text-text-dim truncate leading-tight">{track?.user.username ?? ''}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-surface-alt/60 transition-colors text-text-dim hover:text-text flex-shrink-0 ml-2"
        >
          <X size={15} />
        </button>
      </div>

      {/* Тело */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Загрузка */}
        {loading && (
          <div className="h-full flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        )}

        {/* Инструментал */}
        {!loading && instrumental && (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <Music2 size={36} className="text-text-dim opacity-30" />
            <p className="text-sm text-text-dim">Инструментальный трек</p>
          </div>
        )}

        {/* Не найдено */}
        {!loading && notFound && (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <Music2 size={36} className="text-text-dim opacity-30" />
            <p className="text-sm text-text-dim">Текст не найден</p>
          </div>
        )}

        {/* Нет трека */}
        {!loading && !instrumental && !notFound && !track && (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <Music2 size={36} className="text-text-dim opacity-30" />
            <p className="text-sm text-text-dim">Ничего не играет</p>
          </div>
        )}

        {/* Синхронизированные текст (LRC) */}
        {!loading && !instrumental && !notFound && synced && lines.length > 0 && (
          <div className="flex flex-col items-center text-center px-6 py-36 gap-5">
            {lines.map((line, i) => {
              const isActive = i === activeIndex;
              const isPast = i < activeIndex;
              return (
                <p
                  key={i}
                  ref={isActive ? activeRef : null}
                  className={cn(
                    'leading-snug select-text cursor-default transition-all duration-500',
                    isActive
                      ? 'text-[1.2rem] font-bold opacity-100'
                      : isPast
                      ? 'text-sm font-normal opacity-30'
                      : 'text-sm font-normal opacity-50'
                  )}
                  style={isActive ? { color: 'rgb(var(--theme-accent))' } : undefined}
                >
                  {line.text}
                </p>
              );
            })}
          </div>
        )}

        {/* Неcинхронизированный текст (plain) */}
        {!loading && !instrumental && !notFound && !synced && plainLyrics && (
          <div className="px-5 py-5">
            <pre className="text-sm text-text/75 whitespace-pre-wrap font-sans leading-relaxed select-text">
              {plainLyrics}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
