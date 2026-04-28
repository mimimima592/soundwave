// Типы, описывающие ответы SoundCloud API.
// Это упрощённые версии — реальные ответы содержат больше полей.

export interface SCUser {
  id: number;
  kind: 'user';
  permalink: string;
  permalink_url: string;
  username: string;
  full_name?: string;
  avatar_url: string;
  country_code?: string | null;
  city?: string | null;
  description?: string | null;
  followers_count?: number;
  followings_count?: number;
  track_count?: number;
  likes_count?: number;
  playlist_count?: number;
  reposts_count?: number;
  verified?: boolean;
  following?: boolean;
}

export interface SCTrackFormat {
  protocol: 'progressive' | 'hls' | 'encrypted-hls';
  mime_type: string;
}

export interface SCTranscoding {
  url: string;
  preset: string;
  duration: number;
  snipped: boolean;
  format: SCTrackFormat;
  quality: string;
}

export interface SCMedia {
  transcodings: SCTranscoding[];
}

export interface SCTrack {
  id: number;
  kind: 'track' | 'playlist';
  permalink: string;
  permalink_url: string;
  title: string;
  description?: string | null;
  duration: number; // миллисекунды
  full_duration?: number;
  artwork_url: string | null;
  waveform_url?: string;
  stream_url?: string;
  streamable: boolean;
  downloadable?: boolean;
  genre?: string | null;
  tag_list?: string;
  playback_count?: number;
  favoritings_count?: number;
  comment_count?: number;
  reposts_count?: number;
  created_at: string;
  user: SCUser;
  media: SCMedia;
  monetization_model?: string;
  policy?: string;
  // Поля для плейлистов (dynamic playlists из mixed-selections)
  tracks?: SCTrack[]; // коллекция треков внутри плейлиста
  playlistTitle?: string; // название подборки для Discord RPC
  playlistDescription?: string; // описание подборки (используется как имя артиста)
  urn?: string; // URN для системных плейлистов (например, soundcloud:system-playlists:personalized-tracks:...)
  isSystemPlaylist?: boolean; // Флаг для системных плейлистов
}

export interface SCPlaylist {
  id: number;
  kind: 'playlist' | 'system-playlist';
  permalink: string;
  permalink_url: string;
  title: string;
  description?: string | null;
  duration: number;
  artwork_url: string | null;
  tracks: SCTrack[];
  track_count: number;
  user: SCUser;
  created_at: string;
  is_album?: boolean;
  urn?: string; // URN для системных плейлистов
  isSystemPlaylist?: boolean; // Флаг для системных плейлистов
}

export type SCResource = SCTrack | SCPlaylist | SCUser;

export interface SCCollection<T> {
  collection: T[];
  next_href: string | null;
  query_urn?: string;
  total_results?: number;
}

export interface SCStreamAuth {
  url: string;
}

export interface SCComment {
  id: number;
  kind: 'comment';
  body: string;
  timestamp: number; // миллисекунды от начала трека
  created_at: string;
  user: SCUser;
  track_id: number;
}
