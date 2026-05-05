import { useCallback, useEffect, useRef } from 'react';
import { useListenPartyStore, MAX_LISTENERS } from '@/store/listenParty';
import { usePlayerStore } from '@/store/player';
import type { PartyEvent, ConnectedListener } from '@/store/listenParty';

let PeerClass: any = null;
async function getPeer() {
  if (PeerClass) return PeerClass;
  const mod = await import('peerjs');
  PeerClass = mod.default ?? mod.Peer;
  return PeerClass;
}

const HEARTBEAT_INTERVAL = 5_000;

function applyPartyEvent(evt: PartyEvent) {
  const { type, position, timestamp } = evt;
  const { trackData, queue, queueIndex } = evt as any;
  // Компенсируем сетевую задержку: сколько секунд прошло пока пакет летел
  const latency = Math.max(0, (Date.now() - timestamp) / 1000);
  const player = usePlayerStore.getState();

  switch (type) {
    case 'PLAY': {
      // Применяем позицию с учётом latency — трек уже продолжился пока пакет летел
      const targetPos = (position ?? 0) + latency;
      player.seek(targetPos);
      player.resume();
      break;
    }
    case 'PAUSE': {
      player.pause();
      // При паузе latency не добавляем — момент паузы фиксированный
      if (position !== undefined) player.seek(position);
      break;
    }
    case 'SEEK': {
      // Только один seek, без повторного через setTimeout (вызывает rebuffering)
      const targetPos = (position ?? 0) + latency;
      player.seek(targetPos);
      break;
    }
    case 'TRACK': {
      if (!trackData) break;
      const safeTrack = {
        ...trackData,
        id: typeof trackData.id === 'string' ? parseInt(trackData.id, 10) : trackData.id,
        user: trackData.user ? {
          ...trackData.user,
          id: typeof trackData.user.id === 'string' ? parseInt(trackData.user.id, 10) : trackData.user.id,
        } : trackData.user,
      };
      const q = (queue ?? [safeTrack]).map((t: any) => ({
        ...t,
        id: typeof t.id === 'string' ? parseInt(t.id, 10) : t.id,
      }));
      player.playTrack(safeTrack, q, queueIndex ?? 0);
      if (position !== undefined && position > 0) {
        const targetPos = position + latency;
        const audio = usePlayerStore.getState().audioEl;
        if (audio) {
          const apply = () => { player.seek(targetPos); audio.removeEventListener('canplay', apply); };
          if (audio.readyState >= 2) player.seek(targetPos);
          else {
            audio.addEventListener('canplay', apply);
            setTimeout(() => { audio.removeEventListener('canplay', apply); player.seek(targetPos); }, 3000);
          }
        }
      }
      break;
    }
    case 'HEARTBEAT': {
      if (position === undefined) break;
      // Ожидаемая позиция у лидера на этот момент (учитываем latency)
      const expectedPos = position + latency;
      const localTime   = usePlayerStore.getState().currentTime;
      const isPlaying   = usePlayerStore.getState().isPlaying;

      if (!isPlaying) break; // не трогаем если на паузе

      const drift = Math.abs(localTime - expectedPos);

      // Мягкая коррекция: только если расхождение значительное (> 4 сек)
      // Небольшой дрейф (< 4 сек) — нормально и не вызывает заикания
      if (drift > 4) {
        player.seek(expectedPos);
      }
      break;
    }
  }
}

export function useListenParty() {
  const store = useListenPartyStore();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roleRef = useRef<'leader' | 'listener' | null>(null);

  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => {
      store.broadcastEvent({
        type: 'HEARTBEAT',
        position: usePlayerStore.getState().currentTime,
        listenerName: undefined,
      } as any);
    }, HEARTBEAT_INTERVAL);
  }, [store]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
  }, []);

  // ─── Attach handlers for a listener connection (used by leader) ──────────
  const attachListenerConn = useCallback((conn: any) => {
    const listenerId = conn.peer as string;
    const listenerName = store.myListenerName ?? 'Слушатель';

    const listener: ConnectedListener = {
      id: listenerId,
      name: listenerName,
      connectedAt: Date.now(),
      conn,
    };

    store.addListener(listener);

    // Send initial state
    setTimeout(() => {
      const { currentTrack, queue, queueIndex, isPlaying, currentTime } = usePlayerStore.getState();
      const currentListeners = useListenPartyStore.getState().listeners;

      if (currentTrack) {
        conn.send(JSON.stringify({
          type: 'TRACK',
          trackData: currentTrack,
          queue,
          queueIndex,
          position: currentTime,
          timestamp: Date.now(),
        }));

        setTimeout(() => {
          const { isPlaying: playing, currentTime: ct } = usePlayerStore.getState();
          conn.send(JSON.stringify({
            type: playing ? 'PLAY' : 'PAUSE',
            position: ct,
            timestamp: Date.now(),
          }));
        }, 1500);
      }

      // Broadcast updated listener count to all
      store.broadcastEvent({
        type: 'LISTENER_JOIN',
        listenerName: listenerName,
        listenerId,
        position: currentListeners.length + 1,
      } as any);
    }, 300);

    const onData = (raw: string) => {
      try {
        const evt: PartyEvent = JSON.parse(raw);
        if (evt.type === 'SUGGEST') {
          // Leader receives track suggestion from listener
          store.addSuggestion({
            id: evt.suggestId ?? `${Date.now()}`,
            track: evt.suggestTrack,
            fromName: evt.suggestFrom ?? 'Слушатель',
            fromId: listenerId,
            timestamp: Date.now(),
          });
        }
        // Forward listener name if provided on connect
        if (evt.type === 'LISTENER_JOIN' && evt.listenerName) {
          store.removeListener(listenerId);
          store.addListener({ ...listener, name: evt.listenerName });
        }
      } catch {}
    };

    const onClose = () => {
      store.removeListener(listenerId);
      store.broadcastEvent({
        type: 'LISTENER_LEAVE',
        listenerId,
        position: useListenPartyStore.getState().listeners.length - 1,
      } as any);
    };

    conn.on('data', onData);
    conn.on('close', onClose);
    conn.on('error', onClose);
  }, [store]);

  // ─── Host ─────────────────────────────────────────────────────────────────
  const host = useCallback(async () => {
    store.reset();
    store.setStatus('hosting');
    store.setRole('leader');
    roleRef.current = 'leader';

    const Peer = await getPeer();
    const peer = new Peer(undefined, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
        ],
      },
    });
    store.setPeerInstance(peer);

    peer.on('open', (id: string) => {
      console.log('[ListenParty][HOST] peer.open, id:', id);
      store.setPeerId(id);
      store.setSessionCode(id);
      store.setStatus('hosting');
      store.setConnectedSince(Date.now());
      startHeartbeat();
    });

    peer.on('disconnected', () => {
      console.warn('[ListenParty][HOST] peer.disconnected — пытаемся переподключиться');
      try { peer.reconnect(); } catch (e) { console.error('[ListenParty][HOST] reconnect failed:', e); }
    });

    peer.on('connection', (conn: any) => {
      const currentListeners = useListenPartyStore.getState().listeners;
      if (currentListeners.length >= MAX_LISTENERS) {
        // Session full — reject
        conn.on('open', () => {
          conn.send(JSON.stringify({ type: 'SESSION_FULL', timestamp: Date.now() }));
          setTimeout(() => conn.close(), 500);
        });
        return;
      }

      conn.on('open', () => {
        attachListenerConn(conn);
        // Mark as connected once first listener joins
        store.setStatus('connected');
      });
    });

    peer.on('error', (err: any) => {
      console.error('[ListenParty] peer error:', err);
      store.setStatus('idle');
    });
  }, [store, startHeartbeat, attachListenerConn]);

  // ─── Join ─────────────────────────────────────────────────────────────────
  const join = useCallback(async (code: string, listenerName: string) => {
    store.reset();
    store.setStatus('joining');
    store.setRole('listener');
    roleRef.current = 'listener';

    const Peer = await getPeer();
    const peer = new Peer(undefined, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
        ],
      },
    });
    store.setPeerInstance(peer);

    peer.on('open', (myId: string) => {
      console.log('[ListenParty][JOIN] peer.open, my id:', myId, '— подключаюсь к', code.trim());
      const conn = peer.connect(code.trim(), { reliable: true });

      // Таймаут на подключение (60 секунд)
      const connectionTimeout = setTimeout(() => {
        if (useListenPartyStore.getState().status !== 'connected') {
          console.error('[ListenParty][JOIN] Таймаут подключения к лидеру (60с)');
          conn.close();
          store.setStatus('disconnected');
        }
      }, 60000);

      conn.on('open', () => {
        console.log('[ListenParty][JOIN] conn.open — соединение установлено');
        clearTimeout(connectionTimeout);
        store.setSessionCode(code.trim());
        store.setConnectionInstance(conn);
        store.setDataChannel(conn);
        store.setStatus('connected');
        store.setConnectedSince(Date.now());

        // Send our name to leader
        conn.send(JSON.stringify({
          type: 'LISTENER_JOIN',
          listenerName,
          timestamp: Date.now(),
        }));

        const onData = (raw: string) => {
          try {
            const evt: PartyEvent = JSON.parse(raw);
            if ((evt as any).type === 'SESSION_FULL') {
              store.setStatus('disconnected');
              return;
            }
            if (evt.type === 'LISTENER_JOIN' || evt.type === 'LISTENER_LEAVE') {
              // Update listener count
              store.setListenerCount((evt.position as number) ?? 0);
              return;
            }
            if (roleRef.current === 'listener') applyPartyEvent(evt);
          } catch (err) {
            console.error('[ListenParty] Ошибка парсинга события:', err, 'Raw data:', raw);
          }
        };

        const onClose = () => {
          store.setStatus('disconnected');
          roleRef.current = null;
        };

        conn.on('data', onData);
        conn.on('close', onClose);
        conn.on('error', onClose);
      });

      conn.on('error', (err: any) => {
        console.error('[ListenParty] join conn error:', err);
        store.setStatus('disconnected');
        // Добавляем информацию об ошибке в состояние для отображения пользователю
        console.error('[ListenParty] Не удалось подключиться к лидеру. Проверьте код сессии и убедитесь что друг все еще хостит сессию.');
      });
    });

    peer.on('error', (err: any) => {
      console.error('[ListenParty] peer error:', err);
      store.setStatus('idle');
    });
  }, [store]);

  // ─── Suggest track (listener → leader) ──────────────────────────────────
  const suggestTrack = useCallback((track: any) => {
    const name = useListenPartyStore.getState().myListenerName;
    store.sendEvent({
      type: 'SUGGEST',
      suggestTrack: track,
      suggestFrom: name,
      suggestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    } as any);
  }, [store]);

  // ─── Leave ────────────────────────────────────────────────────────────────
  const leave = useCallback(() => {
    stopHeartbeat();
    roleRef.current = null;
    store.reset();
  }, [store, stopHeartbeat]);

  useEffect(() => () => { stopHeartbeat(); }, [stopHeartbeat]);

  return { host, join, leave, suggestTrack };
}
