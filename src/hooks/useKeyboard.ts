import { useEffect } from 'react';
import { usePlayerStore } from '@/store/player';

/**
 * Глобальные клавиатурные шорткаты.
 * Активны только если фокус не в input/textarea.
 */
export function useKeyboard() {
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (el as HTMLElement).isContentEditable
      );
    };

    const handler = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const s = usePlayerStore.getState();

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          s.togglePlay();
          break;
        case 'ArrowRight':
          if (e.shiftKey) {
            e.preventDefault();
            s.next();
          } else if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            s.seek(Math.min(s.duration, s.currentTime + 10));
          }
          break;
        case 'ArrowLeft':
          if (e.shiftKey) {
            e.preventDefault();
            s.previous();
          } else if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            s.seek(Math.max(0, s.currentTime - 10));
          }
          break;
        case 'ArrowUp':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            s.setVolume(Math.min(1, s.volume + 0.05));
          }
          break;
        case 'ArrowDown':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            s.setVolume(Math.max(0, s.volume - 0.05));
          }
          break;
        case 'KeyM':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            s.toggleMute();
          }
          break;
      }
    };

    // Media keys через navigator.mediaSession
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () =>
        usePlayerStore.getState().resume()
      );
      navigator.mediaSession.setActionHandler('pause', () =>
        usePlayerStore.getState().pause()
      );
      navigator.mediaSession.setActionHandler('nexttrack', () =>
        usePlayerStore.getState().next()
      );
      navigator.mediaSession.setActionHandler('previoustrack', () =>
        usePlayerStore.getState().previous()
      );
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
