import { useEffect, useState, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useUIStore } from '@/store/ui';
import { useI18nStore } from '@/store/i18n';
import { usePlayerStore } from '@/store/player';
import { useListenPartyStore } from '@/store/listenParty';
import { scAPI } from '@/api/soundcloud';
import { useHistoryStore } from '@/store/history';
import { useAudio } from '@/hooks/useAudio';
import { useDiscordRPC } from '@/hooks/useDiscordRPC';
import { useOBSWidget } from '@/hooks/useOBSWidget';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useSoundCloudPaste } from '@/hooks/useSoundCloudPaste';
import { useListenPartySync } from '@/hooks/useListenPartySync';
import { useEqualizer } from '@/hooks/useEqualizer';
import { useScrolling } from '@/hooks/useScrolling';
import { ScrollContainerProvider } from '@/contexts/ScrollContainerContext';

import { Titlebar } from '@/components/common/Titlebar';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { PlayerBar } from '@/components/player/PlayerBar';
import { BackgroundLayer } from '@/components/common/BackgroundLayer';
import { Spinner } from '@/components/common/UI';

import { HomePage } from '@/pages/HomePage';
import { SearchPage } from '@/pages/SearchPage';
import { WavePage } from '@/pages/WavePage';
import { TrackPage } from '@/pages/TrackPage';
import { UserPage } from '@/pages/UserPage';
import { PlaylistPage } from '@/pages/PlaylistPage';
import { FollowingPage } from '@/pages/FollowingPage';
import { FollowersPage } from '@/pages/FollowersPage';



import { FeedPage, LibraryPage, LikesPage } from '@/pages/StubPages';
import { SettingsPage } from '@/pages/SettingsPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { LyricsPage } from '@/pages/LyricsPage';

function AppContent() {
  const location = useLocation();
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState<string | null>(null);
  const freezeHoverOnScroll = useUIStore((s) => s.freezeHoverOnScroll);
  useScrolling(mainEl, freezeHoverOnScroll);

  useEffect(() => {
    if (mainEl) mainEl.scrollTop = 0;
  }, [location.pathname, mainEl]);

  useEffect(() => {
    const unsubAvailable = window.electron?.updater?.onUpdateAvailable((v) => setUpdateAvailable(v));
    const unsubDownloaded = window.electron?.updater?.onUpdateDownloaded((v) => { setUpdateDownloaded(v); setUpdateAvailable(null); });
    return () => {
      unsubAvailable?.();
      unsubDownloaded?.();
    };
  }, []);

  // ── Window visibility — снижаем нагрузку только когда вкладка скрыта ──
  // Используем только visibilitychange (надёжно в Electron).
  // focus/blur НЕ используем — в Electron они срабатывают ненадёжно
  // и навешивают window-blurred при старте приложения.
  useEffect(() => {
    const root = document.documentElement;

    const onVisibility = () => {
      if (document.hidden) root.classList.add('window-blurred');
      else root.classList.remove('window-blurred');
    };

    document.addEventListener('visibilitychange', onVisibility);

    // НЕ инициализируем window-blurred при старте — пусть анимации работают
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      root.classList.remove('window-blurred');
    };
  }, []);

  const hydrate = useUIStore((s) => s.hydrate);
  const hydrated = useUIStore((s) => s.hydrated);
  const oauthToken = useUIStore((s) => s.oauthToken);
  const hydratePlayer = usePlayerStore((s) => s.hydrate);

  useAudio();
  useDiscordRPC();
  useOBSWidget();
  useKeyboard();
  useListenPartySync();
  useEqualizer();
  const { toast: pasteToast, dismiss: dismissPasteToast } = useSoundCloudPaste();

  useEffect(() => {
    hydrate();
    hydratePlayer();
    useHistoryStore.getState().init();
  }, [hydrate, hydratePlayer]);

  // Очистка Listen Party при закрытии приложения
  useEffect(() => {
    const handleBeforeQuit = () => {
      useListenPartyStore.getState().reset();
    };

    const cleanup = window.electron?.window?.onBeforeQuit?.(handleBeforeQuit);

    return () => {
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (hydrated) scAPI.setOAuthToken(oauthToken);
  }, [hydrated, oauthToken]);

  if (!hydrated) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <>
      <BackgroundLayer />

      <div className="relative z-10 h-full flex flex-col">
        <Titlebar />

        <div className="flex-1 flex min-h-0">
          <Sidebar />
          <main ref={setMainEl} className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
            <ScrollContainerProvider element={mainEl}>
              <div className="p-8 min-h-full">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/wave" element={<WavePage />} />
                  <Route path="/track/:id" element={<TrackPage />} />
                  <Route path="/playlist/:id" element={<PlaylistPage />} />
                  <Route path="/playlist/system" element={<PlaylistPage />} />
                  <Route path="/user/:id/following" element={<FollowingPage />} />
                  <Route path="/user/:id/followers" element={<FollowersPage />} />
                  <Route path="/user" element={<UserPage />} />
                  <Route path="/user/:id" element={<UserPage />} />
                  <Route path="/feed" element={<FeedPage />} />
                  <Route path="/library" element={<LibraryPage />} />
                  <Route path="/likes" element={<LikesPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/lyrics" element={<LyricsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </div>
            </ScrollContainerProvider>
          </main>
        </div>

        <PlayerBar />
      </div>

      {updateDownloaded && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium select-none"
          style={{ background: 'rgb(var(--theme-surface))', border: '1px solid rgb(var(--theme-accent) / 0.4)' }}
        >
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'rgb(var(--theme-accent))' }} />
          <span style={{ color: 'rgb(var(--theme-text))' }}>Soundwave {updateDownloaded} готов к установке</span>
          <button
            onClick={() => window.electron?.updater?.installUpdate()}
            className="px-3 py-1 rounded-lg text-[12px] font-semibold flex-shrink-0"
            style={{ background: 'rgb(var(--theme-accent))', color: 'rgb(var(--theme-accent-fg))' }}
          >
            Установить
          </button>
          <button onClick={() => setUpdateDownloaded(null)} style={{ color: 'rgb(var(--theme-text-dim))' }}>✕</button>
        </div>
      )}

      {updateAvailable && !updateDownloaded && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium select-none"
          style={{ background: 'rgb(var(--theme-surface))', border: '1px solid rgb(var(--theme-border) / 0.4)' }}
        >
          <div className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: 'rgb(var(--theme-accent))' }} />
          <span style={{ color: 'rgb(var(--theme-text-dim))' }}>Загружается обновление {updateAvailable}...</span>
          <button onClick={() => setUpdateAvailable(null)} style={{ color: 'rgb(var(--theme-text-dim))' }}>✕</button>
        </div>
      )}

      {pasteToast && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium select-none transition-all ${
            pasteToast.type === 'loading'
              ? 'bg-surface border border-white/10 text-text'
              : 'bg-red-900/90 border border-red-500/30 text-red-200'
          }`}
          onClick={dismissPasteToast}
        >
          {pasteToast.type === 'loading' && (
            <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {pasteToast.message}
        </div>
      )}
    </>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-4 text-text-dim">
          <p className="text-lg font-semibold text-red-400">{useI18nStore.getState().t('something_went_wrong')}</p>
          <p className="text-sm">{(this.state.error as Error).message}</p>
          <button
            className="px-4 py-2 rounded bg-surface-alt hover:bg-surface transition-colors"
            onClick={() => this.setState({ error: null })}
          >
            {useI18nStore.getState().t('try_again')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <AppContent />
      </HashRouter>
    </ErrorBoundary>
  );
}
