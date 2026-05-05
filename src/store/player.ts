import { create } from 'zustand';
import type { SCTrack } from '@/types/soundcloud';
import { scAPI } from '@/api/soundcloud';
import { useHistoryStore } from '@/store/history';
import { waveManager } from '@/managers/waveManager';

// Экспоненциальная кривая громкости (audio taper).
// Слайдер 0..1 → audioEl.volume 0..1, но нарастание перцептивно равномерное.
// Формула: (e^(k*v) - 1) / (e^k - 1), k=4
// При v=0 → 0, v=0.1 → ~0.05, v=0.5 → ~0.27, v=1 → 1.0
function toAudioVolume(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  const k = 4;
  return (Math.exp(k * v) - 1) / (Math.exp(k) - 1);
}

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  // Текущий трек и состояние
  currentTrack: SCTrack | null;
  streamUrl: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  isRefreshingStream: boolean; // Обновление URL после истечения срока
  currentTime: number; // секунды
  duration: number;    // секунды
  volume: number;      // 0..1
  muted: boolean;

  // Текущий плейлист (id или urn) — для отображения паузы на нужной карточке
  currentPlaylistId: number | string | null;

  // Очередь воспроизведения
  queue: SCTrack[];
  queueIndex: number;
  shuffle: boolean;
  shuffleHistory: number[]; // индексы треков для корректной навигации назад при шаффле
  repeat: RepeatMode;
  autoplay: boolean;
  isWaveMode: boolean; // Wave mode active - block native autoplay

  // Ссылка на HTMLAudioElement (управляется хуком useAudio)
  audioEl: HTMLAudioElement | null;

  // Отложенный seek — применяется как только аудио готово (canplay)
  pendingSeek: number | null;

  // Таймаут для отправки истории прослушивания
  playHistoryTimeout: NodeJS.Timeout | null;

  // Защита от race condition при быстром переключении треков
  currentPlayTrackId: number | null;

  // Actions
  setAudioEl: (el: HTMLAudioElement | null) => void;
  playTrack: (track: SCTrack, queue?: SCTrack[], index?: number, playlistId?: number | string | null) => Promise<void>;
  playPlaylist: (params: { id?: number; urn?: string }) => Promise<void>;
  setQueue: (queue: SCTrack[]) => void;
  setCurrentTrack: (track: SCTrack) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  refreshStreamUrl: () => Promise<void>; // Обновить URL стрима после истечения срока
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleAutoplay: () => void;
  addToQueue: (track: SCTrack) => void;
  removeFromQueue: (index: number) => void;
  setWaveMode: (active: boolean) => void;

  setCurrentPlaylistId: (id: number | string | null) => void;

  // Внутренние обновления из <audio> событий
  _updateTime: (t: number) => void;
  _updateDuration: (d: number) => void;
  _setPlayingState: (playing: boolean) => void;
  _onEnded: () => void;

  // Пагинированная очередь: callback для подгрузки следующей страницы
  // Страница регистрирует его при вызове playTrack. Если очередь исчерпана —
  // player сначала вызывает этот loader, а не прыгает сразу на autoplay SC.
  queueLoader: (() => Promise<SCTrack[]>) | null;
  setQueueLoader: (loader: (() => Promise<SCTrack[]>) | null) => void;

  // Hydration
  hydrate: () => Promise<void>;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  streamUrl: null,
  isPlaying: false,
  isLoading: false,
  isRefreshingStream: false,
  currentTime: 0,
  duration: 0,
  volume: 0.7,
  muted: false,
  currentPlaylistId: null,
  queue: [],
  queueIndex: 0,
  audioEl: null,
  shuffle: false,
  shuffleHistory: [],
  repeat: 'off',
  autoplay: true, // default enabled
  isWaveMode: false,
  pendingSeek: null,
  playHistoryTimeout: null,
  currentPlayTrackId: null,
  queueLoader: null,

  setAudioEl: (el) => {
    set({ audioEl: el });
    if (el) {
      el.volume = toAudioVolume(get().volume);
      el.muted = get().muted;
    }
  },

  setQueue: (queue) => set({ queue, queueIndex: 0 }),

  setCurrentTrack: (track) => set({ currentTrack: track }),

  playPlaylist: async ({ id, urn }) => {
    if (!id && !urn) return;

    set({ currentPlaylistId: urn ?? id ?? null });

    let rawTracks: any[] = [];

    try {
      if (urn) {
        const systemPlaylist = await scAPI.getSystemPlaylist(urn);
        rawTracks = systemPlaylist.tracks || [];
      } else if (id) {
        const playlistData = await scAPI.getPlaylist(id);
        rawTracks = playlistData.tracks || [];
      }
    } catch (err) {
      console.error('[playPlaylist] Ошибка загрузки плейлиста:', err);
      return;
    }

    if (rawTracks.length === 0) return;

    const { audioEl, playHistoryTimeout } = get();
    if (!audioEl) return;
    if (playHistoryTimeout) clearTimeout(playHistoryTimeout);

    // Первый трек гидрируем и получаем stream URL параллельно
    const firstRaw = rawTracks[0];
    const firstNeedsHydration = !firstRaw?.title;

    let firstTrack: SCTrack;
    try {
      if (firstNeedsHydration) {
        // Гидрация первого трека и stream URL — параллельно
        const [hydrated] = await scAPI.getTracks([firstRaw.id]);
        firstTrack = hydrated ?? firstRaw;
      } else {
        firstTrack = firstRaw as SCTrack;
      }
    } catch (err) {
      console.error('[playPlaylist] Ошибка гидрации первого трека:', err);
      return;
    }

    // Сразу ставим первый трек и начинаем воспроизведение
    set({ queue: [firstTrack], queueIndex: 0, currentTrack: firstTrack, isLoading: true });

    try {
      const { url } = await scAPI.getStreamUrl(firstTrack);
      audioEl.src = url;
      set({ streamUrl: url, isLoading: false });
      await audioEl.play();
      set({ isPlaying: true });
    } catch (err) {
      console.error('[playPlaylist] Ошибка воспроизведения:', err);
      set({ isPlaying: false, isLoading: false });
      return;
    }

    // История прослушивания
    const recentHistory = localStorage.getItem('recentlyPlayed');
    const recentIds: number[] = recentHistory ? JSON.parse(recentHistory) : [];
    if (!recentIds.includes(firstTrack.id)) {
      localStorage.setItem('recentlyPlayed', JSON.stringify([firstTrack.id, ...recentIds].slice(0, 50)));
    }
    set({ playHistoryTimeout: null });

    // Гидрируем остальные треки в фоне и добавляем в очередь
    const restRaw = rawTracks.slice(1, 50);
    const restNeedIds = restRaw.filter((t: any) => !t?.title).map((t: any) => t.id).filter(Boolean) as number[];
    try {
      let fullMap = new Map<number, SCTrack>();
      if (restNeedIds.length > 0) {
        const hydrated = await scAPI.getTracks(restNeedIds);
        hydrated.forEach(t => { if (t) fullMap.set(t.id, t); });
      }
      const restTracks = restRaw.map((t: any) => fullMap.get(t.id) ?? t).filter((t: any) => t?.title) as SCTrack[];
      // Обновляем очередь не прерывая воспроизведение
      set({ queue: [firstTrack, ...restTracks] });
    } catch (err) {
      console.error('[playPlaylist] Ошибка фоновой гидрации:', err);
    }
  },

  playTrack: async (track, queue, index, playlistId = null) => {
    const { audioEl, playHistoryTimeout, currentTrack } = get();
    if (!audioEl) return;

    // Очищаем предыдущий таймаут
    if (playHistoryTimeout) {
      clearTimeout(playHistoryTimeout);
    }

    const playId = track.id;
    set({ currentPlayTrackId: playId, isLoading: true, currentTrack: track, playHistoryTimeout: null });

    // Сбрасываем плейлист — играет отдельный трек (если не передан playlistId)
    set({ currentPlaylistId: playlistId });

    try {
      const { url, isHls } = await scAPI.getStreamUrl(track);

      // Проверяем что это всё ещё актуальный трек
      if (get().currentPlayTrackId !== playId) return;

      if (isHls) {
        // SoundCloud часто отдаёт HLS. Для MVP ограничиваемся
        // progressive-транскодингами; интеграция hls.js — на расширение.
        console.warn('[Player] HLS стрим не поддерживается в MVP, пытаемся загрузить напрямую');
      }

      audioEl.src = url;

      // Обновляем очередь если передали новую
      if (queue && typeof index === 'number') {
        set({ queue, queueIndex: index });
        // Сбрасываем пагинационный loader если это новая очередь
        // (loader должен быть установлен страницей через setQueueLoader отдельно)
        if (index === 0) set({ queueLoader: null });
      } else if (!queue) {
        // Трек без контекста очереди — помещаем его как единственный элемент
        set({ queue: [track], queueIndex: 0 });
      }

      set({ streamUrl: url });
      try {
        await audioEl.play();
        set({ isPlaying: true });
      } catch (err) {
        console.error('[Player] Ошибка воспроизведения:', err);
        set({ isPlaying: false, isLoading: false });
      }

      // Локальная история
      useHistoryStore.getState().addEntry(track);

      set({ playHistoryTimeout: null });
    } catch (err) {
      console.error('[Player] Ошибка воспроизведения:', err);
      set({ isPlaying: false, isLoading: false });
    }
  },

  togglePlay: () => {
    const { audioEl, isPlaying } = get();
    if (!audioEl || !get().currentTrack) return;
    if (isPlaying) audioEl.pause();
    else audioEl.play().catch(console.error);
  },

  pause: () => get().audioEl?.pause(),
  resume: () => get().audioEl?.play().catch(console.error),

  refreshStreamUrl: async () => {
    const { audioEl, currentTrack, currentTime } = get();
    if (!audioEl || !currentTrack) return;

    set({ isRefreshingStream: true });

    try {
      // Сохраняем текущую позицию
      const savedTime = audioEl.currentTime;

      // Получаем новый URL
      const { url, isHls } = await scAPI.getStreamUrl(currentTrack);

      if (isHls) {
        console.warn('[Player] HLS стрим не поддерживается при обновлении');
      }

      audioEl.src = url;
      set({ streamUrl: url });

      // Загружаем новый источник перед воспроизведением
      await audioEl.load();

      // Восстанавливаем позицию
      audioEl.currentTime = savedTime;

      // Воспроизводим
      await audioEl.play();
    } catch (err) {
      console.error('[Player] Ошибка обновления стрима:', err);
      set({ isPlaying: false });
    } finally {
      set({ isRefreshingStream: false });
    }
  },

  next: async () => {
    const { queue, queueIndex, shuffle, repeat, playTrack, autoplay, currentTrack, isWaveMode } = get();
    if (queue.length === 0) return;

    let nextIndex: number;

    if (shuffle) {
      // Записываем текущий индекс в историю — создаём новый массив чтобы Zustand увидел изменение
      const newHistory = [...get().shuffleHistory, queueIndex];
      set({ shuffleHistory: newHistory });
      // Избегаем повтора текущего трека при достаточной очереди
      if (queue.length === 1) nextIndex = 0;
      else {
        do {
          nextIndex = Math.floor(Math.random() * queue.length);
        } while (nextIndex === queueIndex);
      }
    } else {
      nextIndex = queueIndex + 1;
      if (nextIndex >= queue.length) {
        if (repeat === 'all') {
          nextIndex = 0;
        } else if (isWaveMode) {
          // Wave mode: waveManager двигает свой currentIndex и возвращает трек.
          // Если треков нет — запускает deepScan и ждёт.
          const nextWaveTrack = await waveManager.getNextTrack();
          if (nextWaveTrack) {
            // Передаём полную очередь волны в player чтобы UI был в синке.
            // currentIndex в waveManager уже инкрементирован — берём queue как есть.
            const ws = waveManager.getCurrentState();
            playTrack(nextWaveTrack, ws.queue, ws.currentIndex - 1);
          }
          return;
        } else if (autoplay && currentTrack) {
          // Сначала пробуем подгрузить следующую страницу пагинации
          const loader = get().queueLoader;
          if (loader) {
            try {
              const moreTracks = await loader();
              if (moreTracks.length > 0) {
                const newQueue = [...get().queue, ...moreTracks];
                const newIndex = get().queueIndex + 1;
                set({ queue: newQueue });
                playTrack(newQueue[newIndex], newQueue, newIndex);
                return;
              }
            } catch (err) {
              console.error('[QueueLoader] Ошибка подгрузки:', err);
            }
          }
          // Обычный autoplay: загружаем похожие треки
          try {
            const related = await scAPI.getRelatedTracks(currentTrack.id, 10);
            if (related.collection.length > 0) {
              const newQueue = [...queue, ...related.collection];
              playTrack(newQueue[queueIndex + 1], newQueue, queueIndex + 1);
              return;
            }
          } catch (err) {
            console.error('[Autoplay] Ошибка загрузки похожих треков:', err);
          }
          return; // конец очереди
        } else {
          return; // конец очереди (или Wave mode - let WaveManager handle refueling)
        }
      }
    }

    playTrack(queue[nextIndex], queue, nextIndex);
  },

  previous: () => {
    const { audioEl, currentTime, queue, queueIndex, shuffle, shuffleHistory, playTrack } = get();

    if (shuffle && shuffleHistory.length > 0) {
      // В режиме шаффла возвращаемся по истории
      const newHistory = [...shuffleHistory];
      const prevIndex = newHistory.pop();
      set({ shuffleHistory: newHistory });
      if (prevIndex !== undefined && queue[prevIndex]) {
        playTrack(queue[prevIndex], queue, prevIndex);
      }
      return;
    }

    const prevIndex = queueIndex - 1;
    if (prevIndex >= 0 && queue[prevIndex]) {
      // Есть предыдущий трек — переходим на него
      playTrack(queue[prevIndex], queue, prevIndex);
    } else if (audioEl) {
      // Нет предыдущего трека (начало очереди) — перематываем в начало текущего
      audioEl.currentTime = 0;
    }
  },

  seek: (seconds) => {
    const { audioEl } = get();
    if (audioEl) audioEl.currentTime = seconds;
  },

  setVolume: (volume) => {
    const { audioEl } = get();
    const v = Math.max(0, Math.min(1, volume));
    if (audioEl) audioEl.volume = toAudioVolume(v);
    set({ volume: v, muted: v === 0 });
    window.electron?.settings.set('volume', v);
  },

  toggleMute: () => {
    const { audioEl, muted, volume } = get();
    const newMuted = !muted;
    if (audioEl) audioEl.volume = newMuted ? 0 : toAudioVolume(volume);
    set({ muted: newMuted });
  },

  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle, shuffleHistory: [] })),

  cycleRepeat: () =>
    set((s) => ({
      repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
    })),

  toggleAutoplay: () => set((s) => ({ autoplay: !s.autoplay })),

  setWaveMode: (active) => set({ isWaveMode: active }),

  addToQueue: (track) =>
    set((s) => ({ queue: [...s.queue, track] })),

  removeFromQueue: (index) => {
    const { queue, queueIndex } = get();
    // Нельзя удалять текущий трек
    if (index === queueIndex) return;
    const newQueue = queue.filter((_, i) => i !== index);
    // Если удаляем трек ДО текущего — индекс сдвигается на 1
    const newIndex = index < queueIndex ? queueIndex - 1 : queueIndex;
    // Пересчитываем shuffleHistory — убираем удалённый индекс и сдвигаем остальные
    const newShuffleHistory = get().shuffleHistory
      .filter(i => i !== index)
      .map(i => i > index ? i - 1 : i);
    set({ queue: newQueue, queueIndex: newIndex, shuffleHistory: newShuffleHistory });
  },

  setQueueLoader: (loader) => set({ queueLoader: loader }),

  setCurrentPlaylistId: (id) => set({ currentPlaylistId: id }),

  _updateTime: (t) => set({ currentTime: t }),
  _updateDuration: (d) => set({ duration: d, isLoading: false }),
  _setPlayingState: (playing) => set({ isPlaying: playing }),

  _onEnded: async () => {
    const { repeat, audioEl, next, queue, queueIndex, autoplay, currentTrack, playTrack, addToQueue, isWaveMode } = get();

    if (repeat === 'one' && audioEl) {
      audioEl.currentTime = 0;
      audioEl.play().catch(console.error);
      return;
    }

    // Wave mode: всегда берём следующий трек из waveManager
    if (isWaveMode) {
      next(); // next() сам вызовет waveManager.getNextTrack()
      return;
    }

    // Обычный autoplay на последнем треке очереди
    if (autoplay && queueIndex === queue.length - 1 && currentTrack) {
      // Сначала пробуем подгрузить следующую страницу пагинации
      const loader = get().queueLoader;
      if (loader) {
        try {
          const moreTracks = await loader();
          if (moreTracks.length > 0) {
            const newQueue = [...queue, ...moreTracks];
            const newIndex = queueIndex + 1;
            set({ queue: newQueue });
            playTrack(newQueue[newIndex], newQueue, newIndex);
            return;
          }
        } catch (err) {
          console.error('[QueueLoader] Ошибка подгрузки в _onEnded:', err);
        }
      }
      try {
        const related = await scAPI.getRelatedTracks(currentTrack.id, 10);
        if (related.collection.length > 0) {
          related.collection
            .filter((track) => track && typeof track.id === 'number' && track.title)
            .forEach(track => addToQueue(track as SCTrack));
          next();
          return;
        }
      } catch (err) {
        console.error('[Autoplay] Ошибка:', err);
      }
      return;
    }

    next();
  },

  hydrate: async () => {
    if (!window.electron) {
      // Работаем в браузере без Electron — пропускаем
      return;
    }

    const volume = await window.electron.settings.get('volume') as number | undefined;
    if (typeof volume === 'number' && volume >= 0 && volume <= 1) {
      const { audioEl } = get();
      set({ volume });
      if (audioEl) {
        audioEl.volume = toAudioVolume(volume);
      }
    }
  },
}));
