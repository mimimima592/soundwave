import { useState, useRef, useEffect } from 'react';
import { Users, X, Copy, Check, Loader2, Wifi, WifiOff, LogOut, Music2, ChevronRight, UserCheck } from 'lucide-react';
import { useListenPartyStore, MAX_LISTENERS } from '@/store/listenParty';
import { scAPI } from '@/api/soundcloud';
import type { SCTrack } from '@/types/soundcloud';
import { useListenParty } from '@/hooks/useListenParty';
import { usePlayerStore } from '@/store/player';
import { cn, hiResArtwork } from '@/utils/format';

interface Props {
  onClose: () => void;
}

export function ListenPartyModal({ onClose }: Props) {
  const { status, role, sessionCode, connectedSince, listeners, listenerCount, suggestions, myListenerName, setMyListenerName, removeSuggestion } = useListenPartyStore();
  const { host, join, leave, suggestTrack } = useListenParty();
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'menu' | 'host' | 'join'>('menu');
  const [nameInput, setNameInput] = useState(() => localStorage.getItem('partyListenerName') || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === 'hosting' || (status === 'connected' && role === 'leader')) setView('host');
    else if (status === 'joining' || (status === 'connected' && role === 'listener')) setView('join');
  }, [status, role]);

  useEffect(() => {
    if (view === 'join') setTimeout(() => (nameInput ? inputRef.current?.focus() : nameRef.current?.focus()), 80);
  }, [view]);

  const handleCopy = async () => {
    if (!sessionCode) return;
    await navigator.clipboard.writeText(sessionCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleHost = async () => {
    setView('host');
    await host();
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    const name = nameInput.trim() || 'Слушатель';
    setMyListenerName(name);
    await join(joinCode.trim(), name);
  };

  const handleLeave = () => {
    leave();
    setView('menu');
    setJoinCode('');
    setShowSuggestions(false);
  };

  const elapsed = connectedSince ? Math.floor((Date.now() - connectedSince) / 60000) : 0;
  const totalInSession = role === 'leader' ? listeners.length + 1 : listenerCount + 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center pb-24 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-bg/60" onClick={onClose} />

      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden animate-fade-in"
        style={{
          background: 'rgb(var(--theme-surface))',
          border: '1px solid rgb(var(--theme-border) / 0.5)',
          boxShadow: '0 24px 64px rgb(0 0 0 / 0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgb(var(--theme-accent) / 0.15)' }}>
              <Users size={15} style={{ color: 'rgb(var(--theme-accent))' }} strokeWidth={2} />
            </div>
            <span className="text-sm font-semibold tracking-tight" style={{ color: 'rgb(var(--theme-text))' }}>
              Слушать вместе
            </span>
            {(status === 'connected' || status === 'hosting') && totalInSession > 1 && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: 'rgb(var(--theme-accent) / 0.15)', color: 'rgb(var(--theme-accent))' }}>
                {totalInSession}/{MAX_LISTENERS + 1}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-text-dim hover:text-text hover:bg-surface-alt/60 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── MENU ─────────────────────────────────────────────────── */}
        {view === 'menu' && (
          <div className="px-5 pb-5 flex flex-col gap-2.5">
            <p className="text-xs text-text-dim leading-relaxed mb-1">
              До 5 человек слушают синхронно. P2P соединение — треки воспроизводятся независимо.
            </p>

            <button
              onClick={handleHost}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-opacity duration-150 hover:opacity-80 active:opacity-60"
              style={{ background: 'rgb(var(--theme-surface-alt) / 0.6)', border: '1px solid rgb(var(--theme-border) / 0.4)' }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgb(var(--theme-accent) / 0.15)', color: 'rgb(var(--theme-accent))' }}>
                <Users size={15} />
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: 'rgb(var(--theme-text))' }}>Создать сессию</div>
                <div className="text-xs text-text-dim mt-0.5">Ты выбираешь треки · до {MAX_LISTENERS} слушателей</div>
              </div>
            </button>

            <button
              onClick={() => setView('join')}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-opacity duration-150 hover:opacity-80 active:opacity-60"
              style={{ background: 'rgb(var(--theme-surface-alt) / 0.6)', border: '1px solid rgb(var(--theme-border) / 0.4)' }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgb(var(--theme-accent) / 0.15)', color: 'rgb(var(--theme-accent))' }}>
                <Wifi size={15} />
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: 'rgb(var(--theme-text))' }}>Подключиться</div>
                <div className="text-xs text-text-dim mt-0.5">Введи код сессии от хоста</div>
              </div>
            </button>
          </div>
        )}

        {/* ── HOST ─────────────────────────────────────────────────── */}
        {view === 'host' && (
          <div className="px-5 pb-5 flex flex-col gap-4">
            <StatusBadge status={status} role="leader" elapsed={elapsed} listenerCount={listeners.length} />

            {/* Код сессии */}
            <div>
              <div className="text-xs text-text-dim mb-2 font-medium tracking-wide uppercase" style={{ fontSize: 10 }}>
                Код сессии
              </div>
              <div className="flex items-center gap-2 px-3.5 py-3 rounded-xl"
                style={{ background: 'rgb(var(--theme-bg) / 0.7)', border: '1px solid rgb(var(--theme-border) / 0.5)' }}>
                {sessionCode ? (
                  <>
                    <span className="flex-1 font-mono text-sm tracking-widest truncate select-all"
                      style={{ color: 'rgb(var(--theme-accent))' }}>
                      {sessionCode}
                    </span>
                    <button
                      onClick={handleCopy}
                      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-75"
                      style={{
                        background: copied ? 'rgb(var(--theme-accent) / 0.15)' : 'rgb(var(--theme-surface-alt) / 0.8)',
                        color: copied ? 'rgb(var(--theme-accent))' : 'rgb(var(--theme-text-dim))',
                        border: '1px solid rgb(var(--theme-border) / 0.4)',
                      }}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? 'Скопировано' : 'Копировать'}
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-text-dim">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">Получаем код...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Слушатели */}
            {listeners.length > 0 && (
              <div>
                <div className="text-xs text-text-dim mb-2 font-medium tracking-wide uppercase" style={{ fontSize: 10 }}>
                  Слушатели ({listeners.length}/{MAX_LISTENERS})
                </div>
                <div className="space-y-1.5">
                  {listeners.map((l) => (
                    <div key={l.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                      style={{ background: 'rgb(var(--theme-surface-alt) / 0.5)' }}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'rgb(var(--theme-accent) / 0.15)' }}>
                        <UserCheck size={11} style={{ color: 'rgb(var(--theme-accent))' }} />
                      </div>
                      <span className="text-xs font-medium text-text truncate">{l.name}</span>
                      <span className="relative flex h-1.5 w-1.5 ml-auto shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: 'rgb(34 197 94)' }} />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: 'rgb(34 197 94)' }} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Предложения треков */}
            {suggestions.length > 0 && (
              <div>
                <button
                  onClick={() => setShowSuggestions(!showSuggestions)}
                  className="flex items-center justify-between w-full mb-2"
                >
                  <div className="text-xs text-text-dim font-medium tracking-wide uppercase flex items-center gap-1.5" style={{ fontSize: 10 }}>
                    <Music2 size={10} />
                    Предложения ({suggestions.length})
                  </div>
                  <ChevronRight size={12} className={cn('text-text-dim transition-transform duration-200', showSuggestions && 'rotate-90')} />
                </button>

                {showSuggestions && (
                  <div className="space-y-1.5">
                    {suggestions.map((s) => (
                      <SuggestionCard
                        key={s.id}
                        suggestion={s}
                        onAccept={() => {
                          usePlayerStore.getState().playTrack(s.track, [s.track], 0);
                          removeSuggestion(s.id);
                        }}
                        onDecline={() => removeSuggestion(s.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <LeaveButton onClick={handleLeave} />
          </div>
        )}

        {/* ── JOIN ─────────────────────────────────────────────────── */}
        {view === 'join' && (
          <div className="px-5 pb-5 flex flex-col gap-4">
            <StatusBadge status={status} role="listener" elapsed={elapsed} listenerCount={listenerCount} />

            {status !== 'connected' ? (
              <>
                {/* Имя */}
                <div>
                  <div className="text-xs text-text-dim mb-2 font-medium tracking-wide uppercase" style={{ fontSize: 10 }}>
                    Твоё имя
                  </div>
                  <input
                    ref={nameRef}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Как тебя зовут?"
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: 'rgb(var(--theme-bg) / 0.7)',
                      border: '1px solid rgb(var(--theme-border) / 0.5)',
                      color: 'rgb(var(--theme-text))',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'rgb(var(--theme-accent) / 0.5)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgb(var(--theme-border) / 0.5)'; }}
                  />
                </div>

                {/* Код */}
                <div>
                  <div className="text-xs text-text-dim mb-2 font-medium tracking-wide uppercase" style={{ fontSize: 10 }}>
                    Код сессии
                  </div>
                  <input
                    ref={inputRef}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
                    placeholder="Вставь код от хоста..."
                    className="w-full px-3.5 py-3 rounded-xl font-mono text-sm tracking-wider outline-none transition-all"
                    style={{
                      background: 'rgb(var(--theme-bg) / 0.7)',
                      border: '1px solid rgb(var(--theme-border) / 0.5)',
                      color: 'rgb(var(--theme-text))',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'rgb(var(--theme-accent) / 0.5)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgb(var(--theme-border) / 0.5)'; }}
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setView('menu')}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-text-dim hover:text-text transition-colors"
                    style={{ background: 'rgb(var(--theme-surface-alt) / 0.5)', border: '1px solid rgb(var(--theme-border) / 0.3)' }}
                  >
                    Назад
                  </button>
                  <button
                    onClick={handleJoin}
                    disabled={!joinCode.trim() || status === 'joining'}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-75 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: 'rgb(var(--theme-accent))', color: '#fff' }}
                  >
                    {status === 'joining' && <Loader2 size={14} className="animate-spin" />}
                    {status === 'joining' ? 'Подключение...' : 'Подключиться'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <SuggestSearch onSuggest={(track) => { suggestTrack(track); }} />
                <LeaveButton onClick={handleLeave} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ── Suggest search ──────────────────────────────────────────────────────────
function SuggestSearch({ onSuggest }: { onSuggest: (track: SCTrack) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SCTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggested, setSuggested] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await scAPI.search(q.trim(), 'tracks', 5);
        setResults((res.collection as SCTrack[]).filter((t) => t.title));
      } catch {}
      setLoading(false);
    }, 400);
  };

  const handleSuggest = (track: SCTrack) => {
    onSuggest(track);
    setSuggested(track.id);
    setTimeout(() => setSuggested(null), 2000);
  };

  return (
    <div>
      <div className="text-xs text-text-dim mb-2 font-medium tracking-wide uppercase" style={{ fontSize: 10 }}>
        Предложить трек хосту
      </div>
      <div className="relative mb-2">
        <input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Найти трек..."
          className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none pr-8"
          style={{
            background: 'rgb(var(--theme-bg) / 0.7)',
            border: '1px solid rgb(var(--theme-border) / 0.5)',
            color: 'rgb(var(--theme-text))',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'rgb(var(--theme-accent) / 0.5)'; }}
          onBlur={(e) => { e.target.style.borderColor = 'rgb(var(--theme-border) / 0.5)'; }}
        />
        {loading && (
          <Loader2 size={13} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-text-dim" />
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {results.map((track) => (
            <div key={track.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
              style={{ background: 'rgb(var(--theme-surface-alt) / 0.4)', border: '1px solid rgb(var(--theme-border) / 0.25)' }}>
              {track.artwork_url ? (
                <img src={hiResArtwork(track.artwork_url)} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
                  style={{ background: 'rgb(var(--theme-surface-alt))' }}>
                  <Music2 size={13} className="text-text-dim" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-text truncate">{track.title}</div>
                <div className="text-[11px] text-text-dim truncate">{track.user?.username}</div>
              </div>
              <button
                onClick={() => handleSuggest(track)}
                className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-opacity hover:opacity-80"
                style={{
                  background: suggested === track.id ? 'rgb(34 197 94 / 0.15)' : 'rgb(var(--theme-accent) / 0.15)',
                  color: suggested === track.id ? 'rgb(34 197 94)' : 'rgb(var(--theme-accent))',
                }}
              >
                {suggested === track.id ? '✓' : '→'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Suggestion card ─────────────────────────────────────────────────────────
function SuggestionCard({ suggestion, onAccept, onDecline }: {
  suggestion: any; onAccept: () => void; onDecline: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
      style={{ background: 'rgb(var(--theme-surface-alt) / 0.4)', border: '1px solid rgb(var(--theme-border) / 0.3)' }}>
      {suggestion.track?.artwork_url && (
        <img src={hiResArtwork(suggestion.track.artwork_url)} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-text truncate">{suggestion.track?.title}</div>
        <div className="text-[11px] text-text-dim truncate">{suggestion.fromName}</div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button
          onClick={onAccept}
          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-opacity hover:opacity-80"
          style={{ background: 'rgb(var(--theme-accent))', color: 'rgb(var(--theme-accent-fg))' }}
        >
          ✓
        </button>
        <button
          onClick={onDecline}
          className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-opacity hover:opacity-80"
          style={{ background: 'rgb(var(--theme-surface-alt))', color: 'rgb(var(--theme-text-dim))' }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, role, elapsed, listenerCount }: {
  status: string; role: 'leader' | 'listener'; elapsed: number; listenerCount: number;
}) {
  const isConnected = status === 'connected' || status === 'hosting';
  const isLoading = status === 'joining';
  const isDisconnected = status === 'disconnected';

  if (!isConnected && !isLoading && !isDisconnected) return null;

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl"
      style={{
        background: isConnected ? 'rgb(34 197 94 / 0.08)' : isDisconnected ? 'rgb(239 68 68 / 0.08)' : 'rgb(var(--theme-surface-alt) / 0.5)',
        border: `1px solid ${isConnected ? 'rgb(34 197 94 / 0.2)' : isDisconnected ? 'rgb(239 68 68 / 0.2)' : 'rgb(var(--theme-border) / 0.3)'}`,
      }}
    >
      {isConnected ? (
        <>
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'rgb(34 197 94)' }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'rgb(34 197 94)' }} />
          </span>
          <span className="text-xs font-medium" style={{ color: 'rgb(34 197 94)' }}>
            {role === 'leader'
              ? listenerCount === 0 ? 'Ждём слушателей...' : `${listenerCount} слушател${listenerCount === 1 ? 'ь' : 'я'}`
              : 'Подключён к сессии'
            }
            {elapsed > 0 && <span className="text-text-dim font-normal"> · {elapsed} мин</span>}
          </span>
        </>
      ) : isDisconnected ? (
        <>
          <WifiOff size={13} style={{ color: 'rgb(239 68 68)' }} />
          <span className="text-xs" style={{ color: 'rgb(239 68 68)' }}>Соединение потеряно</span>
        </>
      ) : (
        <>
          <Loader2 size={13} className="animate-spin text-text-dim" />
          <span className="text-xs text-text-dim">Подключаемся...</span>
        </>
      )}
    </div>
  );
}

function LeaveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] active:scale-[0.98]"
      style={{ background: 'rgb(239 68 68 / 0.08)', border: '1px solid rgb(239 68 68 / 0.2)', color: 'rgb(239 68 68)' }}
    >
      <LogOut size={13} />
      Завершить сессию
    </button>
  );
}
