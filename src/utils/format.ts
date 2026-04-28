export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/** SoundCloud отдаёт artwork_url с "-large" — заменяем на t500x500 для hi-res.
 *  Avatars (avatars-…) не имеют t500x500, максимум t300x300. */
export function hiResArtwork(url: string | null | undefined): string {
  if (!url) return '';
  const isAvatar = url.includes('/avatars-');
  const target = isAvatar ? 't300x300' : 't500x500';
  return url.replace(/-(large|t500x500|t300x300|t200x200|t120x120|t67x67|original|small|medium|badge|tiny)(\.\w+)$/, `-${target}$2`);
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** Форматирование больших чисел: 12345 → "12.3K" */
export function formatCount(n: number | undefined): string {
  if (n === undefined || n === null) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}
