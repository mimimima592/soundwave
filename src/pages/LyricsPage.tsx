import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Music2, CheckCircle2, AlignLeft, Pause, Play } from 'lucide-react';
import { usePlayerStore } from '@/store/player';
import { useLyrics } from '@/hooks/useLyrics';
import { hiResArtwork, cn } from '@/utils/format';

export function LyricsPage() {
  const navigate   = useNavigate();
  const track      = usePlayerStore((s) => s.currentTrack);
  const isPlaying  = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const { lines, plainLyrics, instrumental, loading, notFound, synced, activeIndex } = useLyrics();

  const activeRef    = useRef<HTMLParagraphElement>(null);
  const prevIndexRef = useRef(-1);
  const [artLoaded, setArtLoaded]   = useState(false);
  const [artHovered, setArtHovered] = useState(false);

  useEffect(() => { if (!track) navigate(-1); }, [track, navigate]);
  useEffect(() => setArtLoaded(false), [track?.id]);

  useEffect(() => {
    if (activeIndex !== prevIndexRef.current && synced && activeRef.current) {
      prevIndexRef.current = activeIndex;
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex, synced]);

  if (!track) return null;

  const artwork   = hiResArtwork(track.artwork_url);
  const genre     = (track as any).genre as string | null | undefined;
  const hasSynced = synced && lines.length > 0;

  return (
    <div
      className="animate-slide-up -m-8 flex"
      style={{ height: 'calc(100vh - 112px)' }}
    >
      {/* ══════════════════════════════════════
          Левая панель
         ══════════════════════════════════════ */}
      <div
        className="relative flex-shrink-0 flex flex-col overflow-hidden"
        style={{ width: 'clamp(240px, 28%, 320px)' }}
      >
        {/* Арт-фон панели */}
        {artwork && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${artwork})`,
              filter: 'blur(48px) brightness(0.28) saturate(1.6)',
              transform: 'scale(1.2)',
              opacity: artLoaded ? 1 : 0,
              transition: 'opacity 0.8s ease',
            }}
          />
        )}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to right, transparent 50%, rgb(var(--theme-bg)) 100%)' }}
        />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgb(var(--theme-bg) / 0.85) 0%, transparent 45%)' }}
        />

        {/* Контент */}
        <div className="relative z-10 flex flex-col h-full p-7 pt-8">
          <div className="flex flex-col gap-5 justify-center flex-1 items-center text-center">

            {/* Обложка с кнопкой паузы */}
            <div
              className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 cursor-pointer"
              style={{ width: '100%', maxWidth: 200, aspectRatio: '1' }}
              onMouseEnter={() => setArtHovered(true)}
              onMouseLeave={() => setArtHovered(false)}
              onClick={togglePlay}
            >
              {artwork
                ? <img
                    src={artwork}
                    alt={track.title}
                    className={cn(
                      'w-full h-full object-cover transition-all duration-300',
                      artLoaded ? 'opacity-100' : 'opacity-0',
                      artHovered ? 'brightness-50' : 'brightness-100',
                    )}
                    draggable={false}
                    onLoad={() => setArtLoaded(true)}
                  />
                : <div className="w-full h-full bg-surface-alt flex items-center justify-center">
                    <Music2 size={36} className="text-accent/30" />
                  </div>
              }
              {/* Play/Pause кнопка поверх */}
              <div
                className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
                style={{ opacity: artHovered ? 1 : 0 }}
              >
                <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                  {isPlaying
                    ? <Pause size={22} className="text-white" fill="white" />
                    : <Play  size={22} className="text-white translate-x-0.5" fill="white" />
                  }
                </div>
              </div>
            </div>

            {/* Название — кликабельное, ведёт на страницу трека */}
            <div className="min-w-0 w-full space-y-1">
              <h2
                className="font-bold leading-snug line-clamp-2 text-center cursor-pointer hover:text-accent transition-colors duration-150"
                style={{ fontSize: 'clamp(14px, 1.8vw, 18px)' }}
                title={track.title}
                onClick={() => navigate(`/track/${track.id}`)}
              >
                {track.title}
              </h2>
              {/* Артист — кликабельный, ведёт на профиль */}
              <p
                className="text-sm text-text-dim truncate text-center cursor-pointer hover:text-text transition-colors duration-150"
                onClick={() => navigate(`/user/${track.user.id}`)}
              >
                {track.user.username}
              </p>
            </div>

            {/* Бейджи — фиксированный белый, не зависит от темы */}
            <div className="flex flex-wrap gap-2 justify-center">
              {genre && (
                <span className="inline-flex items-center text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap"
                  style={{
                    background: 'rgb(255 255 255 / 0.10)',
                    color: 'rgb(255 255 255 / 0.85)',
                    border: '1px solid rgb(255 255 255 / 0.15)',
                  }}
                >
                  {genre}
                </span>
              )}
              {!loading && !notFound && !instrumental && (
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap"
                  style={{
                    background: synced ? 'rgb(255 255 255 / 0.12)' : 'rgb(255 255 255 / 0.07)',
                    color: synced ? 'rgb(255 255 255 / 0.90)' : 'rgb(255 255 255 / 0.45)',
                    border: synced ? '1px solid rgb(255 255 255 / 0.20)' : '1px solid rgb(255 255 255 / 0.10)',
                  }}
                >
                  {synced ? <CheckCircle2 size={11} /> : <AlignLeft size={11} />}
                  {synced ? 'Синхронизировано' : 'Без синхронизации'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          Правая панель — текст
         ══════════════════════════════════════ */}
      <div className="flex-1 overflow-hidden relative min-w-0">
        <div
          className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 16%, black 84%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 16%, black 84%, transparent 100%)',
          }}
        >
          {loading && (
            <div className="h-full flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-accent/25 border-t-accent animate-spin" />
            </div>
          )}

          {!loading && (instrumental || notFound) && (
            <div className="h-full flex flex-col items-center justify-center gap-5 text-center px-12">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center ring-1 ring-white/8"
                style={{ background: 'rgb(var(--theme-surface-alt))' }}
              >
                <Music2 size={24} className="text-text-dim opacity-40" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">
                  {instrumental ? 'Инструментальный трек' : 'Текст не найден'}
                </p>
                <p className="text-xs text-text-dim opacity-50 leading-relaxed max-w-xs">
                  {instrumental
                    ? 'У этого трека нет слов'
                    : 'Не удалось найти текст для этого трека на lrclib'}
                </p>
              </div>
            </div>
          )}

          {!loading && hasSynced && (
            <div className="flex flex-col px-10" style={{ paddingTop: '36vh', paddingBottom: '38vh' }}>
              {lines.map((line, i) => {
                const dist     = i - activeIndex;
                const isActive = dist === 0;
                const d        = Math.abs(dist);
                const opacity  =
                  isActive ? 1
                  : d === 1 ? 0.38
                  : d === 2 ? 0.2
                  : Math.max(0.06, 0.2 - d * 0.04);
                const fontSize =
                  isActive ? '1.65rem' : d === 1 ? '1.35rem' : '1.2rem';

                return (
                  <div
                    key={i}
                    className="relative"
                    style={{ paddingBlock: isActive ? '9px' : '6px' }}
                  >
                    {isActive && (
                      <div
                        className="absolute rounded-xl pointer-events-none"
                        style={{
                          inset: 0,
                          left: '-14px',
                          right: '-6px',
                          background: 'rgb(var(--theme-surface-alt) / 0.45)',
                          border: '1px solid rgb(var(--theme-border) / 0.4)',
                        }}
                      />
                    )}
                    <div
                      className="absolute left-[-14px] top-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-300 ease-out"
                      style={{
                        height: isActive ? '55%' : '0%',
                        background: 'rgb(var(--theme-accent))',
                        opacity: isActive ? 1 : 0,
                      }}
                    />
                    <p
                      ref={isActive ? activeRef : null}
                      className="relative select-text cursor-default leading-snug transition-[opacity,font-size,font-weight] duration-300 ease-out"
                      style={{
                        opacity,
                        fontSize,
                        fontWeight: isActive ? 700 : d === 1 ? 600 : 500,
                        color: 'rgb(var(--theme-text))',
                      }}
                    >
                      {line.text}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !synced && plainLyrics && (
            <div className="py-12 px-10">
              {plainLyrics.split(/\n{2,}/).map((stanza, si) => (
                <div key={si} className="mb-8 last:mb-0">
                  {stanza.split('\n').filter(Boolean).map((line, li) => (
                    <p key={li} className="text-lg text-text-dim leading-relaxed select-text font-medium">
                      {line}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
