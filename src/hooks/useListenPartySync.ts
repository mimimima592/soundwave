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
  // Детектируем только ручные перемотки, а не естественный ход воспроизведения.
  // При обычном воспроизведении currentTime растёт ~1 сек/сек, поэтому порог
  // должен быть значительно больше ожидаемого дрейфа между тиками стора.
  const prevTimeRef     = useRef<number>(0);
  const prevPlayingRef2 = useRef<boolean>(false);
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isActive) { prevTimeRef.current = 0; return; }

    return usePlayerStore.subscribe((state) => {
      const currentTime = state.currentTime;
      const isPlaying   = state.isPlaying;
      const prev        = prevTimeRef.current;
      const delta       = currentTime - prev; // знак важен: назад — отрицательный

      // Естественное воспроизведение: 0 < delta < 2.5 сек (с запасом на нерегулярность тиков)
      // Считаем seek: прыжок назад ИЛИ прыжок вперёд > 2.5 сек
      const isNaturalProgress = isPlaying && delta >= 0 && delta < 2.5;

      if (!isNaturalProgress && Math.abs(delta) > 1.0) {
        if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
        seekDebounceRef.current = setTimeout(() => {
          useListenPartyStore.getState().broadcastEvent({
            type: 'SEEK',
            position: currentTime,
          });
        }, 200); // debounce 200ms — даём время завершить drag по прогресс-бару
      }

      prevTimeRef.current   = currentTime;
      prevPlayingRef2.current = isPlaying;
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
