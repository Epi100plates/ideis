'use strict';
/**
 * Rejestr grup: leniwe tworzenie stanu per grupa + limit pamięci.
 * Jedna grupa = VersionStore (historia w RAM) + PlanCache (plik na dysku).
 *
 * Serwer nie ma „aktualnej grupy” — grupa jest parametrem każdego zapytania.
 * Klucz wpisu to numer grupy, a przy przeglądaniu starszego naboru
 * „numer@rok” (np. „21188@2025”), bo ten sam numer grupy ma inny plan
 * w każdym roku akademickim.
 *
 * Dzięki temu jedna instancja obsługuje całą uczelnię, a pamięć zajmują tylko
 * grupy, które ktoś ostatnio otwierał.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { PlanCache } = require('./cache');
const { VersionStore } = require('./versions');

const CACHE_DIR = process.env.CACHE_DIR || path.join(process.cwd(), '.cache');

/** „21188” albo „21188@2025” — tylko cyfry, żeby nie wyjść poza katalog cache. */
const ENTRY_ID_RE = /^\d{2,8}(@\d{4})?$/;

class GroupRegistry {
  /**
   * @param {{maxVersions?:number, pinnedMaxVersions?:number, pinned?:string|null,
   *          maxActive?:number, idleDays?:number, cacheTtlMs?:number}} opts
   */
  constructor({
    maxVersions = 40,
    pinnedMaxVersions = 200,
    pinned = null,
    maxActive = 8,
    idleDays = 14,
    cacheTtlMs = 24 * 60 * 60 * 1000,
    cacheDir = CACHE_DIR,
  } = {}) {
    this.maxVersions = Math.max(1, maxVersions);
    this.pinnedMaxVersions = Math.max(1, pinnedMaxVersions);
    this.pinned = pinned ? String(pinned) : null;
    this.maxActive = Math.max(1, maxActive);
    this.cacheTtlMs = cacheTtlMs;
    this.idleMs = Math.max(1, idleDays) * 24 * 3600 * 1000;
    this.cacheDir = cacheDir;
    this.map = new Map();          // id -> entry
    this.watchedFile = path.join(cacheDir, 'watched.json');
  }

  /** Stan grupy; tworzy przy pierwszym użyciu, zwalniając miejsce przed utworzeniem. */
  get(groupId) {
    const id = String(groupId);
    // Klucz wpisu bywa „21188@2025” (starszy nabór) — w odpowiedziach API
    // pokazujemy sam numer grupy, bez sufiksu roku akademickiego.
    const bareId = id.split('@')[0];
    let entry = this.map.get(id);
    if (!entry) {
      // Twardy limit już przy tworzeniu wpisu. Samo `evict()` w tle to za mało:
      // między tickami dowolny nowy numer grupy powiększał mapę i RAM bez granicy.
      this.#makeRoom();
      entry = {
        id,
        store: new VersionStore({
          max: bareId === this.pinned ? this.pinnedMaxVersions : this.maxVersions,
          groupId: bareId,
        }),
        cache: new PlanCache({
          ttlMs: this.cacheTtlMs,
          file: path.join(this.cacheDir, `plan-${id}.json`),
        }),
        lastUsed: Date.now(),
        lastForceAt: 0,
        seeded: false,
        loadPromise: null,
      };
      this.map.set(id, entry);
    }
    entry.lastUsed = Date.now();
    return entry;
  }

  /**
   * Zwalnia miejsce na nowy wpis: usuwa najdawniej używaną grupę.
   * Grupa przypięta (`pinned`) nigdy nie wypada; przy `maxActive: 1` mapa
   * może więc chwilowo mieć dwa wpisy.
   */
  #makeRoom() {
    if (this.map.size < this.maxActive) return;
    const victims = [...this.map.values()]
      .filter((e) => e.id !== this.pinned)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    while (this.map.size >= this.maxActive && victims.length) {
      const victim = victims.shift();
      this.map.delete(victim.id);
      this.#dropFile(victim);
    }
  }

  /**
   * Usuwa plik cache wypadającej grupy.
   *
   * `MAX_ACTIVE_GROUPS` chronił tylko pamięć — pliki `plan-*.json` zostawały
   * na dysku, więc jedno żądanie `?group=` zostawiało ~250 kB, a enumeracja
   * numerów zapełniała wolumen VPS. Nie czekamy na wynik: wpis już nie istnieje,
   * a błąd usunięcia nie może wywrócić żądania.
   */
  #dropFile(entry) {
    fs.rm(entry.cache.file, { force: true }).catch((err) => {
      console.warn('[registry] nie udało się usunąć cache:', err.message);
    });
  }

  /**
   * Sprząta pliki `plan-*.json` grup, których nie ma już w rejestrze.
   * Wołane raz po starcie — łapie to, co zostało po wcześniejszych wersjach
   * (bez GC) i po grupach dodanych z linku, a potem wypartych.
   */
  async sweepOrphans(dir = this.cacheDir) {
    let names = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      return 0;
    }
    let removed = 0;
    for (const name of names) {
      const match = /^plan-(.+)\.json$/.exec(name);
      if (!match) continue;
      const id = match[1];
      if (!ENTRY_ID_RE.test(id) || this.map.has(id)) continue;
      try {
        await fs.rm(path.join(dir, name), { force: true });
        removed += 1;
      } catch { /* plik mógł już zniknąć */ }
    }
    return removed;
  }

  has(groupId) { return this.map.has(String(groupId)); }

  /**
   * Wczytuje plan z dysku przy pierwszym dotknięciu grupy.
   *
   * Grupy dodane leniwie (np. z linku ?group=21189 po restarcie) nie są
   * wczytywane przez start(), więc bez tego pierwsze wejście pytałoby
   * uczelnię od zera, mimo że plan leży już w pliku cache.
   */
  async ensureLoaded(entry) {
    if (!entry.loadPromise) {
      entry.loadPromise = (async () => {
        const loaded = await entry.cache.load();
        if (loaded && entry.cache.plan && !entry.store.current()) {
          entry.store.seed(entry.cache.plan);
        }
        return loaded;
      })();
    }
    return entry.loadPromise;
  }

  /** Grupy, które warto odświeżać w tle (ktoś je ostatnio otwierał). */
  active() {
    const now = Date.now();
    return [...this.map.values()]
      .filter((e) => now - e.lastUsed < this.idleMs)
      .sort((a, b) => a.lastUsed - b.lastUsed);
  }

  /** Zwalnia pamięć z grup nieużywanych i ponad limit. */
  evict() {
    const now = Date.now();
    const idle = [...this.map.values()]
      .filter((e) => e.id !== this.pinned && now - e.lastUsed > this.idleMs);
    for (const e of idle) {
      this.map.delete(e.id);
      this.#dropFile(e);
    }

    const rest = [...this.map.values()]
      .filter((e) => e.id !== this.pinned)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    while (this.map.size > this.maxActive && rest.length) {
      const victim = rest.shift();
      this.map.delete(victim.id);
      this.#dropFile(victim);
    }
  }

  /** Lista obserwowanych grup (do zapisu na dysk i do /health). */
  snapshot() {
    return [...this.map.values()].map((e) => ({
      id: e.id,
      lastUsed: new Date(e.lastUsed).toISOString(),
      versions: e.store.versions.length,
      classes: e.store.current()?.classes ?? null,
      hasPlan: Boolean(e.store.current()),
      cacheAgeSeconds: Number.isFinite(e.cache.ageMs) ? Math.round(e.cache.ageMs / 1000) : null,
    }));
  }

  async persist() {
    await fs.mkdir(this.cacheDir, { recursive: true }).catch(() => {});
    const data = this.snapshot();
    const tmp = `${this.watchedFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ savedAt: new Date().toISOString(), groups: data }), 'utf8');
    await fs.rename(tmp, this.watchedFile).catch(() => {});
  }

  async restore() {
    try {
      const raw = JSON.parse(await fs.readFile(this.watchedFile, 'utf8'));
      for (const g of raw.groups || []) {
        if (!ENTRY_ID_RE.test(String(g.id))) continue;
        const entry = this.get(g.id);
        // lastUsed z pliku, nie „teraz” — inaczej po restarcie wszystkie
        // grupy wyglądają na świeże i evict() nigdy nic nie zwolni
        const ts = Date.parse(g.lastUsed || '');
        entry.lastUsed = Number.isFinite(ts) ? ts : Date.now();
      }
    } catch { /* brak pliku — pierwszy start */ }
  }
}

module.exports = { GroupRegistry, CACHE_DIR, ENTRY_ID_RE };
