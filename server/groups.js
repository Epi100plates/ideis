'use strict';
/**
 * Katalog grup uczelni (harmonogramy.ideis.pl) — pełny, bez filtra zakresu.
 *
 * Jedno źródło: strona „Znajdź grupę” (/Plany/ZnajdzGrupe). Wyszukiwarka
 * normalnie nie pozwala pokazać wszystkich grup — trzeba wpisać nazwę.
 * Serwer akceptuje jednak klasyczny wildcard SQL `%`, więc jedno zapytanie
 * POST zwraca pełną listę (~2100 grup) wraz z kodem, pełną nazwą, kierunkiem,
 * wydziałem i tokami nauki. Wynik trzymamy 24 h w .cache/groups.json — cały,
 * bo zakres wybiera dopiero użytkownik w aplikacji.
 *
 * Wymiary (rok, specjalność, nabór, typ studiów) wyprowadza `dimensions.js`,
 * dzięki czemu parser HTML zostaje jedną, testowalną funkcją.
 *
 * Zero zależności — tylko wbudowany fetch (Node 18+).
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { decodeEntities } = require('./parser');
const { deriveDimensions } = require('./dimensions');

const BASE_URL = process.env.APR_BASE_URL || 'https://harmonogramy.ideis.pl';
const UA = process.env.APR_USER_AGENT
  || 'PlanZajecBot/1.0 (+https://github.com/; wlasny podglad planu zajec)';
const CACHE_DIR = process.env.CACHE_DIR || path.join(process.cwd(), '.cache');
const CATALOG_FILE = path.join(CACHE_DIR, 'groups.json');
const TTL = 24 * 3600 * 1000;
/** Timeout pobrania katalogu — bez niego wolna uczelnia trzymała żądanie bez końca. */
const CATALOG_TIMEOUT_MS = Math.max(1000, Number(process.env.CATALOG_TIMEOUT_MS || 30000));
// Wersja formatu cache. Stare pliki (bez wymiarów) trzeba pobrać od nowa.
const CATALOG_VERSION = 6;

const KIND_ORDER = {
  Wyk: 0, 'Ćw': 1, Lab: 2, Sem: 3, Lekt: 4, Warszt: 5, Proj: 6, Inf: 7, Prak: 8, Egz: 9,
};

const KIND_MAP = [
  [/^(wyk|wyklad|wykład)/i, 'Wyk'],
  [/^(ćw|cw|ćwiczenia)/i, 'Ćw'],
  [/^(lab|labor)/i, 'Lab'],
  [/^(sem|semin)/i, 'Sem'],
  [/^(lekt|lek\/)/i, 'Lekt'],
  [/^(warszt|warsz)/i, 'Warszt'],
  [/^(proj)/i, 'Proj'],
  [/^(prak|prakt)/i, 'Prak'],
  [/^(inf)/i, 'Inf'],
  [/^(egz)/i, 'Egz'],
  [/^(elear)/i, 'eLear'],
];

function textOf(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function hrefId(html) {
  const m = String(html || '').match(/\/Plany\/PlanyGrup\/(\d+)/);
  return m ? m[1] : null;
}

function baseKind(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  for (const [re, kind] of KIND_MAP) {
    if (re.test(s)) return kind;
  }
  const head = s.split('/')[0].replace(/\d+[A-Za-z]*$/, '').trim();
  return head || s;
}

/**
 * Rozbiór kodu/nazwy grupy na części wspólne dla wszystkich wymiarów.
 *   code:  „Infor. 1st 1sem Ćw2”
 *   name:  „Informatyka, 1st 1sem Ćw (gr. 2) N”
 *   field: „Informatyka”
 *   kind:  „Ćw”
 *   number: „2”
 *
 * Rok studiów, stopień, tryb, specjalność i nabór dokłada `deriveDimensions`.
 */
function normalizeEntry({ id, code, name, field, toki }, { now = new Date() } = {}) {
  const fullCode = String(code || '').trim();
  const fullName = String(name || '').trim() || fullCode;
  const fullToki = String(toki || '').trim();
  const subjectField = String(field || '').trim()
    || fullName.split(',')[0].trim()
    || fullCode.split(/\s+/)[0].replace(/\.$/, '');

  // Lata akademickie z kolumny „Toki nauki” — podstawa wyliczenia naboru.
  const academicYears = [...new Set((fullToki.match(/\b\d{4}\/\d{4}\b/g) || []))];

  // Numer grupy: najpierw jawny „(gr. 2)”, potem końcówka kodu („Ćw2”, „Labor7B”).
  let number = null;
  const gr = fullName.match(/\(gr\.?\s*([^)]+)\)/i);
  if (gr) {
    number = gr[1].trim();
  } else {
    const tail = fullCode.split(/\s+/).pop() || '';
    const tailMatch = tail.match(/(\d+[A-Za-z]*)$/);
    if (tailMatch) number = tailMatch[1];
  }

  // Forma: token po „Nsem” w nazwie (np. „Ćw”, „Labor”, „Lekt/ANG”).
  const afterSem = fullName.match(/\d+\s*sem\s+([^\s,]+)/i)
    || fullCode.match(/\d+\s*sem\s+([^\s,]+)/i);
  const kindRaw = afterSem ? afterSem[1].replace(/\(.*$/, '') : null;

  const base = {
    id: String(id),
    code: fullCode || fullName,
    name: fullName,
    field: subjectField,
    academicYears,
    // Lata **wyłącznie** z kolumny „Toki nauki”, bez dopisanego bieżącego roku
    // akademickiego (`deriveDimensions` go dokłada do `academicYears`).
    // Kreator wyboru odsiewa po tym grupy ze starych toków — inaczej rocznik
    // 2025 pokazywałby specjalność, której plan pochodzi z 2022/2023.
    tokiYears: academicYears,
    // Cała kolumna „Toki nauki” — z niej `deriveDimensions` bierze tryb i typ
    // studiów, gdy nazwa grupy ich nie podaje („Administracja samorządowa
    // 2st 3sem Wyk” + tok „… N mgr …”).
    toki: fullToki,
    kind: baseKind(kindRaw),
    number,
  };

  return { ...base, ...deriveDimensions(base, { now }) };
}

/** Czysta funkcja: HTML wyników wyszukiwania → lista grup. Testowalna offline. */
function parseCatalogHtml(html, { now = new Date() } = {}) {
  const rows = [];
  const rowRe = /<tr[^>]*id="ZnajdzGrupeGrid_DXDataRow\d+"[^>]*>([\s\S]*?)<\/tr>/g;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
  const seen = new Set();
  let m;

  while ((m = rowRe.exec(html))) {
    const cells = [];
    let cm;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(m[1]))) cells.push(cm[1]);

    const id = hrefId(cells[1] || '');
    if (!id || !/^\d{2,8}$/.test(id) || seen.has(id)) continue;
    seen.add(id);

    rows.push(normalizeEntry({
      id,
      code: textOf(cells[0] || ''),
      name: textOf(cells[1] || ''),
      toki: textOf(cells[2] || ''),
      field: textOf(cells[3] || ''),
    }, { now }));
  }

  return sortCatalog(rows);
}

function sortCatalog(groups) {
  const yearRank = (group) => (Number.isFinite(group.year) ? group.year : 99);
  const semRank = (group) => (Number.isFinite(group.semester) ? group.semester : 99);
  const degreeRank = (group) => {
    const order = { '1st': 10, '2st': 20, jmgr: 30, 'inż': 40, podypl: 50 };
    return order[group.degree] ?? 60;
  };
  return groups.sort((a, b) => {
    const field = String(a.field || '').localeCompare(String(b.field || ''), 'pl', { sensitivity: 'base' });
    if (field) return field;
    const degree = degreeRank(a) - degreeRank(b);
    if (degree) return degree;
    const year = yearRank(a) - yearRank(b);
    if (year) return year;
    const sem = semRank(a) - semRank(b);
    if (sem) return sem;
    const ka = KIND_ORDER[a.kind] ?? 50;
    const kb = KIND_ORDER[b.kind] ?? 50;
    if (ka !== kb) return ka - kb;
    return String(a.number || '').localeCompare(String(b.number || ''), 'pl', { numeric: true });
  });
}

async function readText(res) {
  const buf = Buffer.from(await res.arrayBuffer());
  return new TextDecoder('utf-8').decode(buf);
}

let mem = null;
let memSavedAt = 0;
let loaded = false;
let loading = null;
let inflight = null;

async function loadFromDisk() {
  try {
    const raw = JSON.parse(await fs.readFile(CATALOG_FILE, 'utf8'));
    if (raw.version !== CATALOG_VERSION) {
      console.warn('[groups] cache w starym formacie — pobieram katalog od nowa');
      return;
    }
    if (Array.isArray(raw.groups) && raw.groups.length) {
      mem = raw.groups;
      const ts = Date.parse(raw.savedAt || '');
      memSavedAt = Number.isFinite(ts) ? ts : 0;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[groups] nie udało się wczytać katalogu:', err.message);
  }
}

/** Pobiera pełny katalog z uczelni (POST z wildcardem %). */
async function fetchCatalog() {
  const body = new URLSearchParams({ nazwaGrupy: '%' });
  const res = await fetch(`${BASE_URL}/Plany/ZnajdzGrupe`, {
    method: 'POST',
    signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
    headers: {
      'user-agent': UA,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'accept-language': 'pl-PL,pl;q=0.9',
      accept: 'text/html,application/xhtml+xml',
      origin: BASE_URL,
      referer: `${BASE_URL}/Plany/ZnajdzGrupe`,
    },
    body: body.toString(),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} przy pobieraniu katalogu grup`);

  const html = await readText(res);
  const groups = parseCatalogHtml(html);
  if (groups.length < 50) {
    throw new Error(`Katalog grup wygląda na niekompletny (${groups.length} pozycji).`);
  }
  return groups;
}

/** Odświeżenie katalogu z deduplikacją równoległych wywołań. */
async function refreshCatalog() {
  if (inflight) return inflight;
  inflight = (async () => {
    const groups = await fetchCatalog();
    mem = groups;
    memSavedAt = Date.now();
    await fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
    const tmp = `${CATALOG_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({
      version: CATALOG_VERSION,
      savedAt: new Date(memSavedAt).toISOString(),
      count: groups.length,
      groups,
    }), 'utf8');
    await fs.rename(tmp, CATALOG_FILE).catch(() => {});
    console.log(`[groups] katalog odświeżony: ${groups.length} grup`);
    return groups;
  })().finally(() => { inflight = null; });
  return inflight;
}

async function ensureLoaded() {
  if (loaded) return;
  if (!loading) {
    loading = loadFromDisk().finally(() => { loaded = true; loading = null; });
  }
  await loading;
}

/**
 * Pełny katalog grup (cache 24 h, stale-while-revalidate).
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<{savedAt:string|null, stale:boolean, count:number, groups:object[], error?:string}>}
 */
async function getCatalog({ force = false } = {}) {
  await ensureLoaded();
  const age = Date.now() - memSavedAt;

  if (mem && !force && memSavedAt && age < TTL) {
    return { savedAt: new Date(memSavedAt).toISOString(), stale: false, count: mem.length, groups: mem };
  }

  if (mem && !force) {
    // Odpowiadamy natychmiast starym katalogiem, a świeży dociągamy w tle.
    refreshCatalog().catch((err) => console.warn('[groups] odświeżenie w tle nieudane:', err.message));
    return {
      savedAt: memSavedAt ? new Date(memSavedAt).toISOString() : null,
      stale: true,
      count: mem.length,
      groups: mem,
    };
  }

  try {
    const groups = await refreshCatalog();
    return { savedAt: new Date(memSavedAt).toISOString(), stale: false, count: groups.length, groups };
  } catch (err) {
    if (mem) {
      return {
        savedAt: memSavedAt ? new Date(memSavedAt).toISOString() : null,
        stale: true,
        count: mem.length,
        groups: mem,
        error: err.message,
      };
    }
    throw err;
  }
}

module.exports = {
  BASE_URL,
  CATALOG_FILE,
  TTL,
  getCatalog,
  fetchCatalog,
  parseCatalogHtml,
  normalizeEntry,
  sortCatalog,
  KIND_ORDER,
};
