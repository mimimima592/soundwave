import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/store/player';
import { useListenPartyStore } from '@/store/listenParty';

export function useListenPartySync() {
  const role   = useListenPartyStore((s) => s.role);
  const status = useListenPartyStore((s) => s.status);

  // Лидер активен когда hosting (ждём) или connected (есть слушатели)
  const isActive = role === 'leader' && (status === 'hosting' || status === 'connected');

  // ── PLAY / PAUSE ──────────────────────────────────────────────────────────
  const prevPlayingRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isActive) { prevPlayingRef.current = null; return; }

    return usePlayerStore.subscribe((state) => {
      const { isPlaying, currentTime } = state;
      if (prevPlayingRef.current === null) { prevPlayingRef.current = isPlaying; return; }
      if (prevPlayingRef.current === isPlaying) return;
      prevPlayingRef.current = isPlaying;
      useListenPartyStore.getState().broadcastEvent({
        type: isPlaying ? 'PLAY' : 'PAUSE',
        position: currentTime,
      });
    });
  }, [isActive]);

  // ── SEEK ──────────────────────────────────────────────────────────────────
  const prevTimeRef     = useRef<number>(0);
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isActive) { prevTimeRef.current = 0; return; }

    return usePlayerStore.subscribe((state, prevState) => {
      const currentTime = state.currentTime;
      const prev = prevTimeRef.current;
      const delta = Math.abs(currentTime - prev);
      const isPlaying = state.isPlaying;
      // Уменьшили порог с 1.5 до 0.8 сек для детекции малых перемоток
      // Убрали isNatural проверку для более точной детекции seek
      if (delta > 0.8) {
        if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
        // Уменьшили debounce с 150 до 50ms для быстрой реакции
        seekDebounceRef.current = setTimeout(() => {
          useListenPartyStore.getState().broadcastEvent({
            type: 'SEEK',
            position: currentTime,
          });
        }, 50);
      }
      prevTimeRef.current = currentTime;
    });
  }, [isActive]);

  // ── TRACK ─────────────────────────────────────────────────────────────────
  const prevTrackRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isActive) { prevTrackRef.current = null; return; }

    return usePlayerStore.subscribe((state) => {
      const { currentTrack, queue, queueIndex, currentTime } = state;
      if (!currentTrack) return;
      if (prevTrackRef.current === currentTrack.id) return;
      prevTrackRef.current = currentTrack.id;
      useListenPartyStore.getState().broadcastEvent({
        type: 'TRACK',
        trackData: currentTrack,
        queue,
        queueIndex,
        position: currentTime,
      });
    });
  }, [isActive]);
}
