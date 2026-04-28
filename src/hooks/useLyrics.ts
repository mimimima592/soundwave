import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/store/player';

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsState {
  lines: LyricLine[];
  plainLyrics: string | null;
  instrumental: boolean;
  loading: boolean;
  notFound: boolean;
  synced: boolean;
  activeIndex: number;
}

function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2}(?:\.\d+)?)\](.*)/g;
  let match;
  while ((match = regex.exec(lrc)) !== null) {
    const text = match[3].trim();
    if (!text) continue;
    lines.push({
      time: parseInt(match[1], 10) * 60 + parseFloat(match[2]),
      text,
    });
  }
  return lines.sort((a, b) => a.time - b.time);
}

function processResult(result: any): Omit<LyricsState, 'loading' | 'activeIndex'> {
  if (result.instrumental) {
    return { lines: [], plainLyrics: null, instrumental: true, notFound: false, synced: false };
  }
  if (result.syncedLyrics) {
    return {
      lines: parseLRC(result.syncedLyrics),
      plainLyrics: result.plainLyrics ?? null,
      instrumental: false,
      notFound: false,
      synced: true,
    };
  }
  if (result.plainLyrics) {
    return { lines: [], plainLyrics: result.plainLyrics, instrumental: false, notFound: false, synced: false };
  }
  return { lines: [], plainLyrics: null, instrumental: false, notFound: true, synced: false };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('lrclib_timeout')), ms)
    ),
  ]);
}

async function lrclibGet(url: string): Promise<{ ok: boolean; status: number; data: any }> {
  if (window.electron) {
    const res = await window.electron.net.fetch({ url, method: 'GET' });
    return {
      ok: res.ok,
      status: res.status,
      data: res.ok && res.body ? JSON.parse(res.body) : null,
    };
  }
  const res = await fetch(url);
  return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : null };
}

function stripTitleSuffixes(title: string): string {
  return title
    .replace(/\(prod\.?[^)]*\)/gi, '')     // (prod. name)
    .replace(/\(feat\.?[^)]*\)/gi, '')     // (feat. name)
    .replace(/\(ft\.?[^)]*\)/gi, '')       // (ft. name)
    .replace(/\(prod by[^)]*\)/gi, '')     // (prod by name)
    .replace(/\[[^\]]*\]/g, '')            // [anything]
    .replace(/\s*\+[^+]+\+/g, '')         // +tewiq, фортуна+ (featured in +...+)
    .replace(/\s*\+[^+()\[\]]+$/g, '')    // +name at end without closing +
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function pickBestResult(results: any[], durationSec: number): any | null {
  if (!results.length) return null;

  const DURATION_TOLERANCE = 5;

  // Оставляем только результаты с хоть каким-то текстом
  const withLyrics = results.filter((r) => r.syncedLyrics || r.plainLyrics);
  const pool = withLyrics.length > 0 ? withLyrics : results;

  // Фильтруем строго по ±5 сек
  const closeOnes = pool.filter((r) => Math.abs((r.duration ?? 0) - durationSec) <= DURATION_TOLERANCE);
  if (closeOnes.length === 0) return null;

  // Среди подходящих — приоритет синхронизированным, затем ближайший по длительности
  const sorted = closeOnes
    .map((r) => ({ r, diff: Math.abs((r.duration ?? 0) - durationSec) }))
    .sort((a, b) => a.diff - b.diff);

  return sorted.find((x) => x.r.syncedLyrics)?.r ?? sorted[0].r;
}

const EMPTY: Omit<LyricsState, 'loading' | 'activeIndex'> = {
  lines: [],
  plainLyrics: null,
  instrumental: false,
  notFound: false,
  synced: false,
};

// Кэш для результатов lyrics по track ID
const lyricsCache = new Map<number, Omit<LyricsState, 'loading' | 'activeIndex'>>();

export function useLyrics(): LyricsState {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const audioEl = usePlayerStore((s) => s.audioEl);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Omit<LyricsState, 'loading' | 'activeIndex'>>(EMPTY);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!currentTrack) {
      setData(EMPTY);
      setLoading(false);
      return;
    }

    // Проверяем кэш
    if (lyricsCache.has(currentTrack.id)) {
      setData(lyricsCache.get(currentTrack.id)!);
      setLoading(false);
      return;
    }

    let active = true;
    setData(EMPTY);
    setLoading(true);

    (async () => {
      try {
        const duration = Math.round(currentTrack.duration / 1000);

        // Два варианта нормализации: оригинал (ё) + нормализованный (е)
        // lrclib может хранить любой из вариантов
        const yo2ye = (s: string) => s.replace(/ё/gi, 'е');

        const rawTitleOrig = currentTrack.title;
        const rawTitleNorm = yo2ye(rawTitleOrig);
        const rawArtistOrig = currentTrack.user.username;
        const rawArtistNorm = yo2ye(rawArtistOrig);

        const titleOrig = encodeURIComponent(rawTitleOrig);
        const titleNorm = encodeURIComponent(rawTitleNorm);
        const artistOrig = encodeURIComponent(rawArtistOrig);
        const artistNorm = encodeURIComponent(rawArtistNorm);

        const titleStrippedOrig = encodeURIComponent(stripTitleSuffixes(rawTitleOrig));
        const titleStrippedNorm = encodeURIComponent(stripTitleSuffixes(rawTitleNorm));

        // Паттерн «АРТИСТ - НАЗВАНИЕ» — берём оригинал
        const dashIdx = rawTitleOrig.indexOf(' - ');
        const cleanTitle = dashIdx !== -1 ? encodeURIComponent(stripTitleSuffixes(rawTitleOrig.slice(dashIdx + 3).trim())) : null;
        const cleanTitleNorm = dashIdx !== -1 ? encodeURIComponent(stripTitleSuffixes(yo2ye(rawTitleOrig.slice(dashIdx + 3).trim()))) : null;
        const prefixArtist = dashIdx !== -1 ? encodeURIComponent(rawTitleOrig.slice(0, dashIdx).trim()) : null;
        const prefixArtistNorm = dashIdx !== -1 ? encodeURIComponent(yo2ye(rawTitleOrig.slice(0, dashIdx).trim())) : null;

        // Хелпер: добавляем только уникальные URL
        const seenUrls = new Set<string>();
        const uniq = (url: string) => { if (seenUrls.has(url)) return null; seenUrls.add(url); return url; };
        const req = (url: string) => withTimeout(lrclibGet(url), 3000);

        const base = 'https://lrclib.net/api';

        // Сначала делаем только exact запросы с duration (самые точные)
        const exactDurationUrls = [
          `${base}/get?track_name=${titleStrippedOrig}&artist_name=${artistOrig}&duration=${duration}`,
          `${base}/get?track_name=${titleStrippedNorm}&artist_name=${artistNorm}&duration=${duration}`,
          ...(cleanTitle && prefixArtist ? [
            `${base}/get?track_name=${cleanTitle}&artist_name=${prefixArtist}&duration=${duration}`,
          ] : []),
        ].map(uniq).filter(Boolean) as string[];

        // Если exact с duration не дали результат, пробуем exact без duration
        const exactNoDurationUrls = [
          `${base}/get?track_name=${titleStrippedOrig}&artist_name=${artistOrig}`,
          `${base}/get?track_name=${titleStrippedNorm}&artist_name=${artistNorm}`,
          `${base}/get?track_name=${titleOrig}&artist_name=${artistOrig}`,
          ...(cleanTitle && prefixArtist ? [
            `${base}/get?track_name=${cleanTitle}&artist_name=${prefixArtist}`,
          ] : []),
          ...(cleanTitleNorm && prefixArtistNorm ? [
            `${base}/get?track_name=${cleanTitleNorm}&artist_name=${prefixArtistNorm}`,
          ] : []),
        ].map(uniq).filter(Boolean) as string[];

        // Search запросы - только если exact не дали результат
        const searchUrls = [
          `${base}/search?q=${artistOrig}+${titleStrippedOrig}`,
          `${base}/search?q=${artistNorm}+${titleStrippedNorm}`,
          `${base}/search?q=${titleStrippedOrig}`,
          `${base}/search?q=${titleStrippedNorm}`,
          ...(cleanTitle && prefixArtist ? [
            `${base}/search?q=${prefixArtist}+${cleanTitle}`,
          ] : []),
          ...(cleanTitleNorm && prefixArtistNorm ? [
            `${base}/search?q=${prefixArtistNorm}+${cleanTitleNorm}`,
          ] : []),
        ].map(uniq).filter(Boolean) as string[];

        // Этап 1: exact запросы с duration
        const exactDurationPromises = exactDurationUrls.map(req);
        const exactDurationResults = await Promise.allSettled(exactDurationPromises);
        if (!active) return;

        for (const r of exactDurationResults) {
          if (r.status === 'fulfilled' && r.value.ok && r.value.data) {
            const result = processResult(r.value.data);
            setData(result);
            lyricsCache.set(currentTrack.id, result);
            setLoading(false);
            return;
          }
        }

        // Этап 2: exact запросы без duration
        const exactNoDurationPromises = exactNoDurationUrls.map(req);
        const exactNoDurationResults = await Promise.allSettled(exactNoDurationPromises);
        if (!active) return;

        for (const r of exactNoDurationResults) {
          if (r.status === 'fulfilled' && r.value.ok && r.value.data) {
            const result = processResult(r.value.data);
            setData(result);
            lyricsCache.set(currentTrack.id, result);
            setLoading(false);
            return;
          }
        }

        // Этап 3: search запросы
        const searchPromises = searchUrls.map(req);
        const searchResults = await Promise.allSettled(searchPromises);
        if (!active) return;

        // Собираем поисковые результаты, дедуплицируем по id
        const seen = new Set<number>();
        const pool: any[] = [];
        for (const r of searchResults) {
          if (r.status === 'fulfilled' && r.value.ok && Array.isArray(r.value.data)) {
            for (const item of r.value.data) {
              if (!seen.has(item.id)) { seen.add(item.id); pool.push(item); }
            }
          }
        }

        if (pool.length > 0) {
          const best = pickBestResult(pool, duration);
          if (best) {
            const result = processResult(best);
            setData(result);
            lyricsCache.set(currentTrack.id, result);
            setLoading(false);
            return;
          }
        }

        const result = { ...EMPTY, notFound: true };
        setData(result);
        lyricsCache.set(currentTrack.id, result);
        setLoading(false);
      } catch {
        if (active) {
          setData({ ...EMPTY, notFound: true });
          setLoading(false);
        }
      }
    })();

    return () => { active = false; };
  }, [currentTrack?.id]);

  const lastIdxRef = useRef(-1);

  useEffect(() => {
    if (!data.synced || data.lines.length === 0) {
      lastIdxRef.current = -1;
      setActiveIndex(-1);
      return;
    }
    const tick = () => {
      const t = (audioEl?.currentTime ?? 0) + 0.3;
      let idx = -1;
      for (let i = 0; i < data.lines.length; i++) {
        if (data.lines[i].time <= t) idx = i;
        else break;
      }
      if (idx !== lastIdxRef.current) {
        lastIdxRef.current = idx;
        setActiveIndex(idx);
      }
    };

    let intervalId: ReturnType<typeof setInterval>;
    const start = (fast: boolean) => {
      clearInterval(intervalId);
      intervalId = setInterval(tick, fast ? 100 : 2000);
    };
    const onFocus = () => start(true);
    const onBlur  = () => start(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur',  onBlur);

    tick();
    start(document.hasFocus());
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur',  onBlur);
    };
  }, [data.lines, data.synced, audioEl]);

  return { ...data, loading, activeIndex };
}
