'use strict';

/* ============================================================================
   Licznik wejść — jedno zdarzenie na otwarcie aplikacji.

   Ten sam mechanizm co w wersji web: `POST /api/visit` z `{source}`, gdzie
   `source` to `web` (karta przeglądarki) albo `pwa` (tryb standalone). Gdy
   jesteśmy offline, wpis czeka w kolejce w `localStorage` i dogrywa się po
   powrocie sieci — licznik nie gubi wejść, a serwer nie musi zgadywać po
   nagłówkach HTTP.

   Zero DOM i zero `fetch`: `createTracker()` dostaje `storage`, `post`
   i `isOnline`, więc `node scripts/self-test.js` sprawdza kolejkę bez
   przeglądarki. Plik ładuje się przed app.js i wystawia `window.PlanVisits`.
   ========================================================================== */

(function (global) {
  /** Ten sam klucz co w wersji web — kolejka przeżywa aktualizację powłoki. */
  const QUEUE_KEY = 'plan-zajec:visit-queue';
  const MAX = 50;
  const SOURCES = ['web', 'pwa'];

  /** Kolejka bez śmieci: tylko źródła, które serwer rozumie, max `MAX` wpisów. */
  function normalize(list) {
    if (!Array.isArray(list)) return [];
    return list.filter((entry) => SOURCES.includes(entry)).slice(-MAX);
  }

  function readQueue(storage) {
    try {
      return normalize(JSON.parse(storage.getItem(QUEUE_KEY) || '[]'));
    } catch {
      return [];
    }
  }

  /** `false` = pamięć nie przyjęła zapisu; wpis zostaje tylko w tej instancji. */
  function writeQueue(storage, queue) {
    try {
      storage.setItem(QUEUE_KEY, JSON.stringify(normalize(queue)));
      return true;
    } catch {
      return false;
    }
  }

  /** Pamięć zastępcza — tryb prywatny blokuje `localStorage`, licznik ma działać. */
  function memoryStorage() {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => { map.set(key, String(value)); },
      removeItem: (key) => { map.delete(key); },
    };
  }

  /** `localStorage` potrafi rzucać już przy odczycie (Safari, tryb prywatny). */
  function safeStorage(win) {
    try {
      const storage = win.localStorage;
      const probe = '__plan_visits_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch {
      return null;
    }
  }

  /** Tryb standalone (PWA na pulpicie) czy zwykła karta przeglądarki. */
  function detectSource(win) {
    try {
      if (win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) return 'pwa';
    } catch {
      /* brak matchMedia — zostaje wykrywanie po navigator.standalone */
    }
    return win.navigator && win.navigator.standalone === true ? 'pwa' : 'web';
  }

  /**
   * Kolejka + wysyłka. `post(source)` zwraca `true`, gdy wpis można usunąć
   * z kolejki: serwer przyjął wejście albo odrzucił je trwale (4xx) — ponawianie
   * takiego wpisu nic nie da. `false` oznacza, że sieć padła i reszta czeka.
   */
  function createTracker({ storage = null, post, isOnline = () => true, source = 'web' } = {}) {
    if (typeof post !== 'function') throw new Error('PlanVisits.createTracker wymaga funkcji post().');
    const src = SOURCES.includes(source) ? source : 'web';
    const store = storage || memoryStorage();
    let pending = null;

    /** Wysyła kolejkę po kolei; przy błędzie zostawia resztę na później. */
    function flush() {
      if (pending) return pending;
      if (!isOnline()) return Promise.resolve(0);

      pending = (async () => {
        let sent = 0;
        // Pętla po liczbie wpisów, nie po czasie: kolejka ma twardy limit.
        for (let i = 0; i < MAX; i += 1) {
          const queue = readQueue(store);
          if (!queue.length) return sent;
          if (!(await post(queue[0]))) return sent;
          writeQueue(store, queue.slice(1));
          sent += 1;
        }
        return sent;
      })().finally(() => { pending = null; });

      return pending;
    }

    /** Jedno otwarcie aplikacji = jedno zdarzenie w kolejce. */
    function record() {
      writeQueue(store, readQueue(store).concat(src));
      return flush();
    }

    return {
      record,
      flush,
      size: () => readQueue(store).length,
    };
  }

  global.PlanVisits = {
    createTracker,
    detectSource,
    safeStorage,
    memoryStorage,
    normalize,
    readQueue,
    writeQueue,
    QUEUE_KEY,
    MAX,
  };
}(typeof window !== 'undefined' ? window : globalThis));
