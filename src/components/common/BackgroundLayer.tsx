import { useUIStore } from '@/store/ui';
import { usePlayerStore } from '@/store/player';
import { hiResArtwork } from '@/utils/format';
import { useRef, memo } from 'react';

/**
 * Фоновый слой приложения.
 *
 * Поддерживает: GIF/PNG/JPG по URL (через <img>), MP4/WebM (через <video> с
 * аппаратным декодированием — в разы легче чем GIF), артворк текущего трека,
 * однотонный цвет, или none.
 *
 * Оптимизирован: memo + заморозка src при неактивном окне.
 */

// Распознаём видео по расширению URL — даже если в query-параметрах есть мусор.
// Видео декодируется через GPU video pipeline (overlay surface), что на порядок
// дешевле чем GIF (который декодируется на CPU как последовательность bitmap-ов).
function isVideoUrl(src: string): boolean {
  // Берём только pathname без query/hash чтобы '?param=1' и '#hash' не мешали
  const path = src.split('?')[0].split('#')[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v)$/.test(path);
}

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

  // Видео распознаётся только для type === 'gif' (так пользователь сейчас вставляет URL'ы).
  // Для type === 'artwork' это всегда статичные jpg/png с SoundCloud — там видео не бывает.
  const useVideo = type === 'gif' && isVideoUrl(src);

  return (
    <div
      className="background-layer"
      style={{
        opacity,
        // Изолируем blur в отдельный compositor layer — он не пересчитывается
        // при каждом repaint остального UI (hover, скролл, перерисовка очереди и т.д.)
        filter: blur > 0 ? `blur(${blur}px) saturate(1.2)` : undefined,
        transform: blur > 0 ? `scale(${(1 + blur / 200)}) translateZ(0)` : 'translateZ(0)',
        willChange: blur > 0 ? 'filter' : undefined,
      }}
    >
      {useVideo ? (
        <video
          // key по src чтобы при смене URL ремонтировался элемент и грузил новый файл
          key={src}
          src={src}
          autoPlay
          loop
          muted
          playsInline
          // disablePictureInPicture/disableRemotePlayback — нет meta-кнопок поверх видео
          disablePictureInPicture
          disableRemotePlayback
          // preload=auto чтобы видео грузилось сразу как только смонтировано
          preload="auto"
          draggable={false}
        />
      ) : (
        <img src={src} alt="" draggable={false} decoding="async" />
      )}
    </div>
  );
});
