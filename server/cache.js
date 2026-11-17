'use strict';
/**
 * Prosty cache planu na dysku + w pamięci.
 *
 * Zasada: serwer uczelni odpytywany jest rzadko (co CACHE_TTL_MIN minut),
 * a strona zawsze odpowiada natychmiast z cache. Gdy odświeżenie się nie uda,
 * oddajemy ostatnie znane dane (stale) zamiast błędu.
 */

const fs = require('fs/promises');
const path = require('path');

const CACHE_DIR = process.env.CACHE_DIR || path.join(process.cwd(), '.cache');

/**
 * Ile czekać po nieudanym pobraniu, zanim znowu pytamy uczelnię bez cache.
 * Bez tego każde żądanie nieistniejącej grupy zamieniało się w wyprawę do
 * harmonogramów (i do logu), a enumeracja numerów zalewała serwer uczelni.
 */
const ERROR_TTL_MS = Math.max(0, Number(process.env.NEGATIVE_CACHE_S || 120) * 1000);

class PlanCache {
  constructor({ ttlMs = 30 * 60 * 1000, file, errorTtlMs = ERROR_TTL_MS } = {}) {
    this.ttlMs = ttlMs;
    this.file = file || path.join(CACHE_DIR, 'plan.json');
    this.plan = null;
    this.fetchedAt = 0;
    this.error = null;
    this.errorTtlMs = Math.max(0, errorTtlMs);
    /** Kiedy ostatnio pobranie się nie udało — podstawa cache negatywnego. */
    this.failedAt = 0;
    this.inFlight = null;
    this.lastAttempt = 0;
  }

  async load() {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.plan) {
        this.plan = parsed.plan;
        this.fetchedAt = new Date(parsed.plan.meta?.fetchedAt || parsed.savedAt || 0).getTime();
        return true;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('[cache] nie udało się wczytać:', err.message);
    }
    return false;
  }

  async save(plan) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ savedAt: new Date().toISOString(), plan }), 'utf8');
    await fs.rename(tmp, this.file);
  }

  get ageMs() {
    return this.fetchedAt ? Date.now() - this.fetchedAt : Infinity;
  }

  get isFresh() {
    return Boolean(this.plan) && this.ageMs < this.ttlMs;
  }

  /** Czy w tle trwa właśnie pobieranie świeżych danych. */
  get refreshing() {
    return Boolean(this.inFlight);
  }

  /**
   * Jedno odświeżenie naraz. Równoległe żądania dostają ten sam promise,
   * więc serwer uczelni nie jest pytany kilka razy o to samo.
   */
  #startRefresh(fetchFn) {
    if (this.inFlight) return this.inFlight;

    this.lastAttempt = Date.now();
    this.inFlight = Promise.resolve()
      .then(fetchFn)
      .then(async (plan) => {
        this.plan = plan;
        this.fetchedAt = Date.now();
        this.error = null;
        this.failedAt = 0;
        await this.save(plan).catch((e) => console.warn('[cache] zapis nieudany:', e.message));
        return plan;
      })
      .catch((err) => {
        this.error = err.message;
        this.failedAt = Date.now();
        console.warn('[cache] odświeżenie nieudane:', err.message);
        if (this.plan) return this.plan;
        throw err;
      })
      .finally(() => { this.inFlight = null; });

    // Gdy odświeżanie idzie w tle, nikt nie czeka na wynik — bez tego
    // nieudane pobranie bez cache byłoby nieobsłużonym odrzuceniem.
    this.inFlight.catch(() => {});
    return this.inFlight;
  }

  /**
   * Zwraca plan NATYCHMIAST, jeśli jest jakikolwiek znany (nawet nieświeży),
   * i uruchamia odświeżanie w tle. Na uczelnię czekamy tylko wtedy, gdy nie
   * mamy jeszcze żadnych danych. Dzięki temu pierwsze wejście po przerwie
   * nie blokuje się na kilku sekundach pobierania.
   */
  async get({ force = false, fetchFn } = {}) {
    if (!force && this.isFresh) {
      return { plan: this.plan, stale: false, error: this.error, ageMs: this.ageMs };
    }

    // Cache negatywny: po nieudanym pobraniu bez żadnego planu nie pytamy
    // uczelni o ten sam numer przy każdym żądaniu. `force` (przycisk
    // „Odśwież”) omija ten limit świadomie.
    if (!force && !this.plan && this.failedAt
      && Date.now() - this.failedAt < this.errorTtlMs) {
      const err = new Error(this.error || 'Nie udało się pobrać planu.');
      err.status = 502;
      err.cached = true;
      throw err;
    }

    // Nieświeży, ale znany plan: oddaj od razu i odśwież w tle.
    if (!force && this.plan) {
      const alreadyRefreshing = this.refreshing;
      if (!alreadyRefreshing) this.#startRefresh(fetchFn);
      return {
        plan: this.plan,
        stale: true,
        error: this.error,
        ageMs: this.ageMs,
        refreshing: true,
      };
    }

    // Brak planu albo wymuszone odświeżenie — tu trzeba poczekać na wynik.
    if (this.inFlight) {
      try {
        const plan = await this.inFlight;
        return { plan, stale: Boolean(this.error), error: this.error, ageMs: this.ageMs };
      } catch (err) {
        if (this.plan) {
          return { plan: this.plan, stale: true, error: err.message, ageMs: this.ageMs };
        }
        throw err;
      }
    }

    const promise = this.#startRefresh(fetchFn);
    try {
      const plan = await promise;
      return { plan, stale: Boolean(this.error), error: this.error, ageMs: this.ageMs };
    } catch (err) {
      if (this.plan) {
        return { plan: this.plan, stale: true, error: err.message, ageMs: this.ageMs };
      }
      throw err;
    }
  }
}

module.exports = { PlanCache, CACHE_DIR };
