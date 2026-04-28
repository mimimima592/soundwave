export type SoundCloudUrlType = 'track' | 'playlist' | 'user' | null;

export interface ParsedSoundCloudUrl {
  type: SoundCloudUrlType;
  id?: string;
  permalink?: string;
}

/**
 * Parses a SoundCloud URL and extracts the content type and identifier.
 * Supports:
 * - Tracks: https://soundcloud.com/artist/track-name
 * - Playlists: https://soundcloud.com/artist/sets/playlist-name
 * - Users: https://soundcloud.com/artist-name
 */
export function parseSoundCloudUrl(url: string): ParsedSoundCloudUrl {
  const trimmedUrl = url.trim();

  // Basic SoundCloud URL pattern
  const soundCloudPattern = /^https?:\/\/(?:www\.)?soundcloud\.com\/(.+)$/i;
  const match = trimmedUrl.match(soundCloudPattern);

  if (!match) {
    return { type: null };
  }

  const path = match[1];

  // Playlist pattern: /artist/sets/playlist-name
  const playlistMatch = path.match(/^([^\/]+)\/sets\/([^\/]+)$/);
  if (playlistMatch) {
    return {
      type: 'playlist',
      permalink: `${playlistMatch[1]}/sets/${playlistMatch[2]}`,
    };
  }

  // Track pattern: /artist/track-name (but not /sets/)
  const trackMatch = path.match(/^([^\/]+)\/([^\/]+)$/);
  if (trackMatch) {
    return {
      type: 'track',
      permalink: `${trackMatch[1]}/${trackMatch[2]}`,
    };
  }

  // User pattern: /artist-name (single segment)
  const userMatch = path.match(/^([^\/]+)$/);
  if (userMatch) {
    return {
      type: 'user',
      permalink: userMatch[1],
    };
  }

  return { type: null };
}

/**
 * Checks if a string is a valid SoundCloud URL
 */
export function isSoundCloudUrl(url: string): boolean {
  const parsed = parseSoundCloudUrl(url);
  return parsed.type !== null;
}
