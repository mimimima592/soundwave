import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/store/player';

/**
 * Создаёт глобальный <audio> элемент и подключает его к player store.
 * Вешается на App один раз.
 */
export function useAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const setAudioEl      = usePlayerStore((s) => s.setAudioEl);
  const _updateTime     = usePlayerStore((s) => s._updateTime);
  const _updateDuration = usePlayerStore((s) => s._updateDuration);
  const _onEnded        = usePlayerStore((s) => s._onEnded);
  const _setPlayingState = usePlayerStore((s) => s._setPlayingState);
  const refreshStreamUrl = usePlayerStore((s) => s.refreshStreamUrl);

  // Refs на актуальные значения стора — чтобы closures в addEventListener
  // всегда видели свежие данные без пересоздания слушателей
  const storeRef = useRef({
    currentTrack:  usePlayerStore.getState().currentTrack,
    isPlaying:     usePlayerStore.getState().isPlaying,
    refreshStreamUrl,
  });
  useEffect(() => {
    return usePlayerStore.subscribe((state) => {
      storeRef.current.currentTrack  = state.currentTrack;
      storeRef.current.isPlaying     = state.isPlaying;
      storeRef.current.refreshStreamUrl = state.refreshStreamUrl;
    });
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;
    setAudioEl(audio);

    let lastTimeUpdateMs = 0;
    let winFocused = document.hasFocus();
    const onWinFocus = () => { winFocused = true; };
    const onWinBlur  = () => { winFocused = false; };
    window.addEventListener('focus', onWinFocus);
    window.addEventListener('blur',  onWinBlur);

    const onTimeUpdate = () => {
      const now = performance.now();
      const minMs = winFocused ? 0 : 800;
      if (now - lastTimeUpdateMs >= minMs) {
        lastTimeUpdateMs = now;
        _updateTime(audio.currentTime);
      }
    };

    const onLoadedMetadata = () => _updateDuration(audio.duration);
    const onPlay  = () => _setPlayingState(true);
    const onPause = () => _setPlayingState(false);
    const onEnded = () => _onEnded();

    // canplay — снимаем isLoading как только браузер готов играть,
    // не ждём полной загрузки (loadeddata)
    const onCanPlay = () => {
      usePlayerStore.setState({ isLoading: false });

      // Применяем отложенный seek если был (пользователь кликнул по
      // таймлайну пока грузился src)
      const pending = usePlayerStore.getState().pendingSeek;
      if (pending !== null && Number.isFinite(pending)) {
        audio.currentTime = pending;
        usePlayerStore.setState({ pendingSeek: null });
      } else if (pending !== null) {
        usePlayerStore.setState({ pendingSeek: null });
      }
    };

    const onError = async (e: Event) => {
      const error = (e.target as HTMLAudioElement).error;
      console.error('[Audio] error:', error?.code, error?.message);

      const { currentTrack, isPlaying } = storeRef.current;
      if (error && currentTrack && isPlaying) {
        // MEDIA_ERR_SRC_NOT_SUPPORTED = 4, MEDIA_ERR_NETWORK = 2, MEDIA_ERR_DECODE = 3
        if (error.code === 2 || error.code === 3 || error.code === 4) {
          console.log('[Audio] Stream error, refreshing URL...');
          await storeRef.current.refreshStreamUrl();
        }
      }
    };

    // stalled — аудио зависло при загрузке (CDN timeout, протухший URL)
    let stalledTimer: ReturnType<typeof setTimeout> | null = null;
    const onStalled = () => {
      // Даём 3 секунды — иногда stalled кратковременный и сам проходит
      stalledTimer = setTimeout(async () => {
        const { currentTrack, isPlaying } = storeRef.current;
        if (currentTrack && isPlaying && audio.readyState < 3) {
          console.warn('[Audio] Stalled too long, refreshing stream URL...');
          await storeRef.current.refreshStreamUrl();
        }
      }, 3000);
    };
    const onPlaying = () => {
      // Если stall прошёл сам — отменяем таймер
      if (stalledTimer) { clearTimeout(stalledTimer); stalledTimer = null; }
    };

    audio.addEventListener('timeupdate',     onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('canplay',        onCanPlay);
    audio.addEventListener('play',           onPlay);
    audio.addEventListener('pause',          onPause);
    audio.addEventListener('ended',          onEnded);
    audio.addEventListener('error',          onError);
    audio.addEventListener('stalled',        onStalled);
    audio.addEventListener('playing',        onPlaying);

    return () => {
      window.removeEventListener('focus', onWinFocus);
      window.removeEventListener('blur',  onWinBlur);
      if (stalledTimer) clearTimeout(stalledTimer);
      audio.removeEventListener('timeupdate',     onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('canplay',        onCanPlay);
      audio.removeEventListener('play',           onPlay);
      audio.removeEventListener('pause',          onPause);
      audio.removeEventListener('ended',          onEnded);
      audio.removeEventListener('error',          onError);
      audio.removeEventListener('stalled',        onStalled);
      audio.removeEventListener('playing',        onPlaying);
      audio.pause();
      audio.src = '';
      setAudioEl(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
