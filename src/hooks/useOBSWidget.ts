import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { hiResArtwork } from '@/utils/format';

/**
 * Sends current track data to the OBS widget HTTP server.
 * currentTime читается через getState() и store.subscribe —
 * не подписываемся на него как React state чтобы не вызывать
 * ре-рендер хука на каждый timeupdate.
 */
export function useOBSWidget() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying    = usePlayerStore((s) => s.isPlaying);
  const duration     = usePlayerStore((s) => s.duration);

  const widgetEnabled        = useUIStore((s) => s.obsWidgetEnabled);
  const widgetOverlayOpacity = useUIStore((s) => s.widgetOverlayOpacity);
  const widgetBgBlur         = useUIStore((s) => s.widgetBgBlur);
  const widgetAccentColor    = useUIStore((s) => s.widgetAccentColor);
  const widgetBgType         = useUIStore((s) => s.widgetBgType);
  const bgType               = useUIStore((s) => s.backgroundType);
  const bgUrl                = useUIStore((s) => s.backgroundUrl);

  const lastSentTimeRef = useRef<number>(-1);

  const hexToRgb = (hex: string) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  };

  const buildPayload = useCallback((currentTime: number) => {
    return {
      title:          currentTrack?.title ?? '',
      artist:         currentTrack?.user?.username ?? '',
      artwork:        hiResArtwork(currentTrack?.artwork_url ?? '') || null,
      currentTime,
      duration:       duration || (currentTrack ? currentTrack.duration / 1000 : 0),
      isPlaying,
      accentColor:    hexToRgb(widgetAccentColor),
      bgUrl:          bgType === 'gif' ? bgUrl : '',
      overlayOpacity: widgetOverlayOpacity,
      bgBlur:         widgetBgBlur,
      bgType:         widgetBgType,
    };
  }, [currentTrack, isPlaying, duration, widgetAccentColor, bgType, bgUrl, widgetOverlayOpacity, widgetBgBlur, widgetBgType]);

  const sendEmpty = useCallback(() => {
    if (!window.electron?.widget) return;
    window.electron.widget.update({
      title: '', artist: '', artwork: null,
      currentTime: 0, duration: 0, isPlaying: false,
      accentColor: '255, 85, 0', bgUrl: '', overlayOpacity: 0.6, bgBlur: 40, bgType: 'artwork',
    });
  }, []);

  // Срабатывает при смене трека / play/pause / настроек виджета
  // НЕ при каждом timeupdate
  useEffect(() => {
    if (!window.electron?.widget) return;
    if (!widgetEnabled || !currentTrack) { sendEmpty(); return; }
    const currentTime = usePlayerStore.getState().currentTime;
    window.electron.widget.update(buildPayload(currentTime));
    lastSentTimeRef.current = currentTime;
  }, [currentTrack, isPlaying, widgetEnabled, widgetAccentColor, bgType, bgUrl,
      widgetOverlayOpacity, widgetBgBlur, widgetBgType, buildPayload, sendEmpty]);

  // Прогресс времени — через store.subscribe, не через React state
  // Это позволяет обновлять виджет каждые 0.5с без ре-рендера компонента
  useEffect(() => {
    if (!window.electron?.widget) return;

    const unsubscribe = usePlayerStore.subscribe(
      (state) => state.currentTime,
      (currentTime) => {
        if (!widgetEnabled || !currentTrack || !isPlaying) return;
        if (Math.abs(currentTime - lastSentTimeRef.current) >= 0.5) {
          window.electron!.widget.update(buildPayload(currentTime));
          lastSentTimeRef.current = currentTime;
        }
      }
    );

    return unsubscribe;
  }, [widgetEnabled, currentTrack, isPlaying, buildPayload]);
}
