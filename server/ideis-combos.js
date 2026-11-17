'use strict';
/**
 * Listy wyboru z formularza uczelni (/Plany/ZnajdzTok): kierunki i specjalności.
 *
 * Formularz ideis to kontrolki DevExpress, ale listy pozycji są w zwykłym HTML-u:
 * po wybraniu wydziału przeglądarka robi POST na `/Plany/ZnajdzTokKierunekCombo`
 * (pole `wydzialy`), a po wybraniu kierunku — `/Plany/ZnajdzTokSpecjalnoscCombo`
 * (pola `wydzialy` i `kierunki`). Odpowiedź zawiera tablicę `itemsInfo`
 * z parami `value`/`text`, więc nie trzeba przeglądarki ani viewstate'u.
 *
 * Wydział jest stały: „Wydział Studiów Stosowanych we Wrocławiu” (id 5453).
 * Pozostałe wydziały (studia podyplomowe, filie) mają osobne plany i na razie
 * nie są obsługiwane — dokładnie tak, jak ustalono w aplikacji.
 *
 * Cache: 12 h w `.cache/ideis-combos.json`. Gdy uczelnia nie odpowiada,
 * oddajemy ostatnią znaną listę (oznaczoną jako `stale`), żeby picker nie
 * zniknął tylko dlatego, że strona uczelni chwilowo nie działa.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { CACHE_DIR } = require('./registry');

const BASE_URL = process.env.APR_BASE_URL || 'https://harmonogramy.ideis.pl';
const UA = process.env.APR_USER_AGENT
  || 'PlanZajecBot/1.0 (+https://github.com/; wlasny podglad planu zajec)';

/** Wydział obsługiwany przez aplikację (reszta to studia podyplomowe i filie). */
const FACULTY = {
  id: String(process.env.DEFAULT_FACULTY_ID || '5453'),
  label: String(process.env.DEFAULT_FACULTY_LABEL || 'Wydział Studiów Stosowanych we Wrocławiu'),
};

const CACHE_FILE = path.join(CACHE_DIR, 'ideis-combos.json');
const TTL_MS = Number(process.env.IDEIS_COMBO_TTL_MIN || 720) * 60 * 1000;
const FILE_VERSION = 1;

/** Stan w pamięci: { kierunki: {at, items}, specjalnosci: { [kierunek]: {at, items} } }. */
let memory = null;
let saving = Promise.resolve();

function cacheAge(entry) {
  return entry && entry.at ? Date.now() - entry.at : Infinity;
}

async function loadCache() {
  if (memory) return memory;
  memory = { kierunki: null, specjalnosci: {} };
  try {
    const raw = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
    if (raw && raw.version === FILE_VERSION) {
      memory.kierunki = raw.kierunki || null;
      memory.specjalnosci = raw.specjalnosci || {};
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[ideis] nie udało się wczytać list wyboru:', err.message);
  }
  return memory;
}

function persist() {
  const snapshot = {
    version: FILE_VERSION,
    savedAt: new Date().toISOString(),
    kierunki: memory?.kierunki || null,
    specjalnosci: memory?.specjalnosci || {},
  };
  saving = saving.catch(() => {}).then(async () => {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const tmp = `${CACHE_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(snapshot)}\n`, 'utf8');
    await fs.rename(tmp, CACHE_FILE);
  }).catch((err) => console.warn('[ideis] zapis list wyboru:', err.message));
  return saving;
}

/**
 * Wyciąga tablicę `itemsInfo` z odpowiedzi DevExpress. Odpowiedź bywa
 * fragmentem HTML (zwykły POST) albo JSON-em callbacku `(…{'id':0,'result':…})`
 * (tak odpowiada przeglądarka) — oba warianty mają tę samą tablicę.
 */
function parseItemsInfo(html) {
  const text = String(html || '');
  // DevExpress pisze `'itemsInfo':[…]` (z apostrofem), ale bywa też `itemsInfo:[…]`.
  const marker = text.indexOf('itemsInfo');
  if (marker < 0) return [];
  const open = text.indexOf('[', marker);
  if (open < 0) return [];
  let depth = 0;
  let end = -1;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return [];

  const items = [];
  const objectRe = /\{[^{}]*\}/g;
  let match;
  while ((match = objectRe.exec(text.slice(open + 1, end)))) {
    const value = /'value':\s*'((?:\\.|[^'\\])*)'/.exec(match[0]);
    const label = /'text':\s*'((?:\\.|[^'\\])*)'/.exec(match[0]);
    if (!label) continue;
    const text_ = label[1].replace(/\\'/g, "'").replace(/&amp;/g, '&').trim();
    if (!text_) continue;
    items.push({ id: value ? value[1].replace(/\\'/g, "'").trim() : '', label: text_ });
  }
  return items;
}

async function postCombo(comboPath, body) {
  const res = await fetch(`${BASE_URL}${comboPath}`, {
    method: 'POST',
    headers: {
      'user-agent': UA,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      accept: 'text/html, */*; q=0.01',
      'accept-language': 'pl-PL,pl;q=0.9',
      origin: BASE_URL,
      referer: `${BASE_URL}/Plany/ZnajdzTok?Ukryj=True`,
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(Number(process.env.APR_TIMEOUT_MS || 30000)),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} przy pobieraniu listy z formularza uczelni`);
  const html = new TextDecoder('utf-8').decode(Buffer.from(await res.arrayBuffer()));
  const items = parseItemsInfo(html);
  if (!items.length) throw new Error('Formularz uczelni nie zwrócił listy pozycji.');
  return items;
}

function fresh(entry) {
  return entry && cacheAge(entry) < TTL_MS;
}

/**
 * Kierunki obsługiwanego wydziału.
 * @param {{force?: boolean}} [opts]
 */
async function kierunki({ force = false } = {}) {
  const cache = await loadCache();
  if (!force && fresh(cache.kierunki)) {
    return { items: cache.kierunki.items, ...status(cache.kierunki) };
  }
  try {
    const items = (await postCombo('/Plany/ZnajdzTokKierunekCombo', { wydzialy: FACULTY.id }))
      .filter((item) => item.id && item.label);
    cache.kierunki = { at: Date.now(), items };
    await persist();
    return { items, ...status(cache.kierunki) };
  } catch (err) {
    if (cache.kierunki?.items?.length) {
      return { items: cache.kierunki.items, ...status(cache.kierunki), error: err.message };
    }
    throw err;
  }
}

/**
 * Specjalności oferowane na kierunku (id z formularza uczelni).
 * @param {string} kierunekId
 * @param {{force?: boolean}} [opts]
 */
async function specjalnosci(kierunekId, { force = false } = {}) {
  const key = String(kierunekId || '').trim();
  if (!/^\d{1,8}$/.test(key)) throw Object.assign(new Error('Nieprawidłowy kierunek.'), { status: 400 });
  const cache = await loadCache();
  const known = cache.specjalnosci[key];
  if (!force && fresh(known)) return { items: known.items, ...status(known) };
  try {
    const items = await postCombo('/Plany/ZnajdzTokSpecjalnoscCombo', {
      wydzialy: FACULTY.id,
      kierunki: key,
    });
    cache.specjalnosci[key] = { at: Date.now(), items };
    await persist();
    return { items, ...status(cache.specjalnosci[key]) };
  } catch (err) {
    if (known?.items?.length) return { items: known.items, ...status(known), error: err.message };
    throw err;
  }
}

function status(entry) {
  return {
    fetchedAt: entry?.at ? new Date(entry.at).toISOString() : null,
    stale: Boolean(entry?.at) && cacheAge(entry) >= TTL_MS,
  };
}

module.exports = {
  BASE_URL,
  CACHE_FILE,
  FACULTY,
  TTL_MS,
  kierunki,
  parseItemsInfo,
  specjalnosci,
  __reset() {
    memory = null;
  },
};
