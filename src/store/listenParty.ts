import { create } from 'zustand';

export type PartyRole = 'leader' | 'listener';
export type PartyStatus = 'idle' | 'hosting' | 'joining' | 'connected' | 'disconnected';

export interface PartyEvent {
  type: 'PLAY' | 'PAUSE' | 'SEEK' | 'TRACK' | 'HEARTBEAT' | 'SUGGEST' | 'LISTENER_JOIN' | 'LISTENER_LEAVE';
  trackId?: number;
  trackData?: any;
  queue?: any[];
  queueIndex?: number;
  position?: number;
  // Для SUGGEST
  suggestTrack?: any;
  suggestFrom?: string;   // имя слушателя
  suggestId?: string;     // уникальный ID предложения
  // Для LISTENER_JOIN/LEAVE
  listenerName?: string;
  listenerId?: string;
  timestamp: number;
}

export interface ConnectedListener {
  id: string;        // peer connection ID
  name: string;      // отображаемое имя
  connectedAt: number;
  conn: any;         // DataConnection
}

export interface TrackSuggestion {
  id: string;
  track: any;
  fromName: string;
  fromId: string;
  timestamp: number;
}

const MAX_LISTENERS = 4; // лидер + 4 = 5 человек

interface ListenPartyState {
  status: PartyStatus;
  role: PartyRole | null;
  sessionCode: string | null;
  peerId: string | null;
  peerInstance: any | null;
  connectionInstance: any | null;  // для слушателя — единственный коннект к лидеру
  dataChannel: any | null;
  connectedSince: number | null;

  // Многопользовательское
  listeners: ConnectedListener[];          // только у лидера
  listenerCount: number;                   // у слушателя — сколько всего в сессии
  suggestions: TrackSuggestion[];          // у лидера — предложения треков
  myListenerName: string;                  // имя этого пользователя

  // Actions
  setStatus: (s: PartyStatus) => void;
  setRole: (r: PartyRole | null) => void;
  setSessionCode: (code: string | null) => void;
  setPeerId: (id: string | null) => void;
  setPeerInstance: (p: any) => void;
  setConnectionInstance: (c: any) => void;
  setDataChannel: (c: any) => void;
  setConnectedSince: (t: number | null) => void;
  setMyListenerName: (name: string) => void;

  addListener: (l: ConnectedListener) => void;
  removeListener: (id: string) => void;
  setListenerCount: (n: number) => void;

  addSuggestion: (s: TrackSuggestion) => void;
  removeSuggestion: (id: string) => void;

  // Отправить событие всем (лидер) или лидеру (слушатель)
  sendEvent: (evt: Omit<PartyEvent, 'timestamp'>) => void;
  broadcastEvent: (evt: Omit<PartyEvent, 'timestamp'>) => void;

  reset: () => void;
}

export const useListenPartyStore = create<ListenPartyState>((set, get) => ({
  status: 'idle',
  role: null,
  sessionCode: null,
  peerId: null,
  peerInstance: null,
  connectionInstance: null,
  dataChannel: null,
  connectedSince: null,
  listeners: [],
  listenerCount: 0,
  suggestions: [],
  myListenerName: 'Слушатель',

  setStatus: (status) => set({ status }),
  setRole: (role) => set({ role }),
  setSessionCode: (sessionCode) => set({ sessionCode }),
  setPeerId: (peerId) => set({ peerId }),
  setPeerInstance: (peerInstance) => set({ peerInstance }),
  setConnectionInstance: (connectionInstance) => set({ connectionInstance }),
  setDataChannel: (dataChannel) => set({ dataChannel }),
  setConnectedSince: (connectedSince) => set({ connectedSince }),
  setMyListenerName: (myListenerName) => {
    set({ myListenerName });
    localStorage.setItem('partyListenerName', myListenerName);
  },

  addListener: (l) => set((s) => ({ listeners: [...s.listeners, l] })),
  removeListener: (id) => set((s) => ({ listeners: s.listeners.filter((l) => l.id !== id) })),
  setListenerCount: (listenerCount) => set({ listenerCount }),

  addSuggestion: (suggestion) => set((s) => ({ suggestions: [suggestion, ...s.suggestions].slice(0, 20) })),
  removeSuggestion: (id) => set((s) => ({ suggestions: s.suggestions.filter((s) => s.id !== id) })),

  // Слушатель → лидеру
  sendEvent: (evt) => {
    const { dataChannel } = get();
    if (!dataChannel) return;
    try { dataChannel.send(JSON.stringify({ ...evt, timestamp: Date.now() })); } catch (e) {
      console.error('[ListenParty] sendEvent error:', e);
    }
  },

  // Лидер → всем слушателям
  broadcastEvent: (evt) => {
    const { listeners } = get();
    const msg = JSON.stringify({ ...evt, timestamp: Date.now() });
    for (const l of listeners) {
      try { l.conn.send(msg); } catch {}
    }
  },

  reset: () => {
    const { peerInstance, connectionInstance, listeners } = get();
    try { connectionInstance?.close(); } catch {}
    for (const l of listeners) { try { l.conn.close(); } catch {} }
    try { peerInstance?.destroy(); } catch {}
    set({
      status: 'idle',
      role: null,
      sessionCode: null,
      peerId: null,
      peerInstance: null,
      connectionInstance: null,
      dataChannel: null,
      connectedSince: null,
      listeners: [],
      listenerCount: 0,
      suggestions: [],
    });
  },
}));

export { MAX_LISTENERS };
