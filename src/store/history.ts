import { create } from 'zustand';
import { SCTrack } from '@/types/soundcloud';

const MAX_LOCAL = 200; // максимум записей в локальной истории
const STORAGE_KEY = 'soundwave_local_history';

export interface HistoryEntry {
  track: SCTrack;
  playedAt: number; // Unix timestamp ms
}

interface HistoryState {
  entries: HistoryEntry[];
  // Добавить трек в начало истории
  addEntry: (track: SCTrack) => void;
  // Очистить локальную историю
  clear: () => void;
  // Инициализация из localStorage
  init: () => void;
}

function save(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_LOCAL)));
  } catch {}
}

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],

  init: () => {
    const entries = load();
    set({ entries });
  },

  addEntry: (track: SCTrack) => {
    const prev = get().entries;

    // Убираем дубликат этого трека если он уже есть — он встанет первым
    const filtered = prev.filter(e => e.track.id !== track.id);

    const updated = [
      { track, playedAt: Date.now() },
      ...filtered,
    ].slice(0, MAX_LOCAL);

    set({ entries: updated });
    save(updated);
  },

  clear: () => {
    set({ entries: [] });
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  },
}));
