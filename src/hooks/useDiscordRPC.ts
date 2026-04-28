import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '@/store/player';
import { useUIStore } from '@/store/ui';
import { hiResArtwork } from '@/utils/format';

/**
 * Отправляет данные о текущем треке в Discord RPC.
 * currentTime читается через getState() в момент отправки —
 * не подписываемся на него как React state чтобы не вызывать
 * ре-рендер хука на каждый timeupdate.
 */
export function useDiscordRPC() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying    = usePlayerStore((s) => s.isPlaying);
  const duration     = usePlayerStore((s) => s.duration);
  const rpcEnabled   = useUIStore((s) => s.discordRpcEnabled);

  const lastUpdateRef  = useRef<number>(0);
  const pendingRef     = useRef<boolean>(false);
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendUpdate = useCallback(() => {
    if (!window.electron?.rpc) return;
    if (!rpcEnabled || !currentTrack) {
      window.electron.rpc.clear();
      return;
    }

    // Читаем currentTime в момент отправки — не через React state
    const currentTime = usePlayerStore.getState().currentTime;

    if (!isPlaying) {
      window.electron.rpc.update({
        title:    currentTrack.title,
        artist:   currentTrack.user.username,
        artwork:  hiResArtwork(currentTrack.artwork_url),
        duration: Math.floor(duration || currentTrack.duration / 1000),
        isPlaying: false,
        trackUrl: currentTrack.permalink_url,
      }).catch(() => {});
      return;
    }

    const startedAt = Date.now() - Math.floor(currentTime * 1000);
    window.electron.rpc.update({
      title:     currentTrack.title,
      artist:    currentTrack.user.username,
      artwork:   hiResArtwork(currentTrack.artwork_url),
      duration:  Math.floor(duration || currentTrack.duration / 1000),
      startedAt,
      isPlaying: true,
      trackUrl:  currentTrack.permalink_url,
    }).catch(() => {});

    lastUpdateRef.current = Date.now();
    pendingRef.current = false;
  }, [currentTrack, isPlaying, duration, rpcEnabled]);

  // Срабатывает только при смене трека / play/pause / duration / настройках RPC
  // НЕ при каждом timeupdate
  useEffect(() => {
    if (!window.electron?.rpc) return;

    if (!rpcEnabled || !currentTrack) {
      window.electron.rpc.clear();
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      return;
    }

    const now = Date.now();
    const timeSince = now - lastUpdateRef.current;

    if (timeSince >= 2500) {
      sendUpdate();
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingRef.current = true;
      timerRef.current = setTimeout(() => {
        if (pendingRef.current) sendUpdate();
      }, 2500 - timeSince);
    }

    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [currentTrack, isPlaying, duration, rpcEnabled, sendUpdate]);
}
