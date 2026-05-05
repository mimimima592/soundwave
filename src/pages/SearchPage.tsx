import { useEffect, useState, useCallback, useRef } from 'react';
import { Search as SearchIcon, Link2, Users, ListMusic, Music2, Disc3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { scAPI } from '@/api/soundcloud';
import type { SCTrack, SCPlaylist, SCUser, SCResource } from '@/types/soundcloud';
import { PageHeader, EmptyState, Spinner, TrackRow, UserRow, RowSkeleton, TabBar } from '@/components/common/UI';
import { usePlayerStore } from '@/store/player';
import { hiResArtwork, formatCount, cn } from '@/utils/format';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useT } from '@/store/i18n';
import { usePageCacheStore } from '@/store/pageCache';
import { parseSoundCloudUrl, isSoundCloudUrl } from '@/utils/soundcloudUrl';

function isTrack(r: SCResource): r is SCTrack { return r.kind === 'track'; }
function isPlaylist(r: SCResource): r is SCPlaylist { return r.kind === 'playlist'; }
function isUser(r: SCResource): r is SCUser { return r.kind === 'user'; }

function addFallbackArtwork(p: SCPlaylist): SCPlaylist {
  if (!p.artwork_url && p.tracks?.length) {
    const t = p.tracks.find((t: any) => t.artwork_url);
    if (t) return { ...p, artwork_url: t.artwork_url };
  }
  return p;
}

function calcSkeletonRows() {
  return Math.max(Math.ceil((window.innerHeight - 250) / 60), 5); }

type Tab = 'all' | 'tracks' | 'people' | 'albums' | 'playlists';

// TABS перенесены внутрь SearchPage чтобы использовать t() из хука

const PAGE_SIZE = 20;
const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 5 минут
const ALL_LIMIT = 10; // на вкладке "Всё" берём по N от каждого типа

// ─── Карточка плейлиста/альбома ───────────────────────────────────────────────
function PlaylistCard({ playlist, onClick }: { playlist: SCPlaylist; onClick: () => void }) {
  const t = useT();
  const isAlbum = (playlist as any).is_album;
  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer hover:bg-surface-alt/50"
      onClick={onClick}
    >
      <div className="thumb-hover w-11 h-11 rounded-lg flex-shrink-0 bg-surface-alt shadow-sm"
      >
        {playlist.artwork_url
          ? <img src={hiResArtwork(playlist.artwork_url)} alt={playlist.title} className="w-full h-full object-cover" draggable={false} />
          : <div className="w-full h-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
              {isAlbum ? <Disc3 size={18} className="text-accent/50" /> : <ListMusic size={18} className="text-accent/50" />}
            </div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate group-hover:text-accent transition-colors leading-tight">{playlist.title}</div>
        <div className="text-xs text-text-dim mt-0.5 truncate">
          {playlist.user?.username && <span className="hover:text-accent cursor-pointer">{playlist.user.username}</span>}
          {playlist.track_count !== undefined && <span className="ml-1">· {playlist.track_count} {t('search_track_count')}</span>}
        </div>
      </div>
      {isAlbum
        ? <Disc3 size={14} className="text-text-dim flex-shrink-0" />
        : <ListMusic size={14} className="text-text-dim flex-shrink-0" />}
    </div>
  );
}

// ─── Секция с заголовком для вкладки "Всё" ───────────────────────────────────
function AllSection({ title, icon, children, onMore }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; onMore?: () => void;
}) {
  const t = useT();
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-bold" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "1rem", letterSpacing: "-0.02em" }}>
          {icon}
          {title}
        </div>
        {onMore && (
          <button onClick={onMore} className="text-sm text-accent hover:underline">
            {t('search_see_all')}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [skeletonRows] = useState(calcSkeletonRows);
  const [urlResolving, setUrlResolving] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const activeQueryRef = useRef('');
  const loadingMoreRef = useRef(false);

  // ── Данные по каждому типу ────────────────────────────────────────────────
  const [tracks, setTracks] = useState<SCTrack[]>([]);
  const [users, setUsers] = useState<SCUser[]>([]);
  const [albums, setAlbums] = useState<SCPlaylist[]>([]);
  const [playlists, setPlaylists] = useState<SCPlaylist[]>([]);

  const [tracksNext, setTracksNext] = useState<string | null>(null);
  const [usersNext, setUsersNext] = useState<string | null>(null);
  const [albumsNext, setAlbumsNext] = useState<string | null>(null);
  const [playlistsNext, setPlaylistsNext] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const setQueueLoader = usePlayerStore((s) => s.setQueueLoader);
  const t = useT();

  const TABS: { id: Tab; label: string }[] = [
    { id: 'all',       label: t('search_tab_all') },
    { id: 'tracks',    label: t('search_tab_tracks') },
    { id: 'people',    label: t('search_tab_people') },
    { id: 'albums',    label: t('search_tab_albums') },
    { id: 'playlists', label: t('search_tab_playlists') },
  ];

  // ── Сброс при смене запроса ───────────────────────────────────────────────
  const resetResults = () => {
    setTracks([]); setUsers([]); setAlbums([]); setPlaylists([]);
    setTracksNext(null); setUsersNext(null); setAlbumsNext(null); setPlaylistsNext(null);
  };

  // ── Разбить плейлисты на альбомы и плейлисты ─────────────────────────────
  const splitPlaylists = (collection: SCResource[]) => {
    const all = collection.filter(isPlaylist).map(addFallbackArtwork);
    return {
      albums: all.filter(p => (p as any).is_album),
      playlists: all.filter(p => !(p as any).is_album),
    };
  };

  // ── Типы кэша для каждой вкладки (раздельный кэш!) ──────────────────────
  type AllCache = { tracks: SCTrack[]; users: SCUser[]; albums: SCPlaylist[]; playlists: SCPlaylist[] };
  type TracksCache = { items: SCTrack[]; next: string | null };
  type UsersCache  = { items: SCUser[];  next: string | null };
  type PlsCache    = { items: SCPlaylist[]; next: string | null };

  // Кэш-ключи: раздельные для каждой вкладки, никогда не пересекаются
  const cacheKeys = (q: string) => ({
    all:       `search:${q}:all`,
    tracks:    `search:${q}:tracks`,
    people:    `search:${q}:people`,
    albums:    `search:${q}:albums`,
    playlists: `search:${q}:playlists`,
  });

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      resetResults(); setLoading(false); setError(null);
      activeQueryRef.current = ''; setActiveTab('all'); return;
    }

    const keys = cacheKeys(trimmed);
    const store = usePageCacheStore.getState();

    // ── Проверяем кэш для текущей вкладки (только её данные) ──
    if (activeTab === 'all') {
      const c = store.getPageCache<AllCache>(keys.all, SEARCH_CACHE_TTL);
      if (c) {
        setTracks(c.tracks); setUsers(c.users); setAlbums(c.albums); setPlaylists(c.playlists);
        setLoading(false); setError(null); activeQueryRef.current = trimmed;
        return;
      }
    } else if (activeTab === 'tracks') {
      const c = store.getPageCache<TracksCache>(keys.tracks, SEARCH_CACHE_TTL);
      if (c) { setTracks(c.items); setTracksNext(c.next); setLoading(false); setError(null); activeQueryRef.current = trimmed; return; }
    } else if (activeTab === 'people') {
      const c = store.getPageCache<UsersCache>(keys.people, SEARCH_CACHE_TTL);
      if (c) { setUsers(c.items); setUsersNext(c.next); setLoading(false); setError(null); activeQueryRef.current = trimmed; return; }
    } else if (activeTab === 'albums') {
      const c = store.getPageCache<PlsCache>(keys.albums, SEARCH_CACHE_TTL);
      if (c) { setAlbums(c.items); setAlbumsNext(c.next); setLoading(false); setError(null); activeQueryRef.current = trimmed; return; }
    } else if (activeTab === 'playlists') {
      const c = store.getPageCache<PlsCache>(keys.playlists, SEARCH_CACHE_TTL);
      if (c) { setPlaylists(c.items); setPlaylistsNext(c.next); setLoading(false); setError(null); activeQueryRef.current = trimmed; return; }
    }

    // ── Нет кэша — сразу показываем скелетон и чистим старые данные ──
    setLoading(true); setError(null); resetResults();
    activeQueryRef.current = trimmed;

    const timer = setTimeout(async () => {
      try {
        if (activeTab === 'all') {
          const [tracksRes, playlistsRes, usersRes] = await Promise.all([
            scAPI.search(trimmed, 'tracks', ALL_LIMIT, 0),
            scAPI.search(trimmed, 'playlists', ALL_LIMIT * 2, 0),
            scAPI.search(trimmed, 'users', ALL_LIMIT, 0),
          ]);
          if (activeQueryRef.current !== trimmed) return;
          const { albums: alb, playlists: pls } = splitPlaylists(playlistsRes.collection);
          const tracks = tracksRes.collection.filter(isTrack);
          const u = usersRes.collection.filter(isUser);
          setTracks(tracks); setUsers(u); setAlbums(alb); setPlaylists(pls);
          store.setPageCache(keys.all, { tracks, users: u, albums: alb, playlists: pls });

        } else if (activeTab === 'tracks') {
          const res = await scAPI.search(trimmed, 'tracks', PAGE_SIZE, 0);
          if (activeQueryRef.current !== trimmed) return;
          const items = res.collection.filter(isTrack);
          setTracks(items); setTracksNext(res.next_href);
          store.setPageCache(keys.tracks, { items, next: res.next_href });

        } else if (activeTab === 'people') {
          const res = await scAPI.search(trimmed, 'users', PAGE_SIZE, 0);
          if (activeQueryRef.current !== trimmed) return;
          const items = res.collection.filter(isUser);
          setUsers(items); setUsersNext(res.next_href);
          store.setPageCache(keys.people, { items, next: res.next_href });

        } else if (activeTab === 'albums') {
          const res = await scAPI.search(trimmed, 'playlists', PAGE_SIZE, 0);
          if (activeQueryRef.current !== trimmed) return;
          const { albums: alb } = splitPlaylists(res.collection);
          setAlbums(alb); setAlbumsNext(res.next_href);
          store.setPageCache(keys.albums, { items: alb, next: res.next_href });

        } else if (activeTab === 'playlists') {
          const res = await scAPI.search(trimmed, 'playlists', PAGE_SIZE, 0);
          if (activeQueryRef.current !== trimmed) return;
          const { playlists: pls } = splitPlaylists(res.collection);
          setPlaylists(pls); setPlaylistsNext(res.next_href);
          store.setPageCache(keys.playlists, { items: pls, next: res.next_href });
        }
      } catch (err) {
        if (activeQueryRef.current === trimmed) setError((err as Error).message);
      } finally {
        if (activeQueryRef.current === trimmed) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, activeTab]);

  // ── Загрузка следующей страницы ───────────────────────────────────────────
  const currentNext = activeTab === 'tracks' ? tracksNext
    : activeTab === 'people' ? usersNext
    : activeTab === 'albums' ? albumsNext
    : activeTab === 'playlists' ? playlistsNext
    : null; // "all" не пагинируется

  const hasMore = Boolean(currentNext) && activeTab !== 'all';

  const loadMore = useCallback(async () => {
    const trimmed = query.trim();
    if (loadingMoreRef.current || loading || !currentNext || trimmed.length < 2) return;
    loadingMoreRef.current = true; setLoadingMore(true);
    try {
      const res = await scAPI.fetchNext<SCResource>(currentNext);
      if (activeQueryRef.current !== trimmed) return;

      // Обновляем state и кэш для текущей вкладки
      const store = usePageCacheStore.getState();
      const keys = cacheKeys(trimmed);

      if (activeTab === 'tracks') {
        const newItems = res.collection.filter(isTrack);
        setTracks(p => { const s = new Set(p.map(t => t.id)); const merged = [...p, ...newItems.filter(t => !s.has(t.id))]; store.setPageCache(keys.tracks, { items: merged, next: res.next_href }); return merged; });
        setTracksNext(res.next_href);
      } else if (activeTab === 'people') {
        const newItems = res.collection.filter(isUser);
        setUsers(p => { const s = new Set(p.map(u => u.id)); const merged = [...p, ...newItems.filter(u => !s.has(u.id))]; store.setPageCache(keys.people, { items: merged, next: res.next_href }); return merged; });
        setUsersNext(res.next_href);
      } else if (activeTab === 'albums') {
        const { albums: alb } = splitPlaylists(res.collection);
        setAlbums(p => { const s = new Set(p.map(x => x.id)); const merged = [...p, ...alb.filter(x => !s.has(x.id))]; store.setPageCache(keys.albums, { items: merged, next: res.next_href }); return merged; });
        setAlbumsNext(res.next_href);
      } else if (activeTab === 'playlists') {
        const { playlists: pls } = splitPlaylists(res.collection);
        setPlaylists(p => { const s = new Set(p.map(x => x.id)); const merged = [...p, ...pls.filter(x => !s.has(x.id))]; store.setPageCache(keys.playlists, { items: merged, next: res.next_href }); return merged; });
        setPlaylistsNext(res.next_href);
      }
    } catch (err) {
      console.error('Ошибка догрузки:', err);
    } finally {
      loadingMoreRef.current = false; setLoadingMore(false);
    }
  }, [query, loading, currentNext, activeTab]);


  const loadMoreRef = useInfiniteScroll(loadMore, { enabled: hasMore });

  // Регистрируем queueLoader для треков в поиске
  const currentNextRef = useRef(currentNext);
  currentNextRef.current = currentNext;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  useEffect(() => {
    if (activeTab !== 'tracks' || !tracksNext) { setQueueLoader(null); return; }
    setQueueLoader(async () => {
      const href = currentNextRef.current;
      if (!href || activeTabRef.current !== 'tracks') return [];
      const res = await scAPI.fetchNext<SCResource>(href);
      const newTracks = res.collection.filter(isTrack);
      setTracks((p) => { const s = new Set(p.map((t) => t.id)); return [...p, ...newTracks.filter((t) => !s.has(t.id))]; });
      setTracksNext(res.next_href);
      return newTracks;
    });
    return () => setQueueLoader(null);
  }, [activeTab, tracksNext, setQueueLoader]);

  // ── URL-резолвер ──────────────────────────────────────────────────────────
  const handleUrlResolution = useCallback(async (url: string) => {
    const parsed = parseSoundCloudUrl(url);
    if (!parsed.type) { setUrlError(t('search_invalid_link')); setTimeout(() => setUrlError(null), 3000); return; }
    setUrlResolving(true); setUrlError(null);
    try {
      const resolved = await scAPI.resolveUrl(url);
      if (!resolved?.id) throw new Error(t('content_not_found'));
      switch (resolved.kind) {
        case 'track': navigate(`/track/${resolved.id}`); break;
        case 'playlist': navigate(`/playlist/${resolved.id}`); break;
        case 'user': navigate(`/user/${resolved.id}`); break;
        default: throw new Error(t('content_unsupported'));
      }
      setQuery('');
    } catch {
      setUrlError(t('link_invalid'));
      setTimeout(() => setUrlError(null), 3000);
    } finally { setUrlResolving(false); }
  }, [navigate, t]);

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (isSoundCloudUrl(trimmed)) handleUrlResolution(trimmed);
  }, [query, handleUrlResolution]);

  // ── Результаты для текущей вкладки ────────────────────────────────────────
  const isEmpty = !loading && !error && query.length >= 2 && (
    (activeTab === 'all'       && tracks.length === 0 && users.length === 0 && albums.length === 0 && playlists.length === 0) ||
    (activeTab === 'tracks'    && tracks.length === 0) ||
    (activeTab === 'people'    && users.length === 0) ||
    (activeTab === 'albums'    && albums.length === 0) ||
    (activeTab === 'playlists' && playlists.length === 0)
  );

  // ── Рендер строки трека ───────────────────────────────────────────────────
  const renderTrackRow = (track: SCTrack, queue: SCTrack[], idx: number) => {
    const isCurrent = currentTrack?.id === track.id;
    return (
      <TrackRow
        key={`track-${track.id}`}
        track={track}
        isCurrent={isCurrent}
        isPlaying={isPlaying}
        onPlay={() => { if (isCurrent) togglePlay(); else playTrack(track, queue, idx); }}
        onNavigateTrack={() => navigate(`/track/${track.id}`)}
        onNavigateUser={track.user?.id ? () => navigate(`/user/${track.user!.id}`) : undefined}
      />
    );
  };

  return (
    <div>
      <PageHeader title={t('search_title')} subtitle={t('search_subtitle')} />

      {/* Поисковая строка */}
      <div className="relative mb-6 max-w-2xl overflow-hidden">
        <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none" />
        <form onSubmit={handleSearchSubmit}>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setUrlError(null); }}
            placeholder={t('search_placeholder')}
            className={cn(
              'w-full pl-12 pr-10 py-3.5 bg-surface/80 border rounded-xl text-sm placeholder:text-text-dim focus:border-accent transition-colors',
              isSoundCloudUrl(query.trim()) && 'border-accent/50',
              urlError && 'border-red-500/50'
            )}
          />
        </form>
        {urlResolving && <div className="absolute right-4 top-1/2 -translate-y-1/2"><Spinner size={16} /></div>}
        {isSoundCloudUrl(query.trim()) && !urlResolving && <Link2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-accent" />}
      </div>

      {urlError && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{urlError}</div>}

      {/* Вкладки — показываем только когда есть что-то для показа */}
      {query.length >= 2 && (
        <TabBar tabs={TABS} active={activeTab} onChange={(id) => setActiveTab(id)} />
      )}

      {/* Состояния */}
      {!query.trim().length || query.length < 2 ? (
        <EmptyState icon={<SearchIcon size={48} />} title={t('search_start')} description={t('search_start_hint')} />
      ) : loading ? (
        <div className="space-y-1">{Array.from({ length: skeletonRows }, (_, i) => <RowSkeleton key={i} />)}</div>
      ) : error ? (
        <EmptyState title={t('search_error')} description={error} />
      ) : isEmpty ? (
        <EmptyState title={t('nothing_found')} description={`По запросу «${query.length > 60 ? query.slice(0, 60) + '…' : query}» результатов нет`} />
      ) : (

        <div className="animate-slide-up">

          {/* ── Вкладка: Всё ── */}
          {activeTab === 'all' && (
            <div>
              {tracks.length > 0 && (
                <AllSection
                  title={t('search_section_tracks')}
                  icon={<Music2 size={16} className="text-text-dim" />}
                  onMore={tracks.length >= ALL_LIMIT ? () => setActiveTab('tracks') : undefined}
                >
                  <div className="space-y-1">
                    {tracks.map((track, i) => renderTrackRow(track, tracks, i))}
                  </div>
                </AllSection>
              )}

              {users.length > 0 && (
                <AllSection
                  title={t('search_section_people')}
                  icon={<Users size={16} className="text-text-dim" />}
                  onMore={users.length >= ALL_LIMIT ? () => setActiveTab('people') : undefined}
                >
                  <div className="space-y-1">
                    {users.map(u => (
                      <UserRow key={u.id} user={u} onClick={() => navigate(`/user/${u.id}`)} />
                    ))}
                  </div>
                </AllSection>
              )}

              {albums.length > 0 && (
                <AllSection
                  title={t('search_section_albums')}
                  icon={<Disc3 size={16} className="text-text-dim" />}
                  onMore={albums.length >= ALL_LIMIT ? () => setActiveTab('albums') : undefined}
                >
                  <div className="space-y-1">
                    {albums.slice(0, ALL_LIMIT).map(p => (
                      <PlaylistCard key={p.id} playlist={p} onClick={() => navigate(`/playlist/${p.id}`)} />
                    ))}
                  </div>
                </AllSection>
              )}

              {playlists.length > 0 && (
                <AllSection
                  title={t('playlist_section')}
                  icon={<ListMusic size={16} className="text-text-dim" />}
                  onMore={playlists.length >= ALL_LIMIT ? () => setActiveTab('playlists') : undefined}
                >
                  <div className="space-y-1">
                    {playlists.slice(0, ALL_LIMIT).map(p => (
                      <PlaylistCard key={p.id} playlist={p} onClick={() => navigate(`/playlist/${p.id}`)} />
                    ))}
                  </div>
                </AllSection>
              )}
            </div>
          )}

          {/* ── Вкладка: Треки ── */}
          {activeTab === 'tracks' && (
            <div className="space-y-1">
              {tracks.map((track, i) => renderTrackRow(track, tracks, i))}
            </div>
          )}

          {/* ── Вкладка: Люди ── */}
          {activeTab === 'people' && (
            <div className="space-y-1">
              {users.map(u => (
                <UserRow key={u.id} user={u} onClick={() => navigate(`/user/${u.id}`)} />
              ))}
            </div>
          )}

          {/* ── Вкладка: Альбомы ── */}
          {activeTab === 'albums' && (
            <div className="space-y-1">
              {albums.map(p => (
                <PlaylistCard key={p.id} playlist={p} onClick={() => navigate(`/playlist/${p.id}`)} />
              ))}
            </div>
          )}

          {/* ── Вкладка: Плейлисты ── */}
          {activeTab === 'playlists' && (
            <div className="space-y-1">
              {playlists.map(p => (
                <PlaylistCard key={p.id} playlist={p} onClick={() => navigate(`/playlist/${p.id}`)} />
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={loadMoreRef} className="flex justify-center py-4">
            {loadingMore && <Spinner />}
          </div>
        </div>
      )}
    </div>
  );
}
