import { useUIStore } from '@/store/ui';
import { usePlayerStore } from '@/store/player';
import { hiResArtwork } from '@/utils/format';
import { useRef, memo } from 'react';

/**
 * Фоновый слой приложения.
 * Оптимизирован: memo + заморозка src при неактивном окне.
 * Поддерживает: GIF по URL, артворк текущего трека, однотонный цвет, или none.
 */
export const BackgroundLayer = memo(function BackgroundLayer() {
  const type    = useUIStore((s) => s.backgroundType);
  const url     = useUIStore((s) => s.backgroundUrl);
  const blur    = useUIStore((s) => s.backgroundBlur);
  const opacity = useUIStore((s) => s.backgroundOpacity);
  const trackId = usePlayerStore((s) => s.currentTrack?.id);
  const trackArtwork = usePlayerStore((s) => s.currentTrack?.artwork_url);

  // Кешируем последний src — не меняем его пока окно неактивно
  // чтобы не вызывать перерисовку blur-слоя при смене трека в фоне
  const frozenSrcRef = useRef<string | null>(null);

  if (type === 'none') return null;

  const liveSrc =
    type === 'artwork'
      ? hiResArtwork(trackArtwork) ?? ''
      : (type === 'gif' || type === 'color') ? (url ?? '') : '';

  // Обновляем замороженный src только когда окно активно
  const isBlurred = document.documentElement.classList.contains('window-blurred');
  if (!isBlurred && liveSrc) frozenSrcRef.current = liveSrc;
  const src = frozenSrcRef.current ?? liveSrc;

  if (type === 'color') {
    return (
      <div
        className="background-layer"
        style={{ background: url || '#000', opacity }}
      />
    );
  }

  if (!src) return null;

  return (
    <div
      className="background-layer"
      style={{
        opacity,
        // blur рендерится в отдельном layer через translateZ(0) в CSS
        // scale компенсирует края при blur
        filter: blur > 0 ? `blur(${blur}px) saturate(1.2)` : undefined,
        transform: blur > 0 ? `scale(${(1 + blur / 200)}) translateZ(0)` : 'translateZ(0)',
      }}
    >
      <img src={src} alt="" draggable={false} />
    </div>
  );
});
