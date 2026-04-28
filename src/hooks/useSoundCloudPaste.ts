import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { scAPI } from '@/api/soundcloud';
import type { SCTrack, SCPlaylist, SCUser } from '@/types/soundcloud';

const SC_URL_RE = /https?:\/\/(?:www\.)?soundcloud\.com\/[^\s"'<>]+/i;

export type PasteToast =
  | { type: 'loading'; message: string }
  | { type: 'error'; message: string }
  | null;

export function useSoundCloudPaste() {
  const navigate = useNavigate();
  const [toast, setToast] = useState<PasteToast>(null);

  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;

    const handler = async (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === 'v')) return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;

      e.preventDefault();

      let text = '';
      try {
        text = await navigator.clipboard.readText();
      } catch {
        return;
      }

      const match = text.match(SC_URL_RE);
      if (!match) return;

      const url = match[0].replace(/[.,;!?)]+$/, ''); // убираем случайную пунктуацию
      setToast({ type: 'loading', message: 'Открываем ссылку SoundCloud…' });

      try {
        const resource = await scAPI.resolveUrl(url);
        if (!resource) throw new Error('empty');

        setToast(null);

        const kind = (resource as SCTrack | SCPlaylist | SCUser).kind;

        if (kind === 'track') {
          navigate(`/track/${resource.id}`, { state: { track: resource } });
        } else if (kind === 'user') {
          navigate(`/user/${resource.id}`);
        } else if (kind === 'playlist' || kind === 'system-playlist') {
          navigate(`/playlist/${resource.id}`, { state: { playlist: resource } });
        } else {
          throw new Error('unknown kind: ' + kind);
        }
      } catch {
        setToast({ type: 'error', message: 'Не удалось открыть ссылку' });
        dismissTimer = setTimeout(() => setToast(null), 3500);
      }
    };

    document.addEventListener('keydown', handler, { capture: true });
    return () => {
      document.removeEventListener('keydown', handler, { capture: true });
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, [navigate]);

  return { toast, dismiss };
}
