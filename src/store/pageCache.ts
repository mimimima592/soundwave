import { create } from 'zustand';

type CacheEntry<T> = {
  data: T;
  updatedAt: number;
};

type CacheMap = Record<string, CacheEntry<unknown>>;

interface PageCacheState {
  cache: CacheMap;
  setPageCache: <T>(key: string, data: T) => void;
  getPageCache: <T>(key: string, maxAgeMs?: number) => T | null;
  clearPageCache: (key?: string) => void;
}

export const usePageCacheStore = create<PageCacheState>((set, get) => ({
  cache: {},

  setPageCache: (key, data) => {
    set((state) => ({
      cache: {
        ...state.cache,
        [key]: {
          data,
          updatedAt: Date.now(),
        },
      },
    }));
  },

  getPageCache: <T>(key: string, maxAgeMs?: number) => {
    const entry = get().cache[key];
    if (!entry) return null;

    if (typeof maxAgeMs === 'number' && Date.now() - entry.updatedAt > maxAgeMs) {
      return null;
    }

    return entry.data as T;
  },

  clearPageCache: (key) => {
    if (!key) {
      set({ cache: {} });
      return;
    }

    set((state) => {
      if (!(key in state.cache)) return state;
      const nextCache = { ...state.cache };
      delete nextCache[key];
      return { cache: nextCache };
    });
  },
}));
