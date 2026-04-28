import { scAPI } from '@/api/soundcloud';
import type { SCTrack } from '@/types/soundcloud';
import { useHistoryStore } from '@/store/history';

// ─── Константы ────────────────────────────────────────────────────────────────

const SEED_COUNT              = 50;
const INSTANT_RELATED_LIMIT   = 10;
const DEEP_RELATED_LIMIT      = 15;
const DEEP_SEED_COUNT         = 8;
const REFUEL_THRESHOLD        = 4;
const MAX_ARTIST_TRACKS       = 2;
const COOLDOWN_HOURS          = 48;
const SEEDS_CACHE_TTL         = 5 * 60 * 1000;
const MIXED_SELECTIONS_WEIGHT = 0.4;
const LANG_ACTIVATION         = 0.35;
const LANG_DIVERSITY          = 0.15;

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface LangProfile {
  prefersCyrillic: boolean;
  dominantCountries: Set<string>;
}

interface ScoredTrack { track: SCTrack; score: number; }

export interface WaveState {
  // Полная очередь — все треки которые были подобраны (включая сыгранные)
  queue: SCTrack[];
  // Индекс следующего трека для воспроизведения
  currentIndex: number;
  isGenerating: boolean;
  isDeepScanning: boolean;
  seeds: SCTrack[];
  likedIds: Set<number>;
  cachedSeeds: SCTrack[];
  seedsCacheTime: number;
  userGenres: Set<string>;
  langProfile: LangProfile | null;
  isAutonomous: boolean;
  mixedSelectionsTracks: SCTrack[];
}

// ─── WaveManager ──────────────────────────────────────────────────────────────

export class WaveManager {
  private state: WaveState = {
    queue: [],
    currentIndex: 0,
    isGenerating: false,
    isDeepScanning: false,
    seeds: [],
    likedIds: new Set(),
    cachedSeeds: [],
    seedsCacheTime: 0,
    userGenres: new Set(),
    langProfile: null,
    isAutonomous: false,
    mixedSelectionsTracks: [],
  };

  // Единственный источник правды — Set ID всех треков которые уже были
  // в очереди за эту сессию (включая сыгранные). Никогда не сбрасывается.
  private sessionQueuedIds = new Set<number>();

  private listeners = new Set<(state: WaveState) => void>();
  private refuelPromise: Promise<void> | null = null;
  // Seed-ротация: при каждом refresh используем разный срез из пула лайков
  private seedRotationOffset = 0;

  constructor() {
    this.loadLikedIds();
  }

  // ─── Публичный API ───────────────────────────────────────────────────────────

  subscribe(listener: (state: WaveState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  updateLikedTrackIds(ids: Set<number>) {
    this.state.likedIds = ids;
  }

  getCurrentState(): WaveState {
    return { ...this.state };
  }

  getTuningStatus(): string {
    if (this.state.isGenerating)   return 'Подбираю первый трек...';
    if (this.state.isDeepScanning) return 'Анализирую вкусы...';
    const upcoming = this.state.queue.length - this.state.currentIndex;
    if (this.state.isAutonomous && upcoming > 0) return `${upcoming} треков впереди`;
    return this.state.seeds.length > 0 ? `На основе ${this.state.seeds.length} лайков` : 'Ожидание...';
  }

  /**
   * Возвращает только ещё не сыгранные треки (для отображения в UI).
   */
  getUpcomingTracks(): SCTrack[] {
    return this.state.queue.slice(this.state.currentIndex);
  }

  async startWave() {
    if (this.state.queue.length === 0) await this.refreshWave();
  }

  async refreshWave() {
    // При refresh сбрасываем очередь и позицию, но sessionQueuedIds ОСТАЁТСЯ —
    // это гарантирует что треки из предыдущих refresh не повторятся.
    this.state.queue        = [];
    this.state.currentIndex = 0;
    this.state.isAutonomous = true;
    this.refuelPromise      = null;

    // Сбрасываем кеш seeds чтобы при следующем fetchSeeds взять свежие данные
    // и выбрать другой набор seeds из пула лайков
    this.state.cachedSeeds    = [];
    this.state.seedsCacheTime = 0;
    // Сдвигаем ротацию — каждый refresh выбирает seeds из другой части пула
    this.seedRotationOffset   = (this.seedRotationOffset + Math.ceil(DEEP_SEED_COUNT / 2)) % SEED_COUNT;

    this.notify();

    const instant = await this.generateInstant();
    this.addToQueue(instant);

    // Deep scan в фоне
    this.deepScan().catch(e => console.error('[Wave] deepScan error:', e));
  }

  /**
   * Получить следующий трек. Вызывается из player store при переключении.
   * Если треков не осталось — запускает deep scan и ждёт.
   */
  async getNextTrack(): Promise<SCTrack | null> {
    // Проактивный рефуел
    this.maybeRefuel();

    // Если очередь кончилась — форсируем deep scan
    if (this.state.currentIndex >= this.state.queue.length) {
      if (!this.state.isDeepScanning && !this.refuelPromise) {
        this.refuelPromise = this.deepScan().finally(() => { this.refuelPromise = null; });
      }
      if (this.refuelPromise) await this.refuelPromise;
      // Если после deep scan всё ещё пусто — ничего не нашли
      if (this.state.currentIndex >= this.state.queue.length) return null;
    }

    const track = this.state.queue[this.state.currentIndex];
    this.state.currentIndex++;
    this.notify();
    return track;
  }

  async requestMoreTracks() {
    if (this.state.isDeepScanning) return;
    await this.deepScan();
  }

  // ─── Приватное ───────────────────────────────────────────────────────────────

  private loadLikedIds() {
    try {
      const stored = localStorage.getItem('allLikedIds');
      if (stored) {
        const ids = JSON.parse(stored) as (number | string)[];
        this.state.likedIds = new Set(ids.filter((id): id is number => typeof id === 'number'));
      }
    } catch {}
  }

  // ─── Seeds ───────────────────────────────────────────────────────────────────

  private async fetchSeeds(): Promise<SCTrack[]> {
    const now = Date.now();
    if (this.state.cachedSeeds.length > 0 && now - this.state.seedsCacheTime < SEEDS_CACHE_TTL) {
      return this.state.cachedSeeds;
    }
    try {
      const me = await scAPI.getMe();
      // /users/{id}/likes использует курсорную пагинацию — числовой offset не поддерживается.
      // Берём всегда первые SEED_COUNT лайков (самые свежие), разнообразие достигается
      // случайным выбором seeds из этого пула в deep scan.
      const likes = await scAPI.getUserLikes(me.id, SEED_COUNT, 0);
      const seeds = likes.collection.map((item: any) => item.track).filter(Boolean) as SCTrack[];

      this.state.cachedSeeds    = seeds;
      this.state.seedsCacheTime = now;
      this.state.seeds          = seeds;

      this.buildGenreProfile(seeds);
      this.state.langProfile = this.buildLangProfile(seeds);
      return seeds;
    } catch (e) {
      console.error('[Wave] fetchSeeds error:', e);
      return this.state.cachedSeeds;
    }
  }

  private buildGenreProfile(seeds: SCTrack[]) {
    const g = new Set<string>();
    for (const t of seeds) { if (t.genre) g.add(t.genre.toLowerCase()); }
    this.state.userGenres = g;
  }

  private buildLangProfile(seeds: SCTrack[]): LangProfile {
    if (!seeds.length) return { prefersCyrillic: false, dominantCountries: new Set() };
    const re = /[\u0400-\u04FF]/;
    let cnt = 0;
    const ccMap = new Map<string, number>();
    for (const t of seeds) {
      if (re.test(t.title) || re.test(t.user?.username ?? '')) cnt++;
      const cc = t.user?.country_code?.toLowerCase();
      if (cc) ccMap.set(cc, (ccMap.get(cc) ?? 0) + 1);
    }
    const ratio = cnt / seeds.length;
    const dominant = new Set([...ccMap.entries()]
      .filter(([, n]) => n >= seeds.length * 0.08).map(([cc]) => cc));
    console.log('[Wave] Lang:', (ratio * 100).toFixed(0) + '%', [...dominant]);
    return { prefersCyrillic: ratio >= LANG_ACTIVATION, dominantCountries: dominant };
  }

  // ─── Источники ───────────────────────────────────────────────────────────────

  private async fetchRelated(id: number, limit = DEEP_RELATED_LIMIT): Promise<SCTrack[]> {
    try { return (await scAPI.getRelatedTracks(id, limit)).collection ?? []; } catch { return []; }
  }

  private async fetchMixedSelections(): Promise<SCTrack[]> {
    try {
      const res = await scAPI.getMixedSelections();
      const tracks: SCTrack[] = [];
      for (const s of (res as any).collection ?? []) tracks.push(...((s.tracks ?? []) as SCTrack[]));
      this.state.mixedSelectionsTracks = tracks;
      return tracks;
    } catch { return []; }
  }

  private async fetchStreamTracks(): Promise<SCTrack[]> {
    try {
      return (await scAPI.getStream(30)).collection
        .map((i: any) => i.track)
        .filter((t: any): t is SCTrack => !!t?.id);
    } catch { return []; }
  }

  private async fetchTrendingFallback(): Promise<SCTrack[]> {
    try {
      const res = await scAPI.getCharts('trending', 'all-music', 50);
      let tracks = res.collection.map(i => i.track);
      if (this.state.userGenres.size > 0) {
        const byGenre = tracks.filter(t => this.state.userGenres.has(t.genre?.toLowerCase() ?? ''));
        if (byGenre.length >= 10) tracks = byGenre;
      }
      return tracks;
    } catch { return []; }
  }

  // ─── Stage 1: Instant ────────────────────────────────────────────────────────

  private async generateInstant(): Promise<SCTrack[]> {
    this.state.isGenerating = true;
    this.notify();
    try {
      const seeds = await this.fetchSeeds();
      if (!seeds.length) return this.filterNew(await this.fetchTrendingFallback()).slice(0, 1);
      const seed    = this.pickRandom(seeds.slice(0, 15), 1)[0];
      const related = await this.fetchRelated(seed.id, INSTANT_RELATED_LIMIT);
      const result  = this.filterNew(related).slice(0, 1);
      return result.length ? result : this.filterNew([seed]).slice(0, 1);
    } finally {
      this.state.isGenerating = false;
      this.notify();
    }
  }

  // ─── Stage 2: Deep scan ──────────────────────────────────────────────────────

  private async deepScan(): Promise<void> {
    if (this.state.isDeepScanning) return;
    this.state.isDeepScanning = true;
    this.notify();
    try {
      const seeds = await this.fetchSeeds();
      if (!seeds.length) {
        this.addToQueue(this.filterNew(await this.fetchTrendingFallback()));
        return;
      }

      const recentHistory = useHistoryStore.getState().entries.slice(0, 10).map(e => e.track);
      // Ротируем начальную точку выбора чтобы каждый refresh давал другие related
      const rotated    = [...seeds.slice(this.seedRotationOffset), ...seeds.slice(0, this.seedRotationOffset)];
      const freshSeeds = this.pickRandom(rotated.slice(0, 20), Math.ceil(DEEP_SEED_COUNT * 0.5));
      const olderSeeds = this.pickRandom(rotated.slice(20), Math.floor(DEEP_SEED_COUNT * 0.5));
      const selected   = this.shuffle([...freshSeeds, ...olderSeeds]);

      const [relatedResults, mixed, stream] = await Promise.all([
        Promise.all(selected.map(s => this.fetchRelated(s.id, DEEP_RELATED_LIMIT))),
        this.fetchMixedSelections(),
        this.fetchStreamTracks(),
      ]);

      const related = relatedResults.flat();
      console.log('[Wave] Sources: related', related.length, '| mixed', mixed.length, '| stream', stream.length);

      const mixedSlice  = this.pickRandom(mixed,  Math.floor(mixed.length  * MIXED_SELECTIONS_WEIGHT));
      const streamSlice = this.pickRandom(stream, Math.floor(stream.length * 0.3));
      const all         = [...related, ...mixedSlice, ...streamSlice, ...seeds, ...recentHistory];

      let filtered = this.dedup(all);
      filtered     = this.filterNew(filtered);         // главный фильтр — не было в сессии
      filtered     = this.filterLang(filtered);
      filtered     = this.filterArtistDiversity(filtered);

      const scored = this.scoreTracks(filtered, mixed, stream);
      this.addToQueue(scored);
      console.log('[Wave] Deep scan done. Total queue:', this.state.queue.length, '| upcoming:', this.state.queue.length - this.state.currentIndex);
    } catch (e) {
      console.error('[Wave] deepScan error:', e);
    } finally {
      this.state.isDeepScanning = false;
      this.notify();
    }
  }

  // ─── Рефуел ──────────────────────────────────────────────────────────────────

  private maybeRefuel() {
    const upcoming = this.state.queue.length - this.state.currentIndex;
    if (upcoming <= REFUEL_THRESHOLD && !this.state.isDeepScanning && !this.refuelPromise) {
      this.refuelPromise = this.deepScan().finally(() => { this.refuelPromise = null; });
    }
  }

  // ─── Скоринг ─────────────────────────────────────────────────────────────────

  private scoreTracks(tracks: SCTrack[], mixed: SCTrack[], stream: SCTrack[]): SCTrack[] {
    const mixedIds  = new Set(mixed.map(t => t.id));
    const streamIds = new Set(stream.map(t => t.id));
    return tracks
      .map(track => {
        const plays   = Math.log1p(track.playback_count    ?? 0);
        const likes   = Math.log1p(track.favoritings_count ?? 0) * 1.5;
        const reposts = Math.log1p(track.reposts_count     ?? 0) * 1.2;
        let score     = plays + likes + reposts;
        if (this.state.userGenres.has(track.genre?.toLowerCase() ?? '')) score *= 1.3;
        if (mixedIds.has(track.id))  score *= 1.5;
        if (streamIds.has(track.id)) score *= 1.2;
        score *= 0.8 + Math.random() * 0.4;
        return { track, score } as ScoredTrack;
      })
      .sort((a, b) => b.score - a.score)
      .map(s => s.track);
  }

  // ─── Фильтры ─────────────────────────────────────────────────────────────────

  /**
   * Главный фильтр сессии. Отсеивает:
   * - лайкнутые треки пользователя
   * - треки которые уже были в очереди за ЭТУ СЕССИЮ (sessionQueuedIds)
   * - треки из истории прослушиваний (последние 48ч)
   */
  private filterNew(tracks: SCTrack[]): SCTrack[] {
    const history   = useHistoryStore.getState().entries;
    const cutoff    = Date.now() - COOLDOWN_HOURS * 3_600_000;
    const recentIds = new Set(history.filter(e => e.playedAt > cutoff).map(e => e.track.id));

    return tracks.filter(t =>
      !this.state.likedIds.has(t.id)    &&
      !this.sessionQueuedIds.has(t.id)  &&  // ключевой фильтр — вся сессия
      !recentIds.has(t.id)
    );
  }

  private filterLang(tracks: SCTrack[]): SCTrack[] {
    const p = this.state.langProfile;
    if (!p?.prefersCyrillic) return tracks;
    const re = /[\u0400-\u04FF]/;
    const ok = (t: SCTrack) =>
      re.test(t.title) || re.test(t.user?.username ?? '') ||
      !!(t.user?.country_code && p.dominantCountries.has(t.user.country_code.toLowerCase()));
    const pass = tracks.filter(ok);
    const fail = tracks.filter(t => !ok(t));
    return this.shuffle([...pass, ...this.pickRandom(fail, Math.floor(pass.length * LANG_DIVERSITY))]);
  }

  private filterArtistDiversity(tracks: SCTrack[]): SCTrack[] {
    const counts = new Map<number, number>();
    return tracks.filter(t => {
      const id  = t.user?.id;
      if (!id) return true;
      const cnt = counts.get(id) ?? 0;
      if (cnt >= MAX_ARTIST_TRACKS) return false;
      counts.set(id, cnt + 1);
      return true;
    });
  }

  // ─── Утилиты ─────────────────────────────────────────────────────────────────

  private dedup(tracks: SCTrack[]): SCTrack[] {
    const seen = new Set<number>();
    return tracks.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
  }

  /**
   * Добавить треки в очередь и зарегистрировать их в sessionQueuedIds.
   * Треки которые уже были в сессии — пропускаются.
   */
  private addToQueue(tracks: SCTrack[]) {
    const fresh = tracks.filter(t => !this.sessionQueuedIds.has(t.id));
    if (!fresh.length) return;
    for (const t of fresh) this.sessionQueuedIds.add(t.id);
    this.state.queue.push(...fresh);
    this.notify();
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private pickRandom<T>(arr: T[], count: number): T[] {
    return this.shuffle(arr).slice(0, Math.max(0, count));
  }

  private notify() {
    this.listeners.forEach(l => l(this.state));
  }
}

export const waveManager = new WaveManager();
