'use strict';
/**
 * Serwer planu zajęć z wyborem dowolnego roku, kierunku, specjalności, naboru
 * i typu studiów — bez zależności z npm.
 *
 *   node server/index.js
 *
 * Każdy endpoint przyjmuje dwa parametry:
 *   ?group=NNNN  numer grupy (2–8 cyfr),
 *   ?ay=RRRR     rok akademicki planu, liczony z naboru i roku studiów
 *                (np. nabór 2024 + 2. rok = 2025). Bez `ay` obowiązuje
 *                bieżący rok akademicki, więc stare linki działają bez zmian.
 *
 * Odświeżanie w tle:
 *   - dni robocze: raz na dobę,
 *   - weekendy:   raz na godzinę.
 * Nowa wersja powstaje tylko przy zmianie treści; historia wersji jest osobna
 * dla każdej pary (grupa, rok akademicki).
 *
 * Endpointy:
 *   GET  /                          aplikacja
 *   GET  /api/groups                pełny katalog grup + wymiary (cache 24 h)
 *   GET  /api/plan?group=21188      aktualny plan (JSON); &version=N — wersja
 *   GET  /api/version?group=21188   lekki status aktualnej wersji
 *   GET  /api/versions?group=21188  lista wersji z podsumowaniem zmian
 *   GET  /api/versions/:id?group=   konkretna wersja planu
 *   GET  /api/plan.ics?group=       iCalendar (subskrypcja w kalendarzu)
 *   GET  /api/plan.csv?group=       CSV (Excel)
 *   GET  /api/app/latest?versionCode=N  najnowsze wydanie aplikacji Android
 *   GET  /api/app/apk               przekierowanie na najnowszy plik APK
 *   GET  /api/app/download/<plik>.apk   plik instalacyjny aplikacji
 *   GET  /api/attachments?group=&class=  lista plików i linków danych zajęć
 *   POST /api/attachments?group=&class=  upload pliku (bez logowania)
 *   POST /api/attachments/links?group=&class=  dodanie linku do materiału
 *   GET  /api/attachments/:id?group=&class=  pobranie pliku
 *   GET  /api/notes                  notatki na kafelkach („Kolos”, „Egzamin”)
 *   POST /api/notes                  zapis lub usunięcie notatki
 *   GET  /api                          opis publicznego API
 *   GET  /api/openapi.json             schemat OpenAPI 3.1
 *   POST /api/refresh?group=        wymuszone sprawdzenie (throttling per grupa)
 *   POST /api/visit                 zliczenie wejścia (web/PWA)
 *   GET  /api/visits                licznik wejść (JSON)
 *   GET  /wejscia                   strona licznika (licznik.mati-it.pl)
 *   GET  /health                    stan serwera + lista obserwowanych grup
 */

const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

/** Minimalna obsługa pliku .env (bez dodatkowych bibliotek). */
function loadEnvFile() {
  try {
    const text = require('node:fs').readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, '');
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  } catch { /* brak .env */ }
}
loadEnvFile();

const { fetchPlan, academicWindowFor } = require('./scraper');
const { toICS, toCSV } = require('./export');
const { GroupRegistry, CACHE_DIR } = require('./registry');
const { getCatalog } = require('./groups');
const combos = require('./ideis-combos');
const ideisSelection = require('./ideis-selection');
const ideisOptions = require('./ideis-options');
const { mergePlans, mergedFingerprint, mergedVersionId, hasGroupIds } = require('./merge');
const { FeedbackStore } = require('./feedback');
const {
  academicYearLabel,
  currentAcademicYearStart,
} = require('./dimensions');
const selection = require('../public/selection');
const { groupIdFromValue } = require('./group-id');
const { isWeekend, gapMinutes } = require('./schedule');
const { AttachmentStore, classInfoOf, ALLOWED_EXTENSIONS, ALLOWED_LABEL } = require('./attachments');
const { apiSummary, openApiDocument } = require('./api-docs');
const { VisitCounter, renderVisitsPage } = require('./visits');
const { NoteStore, isValidClassId, dayInRange } = require('./notes');
const { ReleaseStore, parseRange, DEFAULT_APP_ID } = require('./app-updates');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DEFAULT_GROUP = String(process.env.GROUP_ID || '21188');

/**
 * Bieżący rok akademicki — liczony przy każdym użyciu, nie raz na starcie.
 *
 * Proces kontenera żyje miesiącami, a 1 września rok się zmienia. Zamrożona
 * wartość kierowałaby nowe żądania do starego roku: klucz rejestru
 * (`21188@2026`) i `/api/groups` podawałyby nieaktualny nabór.
 */
function currentAyStart() {
  return currentAcademicYearStart();
}

/**
 * Początkowy wybór w pickerze (kierunek / rok / typ / tryb / nabór).
 * Specjalność domyślnie nie jest wybierana — na pierwszym roku jej nie ma.
 * Funkcja, bo „nabór” zależy od bieżącego roku akademickiego.
 */
function defaultSelection() {
  return {
    nabor: String(process.env.DEFAULT_NABOR || currentAyStart()),
    field: String(process.env.DEFAULT_FIELD || 'Informatyka'),
    spec: String(process.env.DEFAULT_SPEC || selection.ANY),
    year: String(process.env.DEFAULT_YEAR || '1'),
    degree: String(process.env.DEFAULT_DEGREE || '1st'),
    mode: String(process.env.DEFAULT_MODE || 'N'),
  };
}
const CACHE_TTL_MIN = Number(process.env.CACHE_TTL_MIN || 1440);
const MAX_VERSIONS = Number(process.env.MAX_VERSIONS || 40);
const MAX_ACTIVE_GROUPS = Number(process.env.MAX_ACTIVE_GROUPS || 8);
const GROUP_IDLE_DAYS = Number(process.env.GROUP_IDLE_DAYS || 14);
const REFRESH_WEEKDAY_MIN = Number(process.env.REFRESH_WEEKDAY_MIN || 1440);
const REFRESH_WEEKEND_MIN = Number(process.env.REFRESH_WEEKEND_MIN || 60);
const REFRESH_TOKEN = process.env.REFRESH_TOKEN || '';
/** Minimalny odstęp między ręcznymi sprawdzeniami (chroni serwer uczelni). */
const REFRESH_MIN_GAP_S = Number(process.env.REFRESH_MIN_GAP_S || 60);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// --- licznik wejść --------------------------------------------------------
// Plik leży w wolumenie cache, więc licznik przeżywa restart i przebudowę.
const VISITS_FILE = process.env.VISITS_FILE || path.join(CACHE_DIR, 'visits.json');
const VISIT_RATE_PER_MIN = Math.max(1, Number(process.env.VISIT_RATE_PER_MIN || 240));
const COUNTER_HOST = String(process.env.COUNTER_HOST || 'licznik.mati-it.pl').toLowerCase();
const APP_URL = String(process.env.APP_URL || 'https://plany.mati-it.pl/');
/** Ile grup może naraz tworzyć jeden plan (wykład + ćwiczenia + laby + lektorat). */
const MAX_PLAN_GROUPS = Math.max(1, Number(process.env.MAX_PLAN_GROUPS || 12));

// --- propozycje i zgłoszenia błędów --------------------------------------
// Zgłoszenia leżą w wolumenie cache (dopisywany JSONL), a moderacja wymaga
// tokenu z .env — bez niego usuwanie jest wyłączone.
const FEEDBACK_DIR = process.env.FEEDBACK_DIR || path.join(CACHE_DIR, 'feedback');
const FEEDBACK_TOKEN = String(process.env.FEEDBACK_TOKEN || '');
const FEEDBACK_RATE_PER_MIN = Math.max(1, Number(process.env.FEEDBACK_RATE_PER_MIN || 10));
const feedback = new FeedbackStore({ dir: FEEDBACK_DIR });

// --- wydania aplikacji Android -------------------------------------------
// Aplikacja nie jest w żadnym sklepie, więc sama pyta ten serwer o nową
// wersję. Manifest leży w katalogu wydań na wolumenie, więc publikacja APK
// nie wymaga przebudowania kontenera.
const APP_ID = String(process.env.APP_ID || DEFAULT_APP_ID);
const APP_RELEASE_DIR = process.env.APP_RELEASE_DIR || path.join(CACHE_DIR, 'releases');
const releases = new ReleaseStore({ dir: APP_RELEASE_DIR, appId: APP_ID });

// --- załączniki -----------------------------------------------------------
// Domyślnie leżą w wolumenie cache (w Dockerze ./data), więc przeżywają
// przebudowę kontenera. Można je przenieść przez ATTACHMENT_DIR.
const ATTACHMENT_DIR = process.env.ATTACHMENT_DIR || path.join(CACHE_DIR, 'attachments');
const ATTACHMENT_MAX_MB = Math.max(1, Number(process.env.ATTACHMENT_MAX_MB || 25));
const ATTACHMENT_CLASS_MAX_MB = Math.max(1, Number(process.env.ATTACHMENT_CLASS_MAX_MB || 200));
const ATTACHMENT_MAX_FILES = Math.max(1, Number(process.env.ATTACHMENT_MAX_FILES || 30));
const ATTACHMENT_LINK_MAX = Math.max(1, Number(process.env.ATTACHMENT_LINK_MAX || 30));
const ATTACHMENT_TOTAL_MAX_MB = Math.max(1, Number(process.env.ATTACHMENT_TOTAL_MAX_MB || 2048));
/** Publiczny endpoint — chronimy go prostym limitem na adres IP. */
const ATTACHMENT_RATE_PER_MIN = Math.max(1, Number(process.env.ATTACHMENT_RATE_PER_MIN || 20));

const attachments = new AttachmentStore({
  root: ATTACHMENT_DIR,
  maxFileBytes: ATTACHMENT_MAX_MB * 1024 * 1024,
  maxFilesPerClass: ATTACHMENT_MAX_FILES,
  maxLinksPerClass: ATTACHMENT_LINK_MAX,
  maxBytesPerClass: ATTACHMENT_CLASS_MAX_MB * 1024 * 1024,
  maxTotalBytes: ATTACHMENT_TOTAL_MAX_MB * 1024 * 1024,
});

const visits = new VisitCounter({ file: VISITS_FILE });

// --- notatki na kafelkach zajęć -------------------------------------------
// Krótkie etykiety („Kolos”, „Egzamin”) przypisane do konkretnych zajęć.
// Plik leży w wolumenie cache, więc notatki przeżywają przebudowę kontenera.
const NOTES_FILE = process.env.NOTES_FILE || path.join(CACHE_DIR, 'notes.json');
const notes = new NoteStore({ file: NOTES_FILE });

const registry = new GroupRegistry({
  maxVersions: MAX_VERSIONS,
  pinnedMaxVersions: 200,
  pinned: DEFAULT_GROUP,
  maxActive: MAX_ACTIVE_GROUPS,
  idleDays: GROUP_IDLE_DAYS,
  cacheTtlMs: CACHE_TTL_MIN * 60 * 1000,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ostatnie rzeczywiste sprawdzenie u uczelni (ms) — podstawa harmonogramu. */
let lastCheckAt = 0;
let scheduleTimer = null;
let tickRunning = false;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Nagłówki bezpieczeństwa — jedno miejsce, każda odpowiedź.
 *
 * `frame-ancestors 'none'` + `X-Frame-Options: DENY` zamykają clickjacking
 * (wcześniej dało się osadzić aplikację w iframe i klikać „usuń materiał”).
 * CSP nie dopuszcza inline `<script>`, dlatego skrypty z `index.html`
 * i `propozycje.html` leżą w `theme-boot.js` i `propozycje.js`.
 * `style-src 'unsafe-inline'` zostaje — interfejs ustawia style w atrybutach.
 */
const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'permissions-policy': 'geolocation=(), camera=(), microphone=()',
};

function json(res, status, body, extraHeaders = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(data),
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(data);
}

function sendText(res, status, text, type, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(text),
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(text);
}

/** Jedno miejsce walidacji numeru grupy — chroni przed śmieciem w nazwie pliku cache. */
function groupFrom(url, fallback = DEFAULT_GROUP) {
  return groupIdFromValue(url.searchParams.get('group'), fallback);
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Endpointy tylko do odczytu: każda inna metoda kończy się 405.
 * Wcześniej `POST /api/plan` odpowiadał 200 pełnym planem — czysty kontrakt
 * HTTP jest mniejszą powierzchnią i jasnym zachowaniem dla klientów.
 */
function requireReadOnly(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'GET, HEAD' });
  return false;
}

/**
 * `?refresh=1` — wymuszone pobranie katalogu/list z uczelni.
 *
 * Jedno takie żądanie trwało ponad 20 s i pobierało ~500 KB, a każdy mógł je
 * wywołać bez tokenu i bez limitu tempa. Na produkcji wymagamy więc
 * `REFRESH_TOKEN`; lokalnie (bez NODE_ENV=production) zostaje otwarte, żeby
 * dało się sprawdzić świeże dane w trakcie pracy.
 */
function forceRequested(url) {
  return url.searchParams.get('refresh') === '1';
}

function assertForceAllowed(req, url) {
  if (!forceRequested(url)) return;
  if (!REFRESH_TOKEN) {
    if (process.env.NODE_ENV !== 'production') return;
    throw httpError(403, 'Ręczne odświeżanie katalogu jest wyłączone — ustaw REFRESH_TOKEN w .env.');
  }
  const token = req.headers['x-refresh-token'] || url.searchParams.get('token');
  if (token !== REFRESH_TOKEN) {
    throw httpError(403, 'Brak uprawnień do odświeżenia katalogu.');
  }
}

// --- rok akademicki planu -------------------------------------------------
//
// Nabór i rok studiów dają rok akademicki planu (nabór 2024 + 2. rok = 2025).
// Rok bieżący nie dostaje sufiksu w kluczu rejestru, więc dotychczasowe plany
// z cache i linki ?group=NNNN działają dokładnie tak jak wcześniej — sufiks
// `@RRRR` pojawia się tylko przy przeglądaniu starszych naborów.

/** Ile lat w przód wolno zapytać (kolejny nabór bywa już w katalogu). */
const MAX_FUTURE_AY_YEARS = 2;

function academicYearFromUrl(url) {
  const raw = url ? url.searchParams.get('ay') : null;
  if (raw === null || raw === '') return null;
  if (!/^\d{4}$/.test(raw)) {
    throw httpError(400, 'Nieprawidłowy rok akademicki (ay) — podaj cztery cyfry.');
  }
  const value = Number(raw);
  const max = currentAyStart() + MAX_FUTURE_AY_YEARS;
  if (value < 2000 || value > max) {
    throw httpError(400, `Rok akademicki ${raw} jest poza zakresem (2000–${max}).`);
  }
  return value;
}

/** Numer grupy z klucza rejestru: „21188@2025” → „21188”. */
function groupIdOf(entryId) {
  return String(entryId).split('@')[0];
}

/** Klucz rejestru: bieżący rok bez sufiksu, starsze nabory z „@RRRR”. */
function entryKey(groupId, ayStart) {
  const current = currentAyStart();
  return ayStart === null || ayStart === current
    ? String(groupId)
    : `${groupId}@${ayStart}`;
}

/** Zakres dat do pobrania dla danej grupy (bieżący albo wskazany rok akademicki). */
function entryWindow(entryId) {
  const ay = String(entryId).split('@')[1];
  return academicWindowFor(ay ? Number(ay) : currentAyStart());
}

/** Grupa + rok akademicki z URL — wspólne dla planu, wersji, eksportów i załączników. */
async function entryFromUrl(url) {
  const gid = groupFrom(url);
  const ay = academicYearFromUrl(url);
  const entry = await entryFor(entryKey(gid, ay));
  return { gid, ay, entry };
}

/**
 * Lista grup z `?groups=21195,21197,21281` — plan złożony z wykładu, ćwiczeń
 * i laboratoriów. Bez `groups` zostaje stary tryb jednej grupy (`?group=`).
 * @returns {string[]|null}
 */
function groupsFrom(url) {
  const raw = url.searchParams.get('groups');
  if (!raw) return null;
  const ids = raw.split(',').map((value) => value.trim()).filter(Boolean);
  if (!ids.length) return null;
  if (ids.length > MAX_PLAN_GROUPS) {
    throw httpError(400, `Plan może zawierać maksymalnie ${MAX_PLAN_GROUPS} grup.`);
  }
  for (const id of ids) {
    if (!/^\d{2,8}$/.test(id)) {
      throw httpError(400, 'Nieprawidłowy numer grupy w planie (grupy podaj po przecinku).');
    }
  }
  return [...new Set(ids)];
}

/** Wpisy rejestru dla wszystkich grup planu (ta sama kolejność co `groups`). */
async function entriesFor(groups, ay) {
  const entries = [];
  for (const id of groups) entries.push(await entryFor(entryKey(id, ay)));
  return entries;
}

/**
 * Scalony plan: plany wszystkich wybranych grup + filtr „tylko moje zajęcia”.
 * Stary wpis cache (sprzed `groupIds`) dociągamy raz na nowo, bo bez numerów
 * grup nie da się odsiać cudzych ćwiczeń.
 */
async function mergedPlan(groups, ay, { force = false } = {}) {
  const entries = await entriesFor(groups, ay);
  const plans = [];
  for (const entry of entries) {
    let result = await getPlan(entry, { force });
    if (!hasGroupIds(result.plan)) result = await getPlan(entry, { force: true });
    plans.push(result.plan);
  }
  return { plan: mergePlans(plans, groups), entries };
}

/** Wersja scalonego planu zmienia się razem z treścią którejkolwiek grupy. */
function mergedVersionOf(entries, groups, ay) {
  // Odcisk treści, nie numer wersji: numer jest licznikiem procesu i po restarcie
  // serwera wracał do #1, więc klient uznawał stary plan za aktualny.
  const stamps = entries.map((entry) => entry.store.current()?.fingerprint ?? 'brak');
  const fetchedAt = entries
    .map((entry) => entry.store.current()?.fetchedAt || entry.cache.plan?.meta?.fetchedAt)
    .filter(Boolean)
    .sort()
    .pop() || null;
  const checkedAt = entries.map((entry) => entry.store.checkedAt).filter(Boolean).sort().pop() || null;
  return {
    id: mergedVersionId(groups, ay, stamps),
    fingerprint: mergedFingerprint(stamps),
    fetchedAt,
    checkedAt,
    stamps,
  };
}

function mergedEnvelope(plan, entries, groups, ay) {
  const version = mergedVersionOf(entries, groups, ay);
  const ayStart = ay ?? currentAyStart();
  return {
    ...plan,
    ok: true,
    generatedAt: new Date().toISOString(),
    stale: false,
    error: null,
    group: groups[0],
    groups: [...groups],
    academicYear: { start: String(ayStart), label: academicYearLabel(ayStart) },
    cache: { ageSeconds: 0, ttlSeconds: Math.round((entries[0]?.cache.ttlMs || 0) / 1000) },
    version: {
      id: version.id,
      fingerprint: version.fingerprint,
      fetchedAt: version.fetchedAt,
      checkedAt: version.checkedAt,
      isCurrent: true,
      classes: plan.classes.length,
      diff: null,
      stored: 1,
      max: 1,
    },
  };
}

function classIdFromUrl(url) {
  const id = url.searchParams.get('class');
  if (!id || id.length < 3 || id.length > 400 || /[\r\n\0]/.test(id)) {
    return null;
  }
  return id;
}

/**
 * Sprawdza, czy zajęcia naprawdę istnieją w planie tej grupy (także w historii).
 * Dzięki temu publiczny upload nie pozwala tworzyć dowolnych katalogów.
 */
async function resolveClass(entry, classId) {
  for (let i = entry.store.versions.length - 1; i >= 0; i -= 1) {
    const found = entry.store.versions[i].plan?.classes?.find((c) => c.id === classId);
    if (found) return found;
  }
  if (!entry.store.versions.length) {
    const { plan } = await getPlan(entry);
    return plan?.classes?.find((c) => c.id === classId) || null;
  }
  return null;
}

/**
 * Czy zajęcia o tym identyfikatorze istnieją w planie wskazanym w adresie?
 * `?groups=` (plan scalony) sprawdza każdą grupę, `?group=` jedną. Dzięki temu
 * notatka nie powstaje dla wymyślonych zajęć, a walidacja działa też dla
 * planu z wykładem + ćwiczeniami.
 */
async function classExistsInPlan(classId, url) {
  const groups = groupsFrom(url);
  if (groups) {
    const entries = await entriesFor(groups, academicYearFromUrl(url));
    for (const entry of entries) {
      if (await resolveClass(entry, classId)) return true;
    }
    return false;
  }
  const { entry } = await entryFromUrl(url);
  return Boolean(await resolveClass(entry, classId));
}

/**
 * Adres klienta do limitów tempa.
 *
 * `CF-Connecting-IP` i `X-Forwarded-For` wypełnia klient, więc bez sprawdzenia,
 * kto je przysłał, limit dałoby się obejść rotowaniem wartości (a mapa limitów
 * rosłaby bez końca). Ufamy nagłówkom tylko wtedy, gdy połączenie przyszło
 * z proxy na tym samym hoście — steruje tym `TRUST_PROXY`:
 *   private (domyślnie) — pętla lokalna i zakresy prywatne (Docker, tunel),
 *   all                 — każde połączenie (własny reverse proxy przed aplikacją),
 *   none                — tylko `remoteAddress`, gdy port patrzy w internet.
 */
const TRUST_PROXY = String(process.env.TRUST_PROXY || 'private').toLowerCase();

function isTrustedProxy(address) {
  if (TRUST_PROXY === 'none') return false;
  if (TRUST_PROXY === 'all') return true;
  const ip = String(address || '').replace(/^::ffff:/, '');
  if (ip === '::1' || ip.startsWith('127.')) return true;
  return /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

function clientIp(req) {
  const peer = req.socket.remoteAddress || '';
  if (!isTrustedProxy(peer)) return peer || 'unknown';
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).trim();
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return peer || 'unknown';
}

/** Host bez portu — do rozpoznania licznik.mati-it.pl za tunelem. */
function requestHost(req) {
  const raw = req.headers['x-forwarded-host'] || req.headers.host || '';
  return String(raw).split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}

const uploadHits = new Map();

function checkUploadRate(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const hits = (uploadHits.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= ATTACHMENT_RATE_PER_MIN) {
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
    const err = httpError(429, 'Za dużo operacji naraz. Spróbuj ponownie za chwilę.');
    err.retryAfter = retryAfter;
    throw err;
  }
  hits.push(now);
  uploadHits.set(ip, hits);

  // Sprzątanie starych adresów, żeby mapa nie rosła bez końca.
  if (uploadHits.size > 2000) {
    for (const [key, value] of uploadHits) {
      if (!value.some((t) => now - t < windowMs)) uploadHits.delete(key);
    }
  }
}

/**
 * Limit publicznych odczytów planu.
 *
 * Każde żądanie nowego numeru grupy tworzy wpis w rejestrze i — bez cache —
 * wyprawę do uczelni, więc bez limitu enumeracja numerów zalewała i serwer,
 * i harmonogramy. 240 żądań na minutę to nadal dużo więcej, niż potrzebuje
 * jedna przeglądarka (aktualny plan + odpytywanie wersji).
 */
const PLAN_RATE_PER_MIN = Math.max(1, Number(process.env.PLAN_RATE_PER_MIN || 240));
const planHits = new Map();

function checkPlanRate(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const hits = (planHits.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= PLAN_RATE_PER_MIN) {
    planHits.set(ip, hits);
    const err = httpError(429, 'Za dużo żądań planu. Spróbuj ponownie za chwilę.');
    err.retryAfter = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
    throw err;
  }
  hits.push(now);
  planHits.set(ip, hits);

  if (planHits.size > 2000) {
    for (const [key, value] of planHits) {
      if (!value.some((t) => now - t < windowMs)) planHits.delete(key);
    }
  }
}

/**
 * Czy endpoint może dotknąć planu — a więc i serwera uczelni?
 *
 * Limit musi obejmować nie tylko `/api/plan`: załączniki wołają
 * `resolveClass()` → `getPlan()`, indeks skanuje dysk, a notatki sprawdzają,
 * czy zajęcia istnieją. Wcześniej `/api/attachments` omijało limit planu
 * i wymuszało pobranie z uczelni po wyczerpaniu limitu.
 */
function needsPlanRate(p) {
  if (p === '/api/plan' || p === '/api/version') return true;
  if (p === '/api/plan.ics' || p === '/api/plan.csv') return true;
  if (p.startsWith('/api/versions')) return true;
  if (p === '/api/attachments' || p === '/api/attachments/index') return true;
  if (p === '/api/attachments/links' || p.startsWith('/api/attachments/links/')) return true;
  if (p === '/api/notes') return true;
  return false;
}

// Licznik jest publiczny, więc limit chroni tylko przed prostym zalewaniem
// pliku zapisami. 240 wejść na minutę z jednego IP to i tak dużo więcej,
// niż realnie zrobi człowiek (nawet z kilkoma kartami).
const visitHits = new Map();

function allowVisit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const hits = (visitHits.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= VISIT_RATE_PER_MIN) {
    visitHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  visitHits.set(ip, hits);

  if (visitHits.size > 2000) {
    for (const [key, value] of visitHits) {
      if (!value.some((t) => now - t < windowMs)) visitHits.delete(key);
    }
  }
  return true;
}

// Zgłoszenia są publiczne, więc limit chroni plik przed zalaniem. 10 na minutę
// z jednego adresu wystarcza człowiekowi z kilkoma kartami.
const feedbackHits = new Map();

function allowFeedback(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const hits = (feedbackHits.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= FEEDBACK_RATE_PER_MIN) {
    feedbackHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  feedbackHits.set(ip, hits);

  if (feedbackHits.size > 2000) {
    for (const [key, value] of feedbackHits) {
      if (!value.some((t) => now - t < windowMs)) feedbackHits.delete(key);
    }
  }
  return true;
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw httpError(403, 'Nieprawidłowe źródło żądania.');
  }
  const allowedHosts = [req.headers.host, req.headers['x-forwarded-host']]
    .filter(Boolean)
    .map((h) => String(h).split(',')[0].trim());
  if (!allowedHosts.includes(originHost)) {
    throw httpError(403, 'Upload jest dozwolony tylko z tej strony.');
  }
}

function uploadedName(req, url) {
  // Wygodniejszy wariant dla API: nazwa w query zamiast własnego nagłówka.
  const fromQuery = url?.searchParams.get('name');
  if (fromQuery) {
    if (fromQuery.length > 1200) throw httpError(400, 'Nazwa pliku jest za długa.');
    return fromQuery;
  }

  const raw = req.headers['x-file-name'];
  if (!raw || Array.isArray(raw) || raw.length > 1200) {
    throw httpError(400, 'Brak nazwy pliku.');
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    throw httpError(400, 'Nieprawidłowa nazwa pliku.');
  }
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      req.resume();
      reject(httpError(413, `Plik jest za duży. Maksimum to ${Math.round(maxBytes / 1048576)} MB.`));
      return;
    }

    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        chunks.length = 0;
        fail(httpError(413, `Plik jest za duży. Maksimum to ${Math.round(maxBytes / 1048576)} MB.`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', fail);
  });
}

/** JSON dla lekkich endpointów (linki) — maks. 1 MB, żeby nie trzymać dużych ciał w RAM. */
async function readJson(req) {
  const body = await readBody(req, 1024 * 1024);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw httpError(400, 'Nieprawidłowy JSON.');
  }
}

// --- ochrona pamięci przy uploadach --------------------------------------
// Ciało żądania ląduje w RAM w całości (do 25 MB), a limit tempa dotyczy
// liczby żądań na minutę, nie liczby równoległych. Na VPS z 1,28 GB RAM
// kilka równoległych uploadów wystarczało do OOM, więc dopuszczamy tylko
// `MAX_CONCURRENT_UPLOADS` naraz i zrywamy ciało, które się nie kończy.
const MAX_CONCURRENT_UPLOADS = Math.max(1, Number(process.env.MAX_CONCURRENT_UPLOADS || 2));
const UPLOAD_TIMEOUT_MS = Math.max(1000, Number(process.env.UPLOAD_TIMEOUT_S || 120) * 1000);
let uploadsInFlight = 0;

/** Zajmuje miejsce na upload; zwraca funkcję zwalniającą (wołaj w `finally`). */
function beginUpload(req) {
  if (uploadsInFlight >= MAX_CONCURRENT_UPLOADS) {
    const err = httpError(429, 'Serwer przyjmuje teraz inne pliki — spróbuj za chwilę.');
    err.retryAfter = 15;
    throw err;
  }
  uploadsInFlight += 1;
  // Wolno sączące się ciało trzyma bufor i gniazdo — po czasie zrywamy żądanie.
  req.setTimeout(UPLOAD_TIMEOUT_MS, () => {
    req.destroy(new Error('Upload przekroczył limit czasu.'));
  });
  return () => {
    uploadsInFlight = Math.max(0, uploadsInFlight - 1);
  };
}

function contentDisposition(name) {
  const ascii = name
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .slice(0, 120);
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function attachmentLimits() {
  return {
    maxFileBytes: attachments.maxFileBytes,
    maxFilesPerClass: attachments.maxFilesPerClass,
    maxLinksPerClass: attachments.maxLinksPerClass,
    maxBytesPerClass: attachments.maxBytesPerClass,
    maxTotalBytes: attachments.maxTotalBytes,
    allowed: ALLOWED_EXTENSIONS.map((ext) => ext.slice(1)),
    allowedLabel: ALLOWED_LABEL,
  };
}

function streamAttachment(req, res, file) {
  const headers = {
    'content-type': file.mime,
    'content-length': file.size,
    'content-disposition': contentDisposition(file.name),
    'cache-control': 'private, max-age=3600',
    ...SECURITY_HEADERS,
    'cross-origin-resource-policy': 'same-origin',
  };
  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    return res.end();
  }
  res.writeHead(200, headers);
  const stream = fsSync.createReadStream(file.path);
  stream.on('error', (err) => {
    console.error('[attachments] odczyt pliku:', err.message);
    res.destroy(err);
  });
  return stream.pipe(res);
}

/**
 * Wysyła plik APK. Obsługuje `HEAD` i `Range`, bo tak wznawia pobieranie
 * systemowy DownloadManager; typ MIME `application/vnd.android.package-archive`
 * pozwala przeglądarce od razu rozpoznać instalator.
 */
function streamApk(req, res, file, release) {
  const headers = {
    'content-type': 'application/vnd.android.package-archive',
    'content-disposition': contentDisposition(file.name),
    'cache-control': 'no-cache',
    'accept-ranges': 'bytes',
    ...SECURITY_HEADERS,
  };
  // Suma kontrolna tylko dla pliku, którego dotyczy manifest — dla starszego
  // wydania nie znamy już hasha i nie zmyślamy go.
  if (release && release.apkFile === file.name) {
    headers['x-checksum-sha256'] = release.sha256;
  }

  const range = parseRange(req.headers.range, file.size);
  if (range === 'invalid') {
    res.writeHead(416, {
      'content-type': 'text/plain; charset=utf-8',
      'content-range': `bytes */${file.size}`,
    });
    return res.end('Nieprawidłowy zakres bajtów');
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : file.size - 1;
  res.writeHead(range ? 206 : 200, {
    ...headers,
    'content-length': Math.max(0, end - start + 1),
    ...(range ? { 'content-range': `bytes ${start}-${end}/${file.size}` } : {}),
  });
  if (req.method === 'HEAD') return res.end();

  const stream = fsSync.createReadStream(file.path, { start, end });
  stream.on('error', (err) => {
    console.error('[app] odczyt APK:', err.message);
    res.destroy(err);
  });
  return stream.pipe(res);
}

// --- ochrona serwera uczelni ---------------------------------------------
// Jedno pobranie planu to dwa żądania HTTP do harmonogramy.ideis.pl. Bez
// wspólnego semafora równoległe żądania różnych grup (enumeracja numerów)
// wysyłały ich setki naraz — ryzyko zablokowania IP VPS, a wtedy aplikacja
// przestaje się aktualizować. Kolejka trzyma maksymalnie `FETCH_CONCURRENCY`
// pobrań naraz; reszta czeka, nie zajmując pamięci.
const FETCH_CONCURRENCY = Math.max(1, Number(process.env.FETCH_CONCURRENCY || 2));
let fetchSlotsUsed = 0;
const fetchQueue = [];

function acquireFetchSlot() {
  if (fetchSlotsUsed < FETCH_CONCURRENCY) {
    fetchSlotsUsed += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => fetchQueue.push(resolve));
}

function releaseFetchSlot() {
  const next = fetchQueue.shift();
  if (next) next();
  else fetchSlotsUsed = Math.max(0, fetchSlotsUsed - 1);
}

/** Pobranie planu z uczelni z limitem jednoczesnych zapytań. */
async function fetchPlanLimited(groupId, options) {
  await acquireFetchSlot();
  try {
    return await fetchPlan(groupId, options);
  } finally {
    releaseFetchSlot();
  }
}

/** Pobiera wpis grupy i dba, by jej plan z dysku był wczytany przed obsługą. */
async function entryFor(key) {
  const entry = registry.get(key);
  await registry.ensureLoaded(entry);
  return entry;
}

/** Pobiera plan (z cache lub z uczelni) i dokłada go do historii wersji grupy. */
async function getPlan(entry, { force = false } = {}) {
  await registry.ensureLoaded(entry);
  return entry.cache.get({
    force,
    fetchFn: async () => {
      const plan = await fetchPlanLimited(groupIdOf(entry.id), { window: entryWindow(entry.id) });
      entry.store.add(plan);
      return plan;
    },
  });
}

/** Rok akademicki wpisu rejestru: „21188@2025” → { start: '2025', label: '2025/2026' }. */
function entryAcademicYear(entryId) {
  const ay = String(entryId).split('@')[1];
  const start = ay ? Number(ay) : currentAyStart();
  return { start: String(start), label: academicYearLabel(start) };
}

function envelope(plan, entry, { version, stale = false, error = null, ageMs = 0 } = {}) {
  return {
    ...plan,
    ok: true,
    generatedAt: new Date().toISOString(),
    stale,
    error,
    group: groupIdOf(entry.id),
    academicYear: entryAcademicYear(entry.id),
    cache: {
      ageSeconds: Math.round((ageMs || 0) / 1000),
      ttlSeconds: Math.round(entry.cache.ttlMs / 1000),
    },
    version: version
      ? {
        id: version.id,
        fingerprint: version.fingerprint,
        fetchedAt: version.fetchedAt,
        checkedAt: entry.store.checkedAt,
        isCurrent: version === entry.store.current(),
        classes: version.classes,
        diff: version.diff?.counts || null,
        stored: entry.store.versions.length,
        max: entry.store.max,
      }
      : null,
  };
}

/** Ostatni katalog — do /health i do rozgrzewania planów po starcie. */
let lastCatalog = null;

function catalogSummary() {
  if (!lastCatalog) return { ready: false };
  return {
    ready: true,
    count: lastCatalog.groups.length,
    savedAt: lastCatalog.savedAt,
    stale: Boolean(lastCatalog.stale),
  };
}

/**
 * Katalog w formie „drutowej” — krótkie klucze, bo pełna lista to ~2100 grup.
 * Kształt definiuje public/selection.js (toWire), żeby przeglądarka i serwer
 * porównywały dokładnie te same pola.
 */
function wireGroups(groups) {
  return groups.map(selection.toWire);
}

async function loadCatalog({ force = false } = {}) {
  const catalog = await getCatalog({ force });
  lastCatalog = { groups: catalog.groups, savedAt: catalog.savedAt, stale: catalog.stale };
  return catalog;
}

/**
 * Numer kierunku z formularza uczelni (albo `katalog:Nazwa` z listy awaryjnej)
 * → pole „Kierunek” katalogu. Wspólne dla specjalności i trybów, żeby oba
 * endpointy tłumaczyły identyfikator tak samo.
 *
 * @returns {Promise<{field:string,label:string,site:boolean}|null>}
 */
async function resolveField(groups, kierunek, { force = false } = {}) {
  if (kierunek.startsWith('katalog:')) {
    const field = kierunek.slice('katalog:'.length);
    return field ? { field, label: field, site: false } : null;
  }
  let siteKierunki = [];
  try {
    siteKierunki = (await combos.kierunki({ force })).items;
  } catch { /* lista z formularza jest opcjonalna */ }
  const known = ideisSelection.kierunkiFor(groups, siteKierunki).find((item) => item.id === kierunek);
  return known ? { field: known.field, label: known.label, site: true } : null;
}

/** ETag z rozmiaru i czasu modyfikacji — bez czytania pliku do pamięci. */
function etagOf(stat) {
  return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

/** Czy `If-None-Match` klienta pasuje do ETagu (lista, słabe walidatory). */
function etagMatches(header, etag) {
  if (!header) return false;
  return String(header)
    .split(',')
    .some((tag) => tag.trim().replace(/^W\//, '') === etag || tag.trim() === '*');
}

/**
 * Wysyła plik statyczny z ETagiem.
 *
 * `cache-control: no-cache` zostaje (po aktualizacji pliki mają być świeże),
 * ale przeglądarka dostaje 304 zamiast całego ciała, gdy nic się nie zmieniło —
 * wcześniej każde wejście pobierało wszystkie assety od nowa.
 */
async function sendFile(req, res, filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw Object.assign(new Error('To nie jest plik'), { code: 'ENOENT' });
  }
  const etag = etagOf(stat);
  const headers = {
    'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-cache',
    ...SECURITY_HEADERS,
    etag,
  };
  if (etagMatches(req.headers['if-none-match'], etag)) {
    res.writeHead(304, headers);
    return res.end();
  }
  const file = await fs.readFile(filePath);
  res.writeHead(200, { ...headers, 'content-length': file.length });
  if (req.method === 'HEAD') return res.end();
  return res.end(file);
}

async function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const target = path.join(PUBLIC_DIR, rel);

  // `startsWith(PUBLIC_DIR)` bez separatora przepuszczało `/public-cos/...`:
  // katalog `public` i katalog `public-evil` mają wspólny prefiks.
  if (!target.startsWith(PUBLIC_DIR + path.sep)) {
    return sendText(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
  }

  try {
    return await sendFile(req, res, target);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
      try {
        return await sendFile(req, res, path.join(PUBLIC_DIR, 'index.html'));
      } catch {
        return sendText(res, 404, 'Nie znaleziono', 'text/plain; charset=utf-8');
      }
    }
    return sendText(res, 500, 'Błąd serwera', 'text/plain; charset=utf-8');
  }
}

/**
 * Adres żądania bez udziału nagłówka `Host`.
 *
 * `Host` pochodzi od klienta, a `new URL()` z niepoprawną bazą rzuca TypeError.
 * Wcześniej działo się to poza `try`, więc jedno żądanie z `Host: [` kończyło
 * proces (ERR_INVALID_URL) — wystarczyło do zdalnego ubicia serwera.
 * Do routingu `Host` nie jest potrzebny (czyta go tylko `requestHost`), więc
 * baza jest stała i nie da się jej zepsuć nagłówkiem.
 */
function requestUrl(req) {
  try {
    return new URL(req.url || '/', 'http://localhost');
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const url = requestUrl(req);
  if (!url) {
    return sendText(res, 400, 'Nieprawidłowe żądanie', 'text/plain; charset=utf-8',
      { 'cache-control': 'no-store' });
  }
  const p = url.pathname;

  try {
    // Jeden limit dla wszystkich ścieżek, które mogą dotknąć planu — także
    // `/api/attachments` (resolveClass → getPlan) i `/api/notes` (sprawdzenie
    // istnienia zajęć). Wcześniej wystarczyło ominąć `/api/plan`.
    if (needsPlanRate(p)) checkPlanRate(clientIp(req));

    if (p === '/health') {
      const entry = registry.get(DEFAULT_GROUP);
      const current = entry.store.current();
      const weekend = isWeekend();
      const gapMin = scheduleGapMinutes();
      return json(res, 200, {
        ok: true,
        groupId: DEFAULT_GROUP,
        defaultGroup: DEFAULT_GROUP,
        defaultSelection: defaultSelection(),
        academicYear: {
          start: String(currentAyStart()),
          label: academicYearLabel(currentAyStart()),
        },
        catalog: catalogSummary(),
        hasPlan: Boolean(current),
        versions: entry.store.versions.length,
        maxVersions: entry.store.max,
        lastCheck: entry.store.checkedAt,
        checks: entry.store.checks,
        refreshing: Boolean(entry.cache.inFlight),
        lastError: entry.cache.error,
        uptimeSeconds: Math.round(process.uptime()),
        memoryMB: Math.round(process.memoryUsage().rss / 1048576),
        groups: registry.snapshot(),
        attachments: {
          maxFileMB: ATTACHMENT_MAX_MB,
          maxFilesPerClass: ATTACHMENT_MAX_FILES,
          maxClassMB: ATTACHMENT_CLASS_MAX_MB,
          maxTotalMB: ATTACHMENT_TOTAL_MAX_MB,
        },
        schedule: {
          mode: weekend ? 'weekend' : 'weekday',
          everyMinutes: gapMin,
          lastCheckAt: lastCheckAt ? new Date(lastCheckAt).toISOString() : null,
          nextCheckAt: lastCheckAt ? new Date(lastCheckAt + gapMin * 60000).toISOString() : null,
        },
      });
    }

    // --- wydania aplikacji Android ----------------------------------------
    // Aplikacja nie jest w żadnym sklepie, więc sama pyta o nową wersję:
    // `GET /api/app/latest?versionCode=N`. Ten sam kontrakt co w wersji bazowej.
    if (p === '/api/app/latest') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'GET, HEAD' });
      }
      const release = await releases.latest();
      if (!release) {
        // 200, nie 404: brak wydania to normalny stan (aplikacja jeszcze nie
        // opublikowana), a przeglądarka logowałaby 404 w konsoli przy każdym
        // starcie. Aplikacja Android dostaje `versionCode: 0`, czyli „brak
        // aktualizacji”, tak samo jak wcześniej z 404.
        return json(res, 200, {
          ok: true,
          published: false,
          release: null,
          versionCode: 0,
          updateAvailable: false,
          generatedAt: new Date().toISOString(),
        });
      }
      const current = Number(url.searchParams.get('versionCode'));
      return json(res, 200, {
        ok: true,
        ...release,
        updateAvailable: Number.isInteger(current) && current > 0
          ? release.versionCode > current
          : null,
        generatedAt: new Date().toISOString(),
      });
    }

    // Stały adres do pobrania najnowszego APK — używany przez link „Aplikacja
    // Android”, żeby nazwa pliku nie musiała być nigdzie wpisana.
    if (p === '/api/app/apk') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'GET, HEAD' });
      }
      const release = await releases.latest().catch(() => null);
      if (!release) {
        return json(res, 404, { ok: false, error: 'Nie opublikowano jeszcze żadnej wersji aplikacji.' });
      }
      res.writeHead(302, { location: release.apkUrl, 'cache-control': 'no-store' });
      return res.end();
    }

    if (p.startsWith('/api/app/download/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'GET, HEAD' });
      }
      let name = '';
      try {
        name = decodeURIComponent(p.slice('/api/app/download/'.length));
      } catch {
        name = '';
      }
      const file = await releases.apk(name);
      if (!file) {
        return json(res, 404, { ok: false, error: 'Nie ma takiego pliku instalacyjnego.' });
      }
      // Błąd manifestu nie może zablokować pobierania pliku, który istnieje.
      const release = await releases.latest().catch(() => null);
      return streamApk(req, res, file, release);
    }

    // --- licznik wejść ----------------------------------------------------
    // Strona licznika działa pod każdym hostem (wygodne testy lokalne),
    // a na hoście licznika "/" od razu na nią przekierowuje.
    if (p === '/' && COUNTER_HOST && requestHost(req) === COUNTER_HOST) {
      res.writeHead(302, { location: '/licznik', 'cache-control': 'no-store' });
      return res.end();
    }

    if (p === '/licznik' || p === '/licznik/' || p === '/wejscia' || p === '/wejscia/') {
      return sendText(res, 200, renderVisitsPage(visits.snapshot(), { appUrl: APP_URL }),
        'text/html; charset=utf-8', { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
    }

    if (p === '/api/visits') {
      if (req.method !== 'GET') {
        return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'GET' });
      }
      return json(res, 200, { ok: true, ...visits.snapshot() });
    }

    if (p === '/api/visit') {
      if (req.method !== 'POST') {
        return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'POST' });
      }
      assertSameOrigin(req);

      const raw = await readBody(req, 1024); // wejście to kilka bajtów, nie plik
      let body;
      try {
        body = JSON.parse(raw.toString('utf8') || '{}');
      } catch {
        return json(res, 400, { ok: false, error: 'Nieprawidłowy JSON.' });
      }

      if (!allowVisit(clientIp(req))) {
        // Ponad limit nie zliczamy, ale odpowiadamy 204 — klient nie ma
        // powodu ponawiać i kolejkować tego samego wejścia w nieskończoność.
        res.writeHead(204, { 'cache-control': 'no-store' });
        return res.end();
      }

      await visits.record(['web', 'pwa', 'apk'].includes(body?.source) ? body.source : 'web');
      res.writeHead(204, { 'cache-control': 'no-store' });
      return res.end();
    }

    // --- notatki na kafelkach zajęć ---------------------------------------
    // Notatka jest wspólna: identyfikator zajęć jest ten sam u wszystkich, więc
    // „Kolos” dopisany przez jedną osobę widzą wszyscy — i każdy może go zmienić
    // albo usunąć. Pusta treść usuwa notatkę.
    if (p === '/api/notes') {
      if (req.method === 'GET' || req.method === 'HEAD') {
        return json(res, 200, {
          ok: true,
          maxLength: notes.maxLength,
          notes: notes.snapshot(),
        });
      }

      if (req.method === 'POST') {
        assertSameOrigin(req);
        // Tylko JSON: formularz z innej strony nie ustawi tego nagłówka, więc
        // nie da się dopisać notatki „przy okazji” cudzego kliknięcia.
        if (!String(req.headers['content-type'] || '').includes('application/json')) {
          return json(res, 415, { ok: false, error: 'Wymagany nagłówek content-type: application/json.' });
        }
        // Notatka to treść od użytkownika, więc dzieli limit z uploadem —
        // jedno i drugie pisze na wolumen.
        checkUploadRate(clientIp(req));

        const raw = await readBody(req, 4096); // notatka to kilkanaście bajtów
        let body;
        try {
          body = JSON.parse(raw.toString('utf8') || '{}');
        } catch {
          return json(res, 400, { ok: false, error: 'Nieprawidłowy JSON.' });
        }

        // Notatka musi dotyczyć zajęć, które **naprawdę są w planie**: sam
        // format identyfikatora pozwalał dopisać `2099-01-01|…|Fake` (200 OK),
        // zapełnić limit 5000 wpisów i nigdy tego nie posprzątać (prune kasuje
        // tylko stare daty). Data musi mieścić się w oknie roku akademickiego.
        if (!isValidClassId(body?.classId)) {
          return json(res, 400, { ok: false, error: 'Nieprawidłowy identyfikator zajęć.' });
        }
        if (!dayInRange(body.classId)) {
          return json(res, 400, {
            ok: false,
            error: 'Notatka może dotyczyć tylko zajęć z bieżącego roku akademickiego.',
          });
        }
        // Usunięcie notatki nie wymaga istnienia zajęć: plan u uczelni się
        // zmienia (zajęcia wypadają, godziny się przesuwają), a została po nich
        // plakietka, którą trzeba móc zdjąć. Pusta treść = zawsze wolno.
        const clearing = String(body?.text ?? '').trim().length === 0;
        if (!clearing && !(await classExistsInPlan(body.classId, url))) {
          return json(res, 404, {
            ok: false,
            error: 'Nie znaleziono tych zajęć w planie — odśwież plan i spróbuj ponownie.',
          });
        }

        const saved = await notes.set(body.classId, body.text);
        return json(res, 200, {
          ok: true,
          classId: saved.classId,
          text: saved.text,
          maxLength: notes.maxLength,
        });
      }

      return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'GET, POST' });
    }

    // --- dokumentacja API -------------------------------------------------
    if (p === '/api' || p === '/api/docs') {
      return json(res, 200, apiSummary(attachmentLimits()));
    }
    if (p === '/api/openapi.json') {
      return json(res, 200, openApiDocument(attachmentLimits()));
    }

    // --- wybór jak na stronie uczelni ------------------------------------
    // Kreator ma kolejność: kierunek → rocznik (nabór) → specjalność
    // (opcjonalna) → tryb. Każda lista pokazuje tylko wartości, które mają
    // grupy w katalogu (`ideis-options.js`): roczniki per kierunek,
    // specjalności per kierunek i rocznik, tryby per cały wybór. Listy
    // oficjalnych nazw pochodzą z formularza uczelni (`ideis-combos.js`).
    if (p === '/api/ideis/kierunki') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'GET, HEAD' });
      }
      assertForceAllowed(req, url);
      const catalog = await loadCatalog({});
      const groups = catalog.groups;
      const force = forceRequested(url);
      // Rok akademicki wyboru — z niego wynika rok studiów dla rocznika.
      // Bez parametru bierzemy bieżący (ten sam, który podaje `/api/groups`).
      const ay = Number(url.searchParams.get('ay')) || currentAyStart();
      let siteItems = [];
      let warning = null;
      try {
        const list = await combos.kierunki({ force });
        siteItems = list.items;
        warning = list.error ? 'Nie udało się odświeżyć listy u uczelni — pokazuję ostatnią znaną.' : null;
      } catch (err) {
        // Uczelnia nie odpowiada: kierunki bierzemy z katalogu grup, żeby
        // picker nadal dał się użyć (bez specjalności z formularza).
        warning = 'Lista kierunków z formularza uczelni jest chwilowo niedostępna — pokazuję kierunki z katalogu.';
        siteItems = [...new Set(groups.map((group) => group.field).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, 'pl'))
          .map((field) => ({ id: `katalog:${field}`, label: field }));
      }
      return json(res, 200, {
        ok: true,
        faculty: combos.FACULTY,
        // Roczniki per kierunek: krok 2 kreatora pokazuje tylko te, które mają
        // grupy na tym kierunku — lista z formularza uczelni jest wspólna dla
        // całego wydziału i bez tego prowadziłaby w pustkę.
        items: ideisSelection.kierunkiFor(groups, siteItems).map((item) => ({
          ...item,
          nabory: item.missing ? [] : ideisOptions.cohorts(groups, item.field, { ay }),
        })),
        warning,
        fetchedAt: new Date().toISOString(),
      });
    }

    if (p === '/api/ideis/specjalnosci') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'GET, HEAD' });
      }
      const kierunek = String(url.searchParams.get('kierunek') || '').trim();
      if (!kierunek) return json(res, 400, { ok: false, error: 'Brak kierunku (parametr „kierunek”).' });
      // Rocznik zawęża listę: pokazujemy tylko specjalności, które mają grupy
      // w tym roczniku (plus „bez specjalności”). Bez parametru — cały kierunek.
      const nabor = String(url.searchParams.get('nabor') || '').trim();
      const ay = Number(url.searchParams.get('ay')) || currentAyStart();
      assertForceAllowed(req, url);
      const catalog = await loadCatalog({});
      const groups = catalog.groups;
      const force = forceRequested(url);

      const resolved = await resolveField(groups, kierunek, { force });
      if (!resolved) return json(res, 404, { ok: false, error: 'Nie znam tego kierunku.' });

      let siteItems = [];
      let warning = null;
      if (resolved.site) {
        try {
          const list = await combos.specjalnosci(kierunek, { force });
          siteItems = list.items;
          warning = list.error ? 'Nie udało się odświeżyć listy u uczelni — pokazuję ostatnią znaną.' : null;
        } catch (err) {
          warning = 'Lista specjalności z formularza uczelni jest chwilowo niedostępna — pokazuję specjalności z katalogu.';
        }
      }
      const result = ideisOptions.specsFor(groups, resolved.field, nabor, siteItems, { ay });
      return json(res, 200, {
        ok: true,
        kierunek: { id: kierunek, label: resolved.label, field: resolved.field },
        nabor: nabor || null,
        items: result.items,
        // Ile grup w tym roczniku nie ma specjalności — podpis „bez specjalności”.
        noSpecGroups: result.noSpecGroups,
        groups: result.groups,
        warning,
        fetchedAt: new Date().toISOString(),
      });
    }

    // Tryby studiów dostępne w wyborze — krok 4 kreatora. Tylko wartości, które
    // mają grupy w tym roczniku i specjalności; etykiety liczy klient
    // (`MODE_LABELS` w webie, `SelectionLabels.MODE` w APK).
    if (p === '/api/ideis/tryby') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'GET, HEAD' });
      }
      const kierunek = String(url.searchParams.get('kierunek') || '').trim();
      if (!kierunek) return json(res, 400, { ok: false, error: 'Brak kierunku (parametr „kierunek”).' });
      const nabor = String(url.searchParams.get('nabor') || '').trim();
      const spec = String(url.searchParams.get('spec') || '').trim();
      const ay = Number(url.searchParams.get('ay')) || currentAyStart();
      const catalog = await loadCatalog({});
      const groups = catalog.groups;
      const resolved = await resolveField(groups, kierunek, {});
      if (!resolved) return json(res, 404, { ok: false, error: 'Nie znam tego kierunku.' });
      return json(res, 200, {
        ok: true,
        kierunek: { id: kierunek, label: resolved.label, field: resolved.field },
        nabor: nabor || null,
        spec: spec || null,
        items: ideisOptions.modesFor(groups, resolved.field, nabor, spec, { ay }),
        fetchedAt: new Date().toISOString(),
      });
    }

    // --- katalog grup ----------------------------------------------------
    // Pełny katalog z wymiarami (kierunek, specjalność, rok, nabór, typ).
    // Zakresu nie filtrujemy na serwerze — wybiera go użytkownik w pickerze.
    if (p === '/api/groups') {
      if (!requireReadOnly(req, res)) return;
      assertForceAllowed(req, url);
      const force = forceRequested(url);
      const catalog = await loadCatalog({ force });
      return json(res, 200, {
        ok: true,
        defaultGroup: DEFAULT_GROUP,
        defaults: defaultSelection(),
        academicYear: {
          start: String(currentAyStart()),
          label: academicYearLabel(currentAyStart()),
        },
        savedAt: catalog.savedAt,
        stale: catalog.stale,
        error: catalog.error,
        count: catalog.groups.length,
        groups: wireGroups(catalog.groups),
      });
    }

    // --- załączniki do zajęć ---------------------------------------------
    // Indeks „które zajęcia mają materiały” — nowy interfejs rysuje z niego
    // spinacz przy zajęciach, zamiast pytać o każdą kartę osobno.
    if (p === '/api/attachments/index') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'GET, HEAD' });
      }
      const found = await attachments.index();
      const classes = {};
      for (const [classId, counts] of found) classes[classId] = counts;
      return json(res, 200, {
        ok: true,
        classes,
        generatedAt: new Date().toISOString(),
      });
    }

    if (p === '/api/attachments') {
      const classId = classIdFromUrl(url);
      if (!classId) return json(res, 400, { ok: false, error: 'Brak identyfikatora zajęć.' });

      // Materiały trzymamy przy numerze grupy (bez roku akademickiego), bo
      // identyfikator zajęć zawiera już datę i godzinę. Wpis planu musi być
      // jednak z tego samego roku, w którym użytkownik widzi zajęcia.
      const { gid, entry } = await entryFromUrl(url);
      const cls = await resolveClass(entry, classId);
      if (!cls) {
        return json(res, 404, {
          ok: false,
          error: 'Nie znaleziono tych zajęć w planie grupy — odśwież plan i spróbuj ponownie.',
        });
      }

      if (req.method === 'GET') {
        const data = await attachments.list(gid, classId);
        return json(res, 200, {
          ok: true,
          group: gid,
          classId,
          class: classInfoOf(cls),
          ...data,
          limits: attachmentLimits(),
        });
      }

      if (req.method === 'POST') {
        assertSameOrigin(req);
        if (req.headers['x-plan-upload'] !== '1') {
          return json(res, 400, { ok: false, error: 'Brak nagłówka uploadu.' });
        }
        checkUploadRate(clientIp(req));
        const name = uploadedName(req, url);
        // Typ sprawdzamy **przed** wczytaniem ciała: nie ma sensu trzymać
        // w RAM 25 MB pliku, który i tak zostanie odrzucony.
        if (!ALLOWED_EXTENSIONS.includes(path.extname(name).toLowerCase())) {
          return json(res, 415, { ok: false, error: `Dozwolone typy: ${ALLOWED_LABEL}.` });
        }
        const endUpload = beginUpload(req);
        let body;
        try {
          body = await readBody(req, attachments.maxFileBytes);
        } finally {
          endUpload();
        }
        const result = await attachments.add(gid, classId, { name, data: body, classInfo: cls });
        return json(res, 201, {
          ok: true,
          group: gid,
          classId,
          ...result,
          limits: attachmentLimits(),
        });
      }

      return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'GET, POST' });
    }

    // --- linki do materiałów ---------------------------------------------
    if (p === '/api/attachments/links') {
      if (req.method !== 'POST') {
        return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'POST' });
      }

      const classId = classIdFromUrl(url);
      if (!classId) return json(res, 400, { ok: false, error: 'Brak identyfikatora zajęć.' });

      const { gid, entry } = await entryFromUrl(url);
      const cls = await resolveClass(entry, classId);
      if (!cls) {
        return json(res, 404, {
          ok: false,
          error: 'Nie znaleziono tych zajęć w planie grupy — odśwież plan i spróbuj ponownie.',
        });
      }

      assertSameOrigin(req);
      if (req.headers['x-plan-upload'] !== '1') {
        return json(res, 400, { ok: false, error: 'Brak nagłówka uploadu.' });
      }
      checkUploadRate(clientIp(req));

      const payload = await readJson(req);
      const result = await attachments.addLink(gid, classId, {
        url: payload?.url,
        title: payload?.title,
        classInfo: cls,
      });
      return json(res, 201, {
        ok: true,
        group: gid,
        classId,
        ...result,
        limits: attachmentLimits(),
      });
    }

    if (p.startsWith('/api/attachments/links/')) {
      if (req.method !== 'DELETE') {
        return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'DELETE' });
      }
      const id = p.slice('/api/attachments/links/'.length);
      if (!/^[a-f0-9]{24}$/.test(id)) {
        return json(res, 404, { ok: false, error: 'Nie znaleziono linku.' });
      }
      const gid = groupFrom(url);
      const classId = classIdFromUrl(url);
      if (!classId) return json(res, 400, { ok: false, error: 'Brak identyfikatora zajęć.' });

      assertSameOrigin(req);
      if (req.headers['x-plan-upload'] !== '1') {
        return json(res, 400, { ok: false, error: 'Brak nagłówka operacji.' });
      }
      checkUploadRate(clientIp(req));

      const result = await attachments.removeLink(gid, classId, id);
      return json(res, 200, {
        ok: true,
        group: gid,
        classId,
        ...result,
        limits: attachmentLimits(),
      });
    }

    if (p.startsWith('/api/attachments/')) {
      const id = p.slice('/api/attachments/'.length);
      if (!/^[a-f0-9]{24}$/.test(id)) {
        return json(res, 404, { ok: false, error: 'Nie znaleziono załącznika.' });
      }
      const gid = groupFrom(url);
      const classId = classIdFromUrl(url);
      if (!classId) return json(res, 400, { ok: false, error: 'Brak identyfikatora zajęć.' });

      if (req.method === 'DELETE') {
        assertSameOrigin(req);
        if (req.headers['x-plan-upload'] !== '1') {
          return json(res, 400, { ok: false, error: 'Brak nagłówka operacji.' });
        }
        checkUploadRate(clientIp(req));
        const result = await attachments.remove(gid, classId, id);
        return json(res, 200, {
          ok: true,
          group: gid,
          classId,
          ...result,
          limits: attachmentLimits(),
        });
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'GET, HEAD, DELETE' });
      }
      const file = await attachments.open(gid, classId, id);
      return streamAttachment(req, res, file);
    }

    // --- propozycje i błędy -----------------------------------------------
    // Anonimowe zgłoszenia: bez konta i bez adresu e-mail. Lista jest publiczna
    // (tak jak cały plan), a usuwanie wpisów wymaga tokenu z .env.
    if (p === '/api/feedback') {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 200)));
        const items = await feedback.list({ limit });
        return json(res, 200, {
          ok: true,
          items,
          count: items.length,
          canModerate: Boolean(FEEDBACK_TOKEN),
        });
      }

      if (req.method === 'POST') {
        assertSameOrigin(req);
        if (!allowFeedback(clientIp(req))) {
          throw Object.assign(
            httpError(429, 'Za dużo zgłoszeń naraz. Spróbuj ponownie za chwilę.'),
            { retryAfter: 60 },
          );
        }
        const raw = await readBody(req, 16 * 1024);
        let payload;
        try {
          payload = JSON.parse(raw.toString('utf8') || '{}');
        } catch {
          return json(res, 400, { ok: false, error: 'Nieprawidłowy JSON.' });
        }
        const item = await feedback.add(payload);
        return json(res, 201, { ok: true, item });
      }

      return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'GET, POST' });
    }

    if (p.startsWith('/api/feedback/')) {
      if (req.method !== 'DELETE') {
        return json(res, 405, { ok: false, error: 'Metoda niedozwolona.' }, { allow: 'DELETE' });
      }
      if (!FEEDBACK_TOKEN) {
        return json(res, 503, {
          ok: false,
          error: 'Usuwanie zgłoszeń jest wyłączone — ustaw FEEDBACK_TOKEN w .env.',
        });
      }
      if (String(req.headers['x-feedback-token'] || '') !== FEEDBACK_TOKEN) {
        return json(res, 403, { ok: false, error: 'Brak uprawnień do usunięcia zgłoszenia.' });
      }
      const id = p.slice('/api/feedback/'.length);
      const removed = await feedback.remove(id);
      if (!removed) return json(res, 404, { ok: false, error: 'Nie znaleziono zgłoszenia.' });
      return json(res, 200, { ok: true, id });
    }

    // Strona do przeglądania zgłoszeń (ta sama lista co w API, bez logowania).
    if (p === '/propozycje' || p === '/propozycje/' || p === '/propozycje.html') {
      return serveStatic(req, res, '/propozycje.html');
    }

    // --- plan ------------------------------------------------------------
    if (p === '/api/plan') {
      if (!requireReadOnly(req, res)) return;
      const groups = groupsFrom(url);
      if (groups) {
        const ay = academicYearFromUrl(url);
        const { plan, entries } = await mergedPlan(groups, ay);
        return json(res, 200, mergedEnvelope(plan, entries, groups, ay));
      }
      const { entry } = await entryFromUrl(url);
      const wanted = url.searchParams.get('version');
      if (wanted) {
        const version = entry.store.get(wanted);
        if (!version) return json(res, 404, { ok: false, error: `Nie ma wersji ${wanted}` });
        return json(res, 200, envelope(version.plan, entry, { version }));
      }
      const result = await getPlan(entry);
      return json(res, 200, envelope(result.plan, entry, {
        version: entry.store.current(),
        stale: result.stale,
        error: result.error,
        ageMs: result.ageMs,
      }));
    }

    // --- lekki status (do odpytywania z przeglądarki) --------------------
    if (p === '/api/version') {
      if (!requireReadOnly(req, res)) return;
      const groups = groupsFrom(url);
      if (groups) {
        const ay = academicYearFromUrl(url);
        const entries = await entriesFor(groups, ay);
        const version = mergedVersionOf(entries, groups, ay);
        return json(res, 200, {
          ok: true,
          groupId: groups[0],
          groupIds: groups,
          lastCheck: version.checkedAt,
          currentId: version.id,
          currentFingerprint: version.fingerprint,
          currentFetchedAt: version.fetchedAt,
          checkedAt: version.checkedAt,
          stored: 1,
          versionIds: [version.id],
        });
      }
      const { entry } = await entryFromUrl(url);
      return json(res, 200, { ok: true, lastCheck: entry.store.checkedAt, ...entry.store.summary() });
    }

    // --- historia --------------------------------------------------------
    if (p === '/api/versions') {
      if (!requireReadOnly(req, res)) return;
      const { entry } = await entryFromUrl(url);
      return json(res, 200, {
        ok: true,
        summary: entry.store.summary(),
        versions: entry.store.list(),
      });
    }

    if (p.startsWith('/api/versions/')) {
      if (!requireReadOnly(req, res)) return;
      const { entry } = await entryFromUrl(url);
      const id = p.split('/').pop();
      const version = entry.store.get(id);
      if (!version) return json(res, 404, { ok: false, error: `Nie ma wersji ${id}` });
      return json(res, 200, envelope(version.plan, entry, { version }));
    }

    // --- eksporty --------------------------------------------------------
    if (p === '/api/plan.ics' || p === '/api/plan.csv') {
      if (!requireReadOnly(req, res)) return;
      const { gid, entry } = await entryFromUrl(url);
      const wanted = url.searchParams.get('version');
      let plan;
      let version = null;
      if (wanted) {
        version = entry.store.get(wanted);
        if (!version) return json(res, 404, { ok: false, error: `Nie ma wersji ${wanted}` });
        plan = version.plan;
      } else {
        const result = await getPlan(entry);
        plan = result.plan;
      }

      const suffix = version ? `-v${version.id}` : '';
      const aySuffix = `-${entryAcademicYear(entry.id).start}`;
      if (p.endsWith('.ics')) {
        return sendText(res, 200, toICS(plan), 'text/calendar; charset=utf-8', {
          'content-disposition': `inline; filename="plan-zajec-${gid}${aySuffix}${suffix}.ics"`,
        });
      }
      return sendText(res, 200, toCSV(plan), 'text/csv; charset=utf-8', {
        'content-disposition': `attachment; filename="plan-zajec-${gid}${aySuffix}${suffix}.csv"`,
      });
    }

    // --- wymuszone sprawdzenie -------------------------------------------
    if (p === '/api/refresh' && req.method === 'POST') {
      // Na produkcji przycisk „Odśwież” nie może być anonimowym kopniakiem dla
      // serwera uczelni: bez REFRESH_TOKEN wymuszone sprawdzenia są wyłączone
      // (web schodzi wtedy do zwykłego GET /api/plan — patrz `fetchPlanEnvelope`).
      if (!REFRESH_TOKEN && process.env.NODE_ENV === 'production') {
        return json(res, 503, {
          ok: false,
          error: 'Ręczne odświeżanie jest wyłączone — ustaw REFRESH_TOKEN w .env.',
        });
      }
      if (REFRESH_TOKEN) {
        const token = req.headers['x-refresh-token'] || url.searchParams.get('token');
        if (token !== REFRESH_TOKEN) return json(res, 401, { ok: false, error: 'Nieprawidłowy token' });
      }

      const groups = groupsFrom(url);
      if (groups) {
        const ay = academicYearFromUrl(url);
        const entries = await entriesFor(groups, ay);
        // Ten sam limit co dla jednej grupy — chroni serwer uczelni.
        const since = Math.max(...entries.map((entry) => Date.now() - entry.lastForceAt));
        const throttled = entries.some((entry) => entry.store.current())
          && since < REFRESH_MIN_GAP_S * 1000;
        if (throttled) {
          const { plan } = await mergedPlan(groups, ay);
          return json(res, 200, {
            ...mergedEnvelope(plan, entries, groups, ay),
            newVersion: false,
            throttled: true,
            retryAfterSeconds: Math.ceil((REFRESH_MIN_GAP_S * 1000 - since) / 1000),
          });
        }
        const before = mergedVersionOf(entries, groups, ay).id;
        for (const entry of entries) entry.lastForceAt = Date.now();
        lastCheckAt = Date.now();
        const { plan } = await mergedPlan(groups, ay, { force: true });
        const after = mergedVersionOf(entries, groups, ay).id;
        return json(res, 200, {
          ...mergedEnvelope(plan, entries, groups, ay),
          newVersion: after !== before,
        });
      }

      const { entry } = await entryFromUrl(url);

      // Ochrona serwera uczelni: przycisk jest publiczny, więc ręczne
      // sprawdzenia nie mogą iść częściej niż REFRESH_MIN_GAP_S sekund.
      const sinceLast = Date.now() - entry.lastForceAt;
      if (entry.store.current() && sinceLast < REFRESH_MIN_GAP_S * 1000) {
        return json(res, 200, {
          ...envelope(entry.store.current().plan, entry, {
            version: entry.store.current(),
            ageMs: entry.cache.ageMs,
          }),
          newVersion: false,
          throttled: true,
          retryAfterSeconds: Math.ceil((REFRESH_MIN_GAP_S * 1000 - sinceLast) / 1000),
        });
      }
      entry.lastForceAt = Date.now();
      lastCheckAt = Date.now();

      const before = entry.store.current()?.id ?? null;
      const result = await getPlan(entry, { force: true });
      return json(res, 200, {
        ...envelope(result.plan, entry, {
          version: entry.store.current(),
          stale: result.stale,
          error: result.error,
          ageMs: result.ageMs,
        }),
        newVersion: entry.store.current()?.id !== before,
      });
    }

    if (p.startsWith('/api/')) {
      return json(res, 404, { ok: false, error: 'Nieznany endpoint' });
    }

    return serveStatic(req, res, p);
  } catch (err) {
    const status = Number(err.status) || 502;
    if (status >= 500) console.error('[http]', err);
    if (p.startsWith('/api/')) {
      const extra = err.retryAfter ? { 'retry-after': String(err.retryAfter) } : {};
      return json(res, status, {
        ok: false,
        error: status < 500 ? err.message : 'Nie udało się pobrać planu z serwera uczelni.',
        details: status < 500 ? undefined : err.message,
      }, extra);
    }
    if (status < 500) return sendText(res, status, err.message, 'text/plain; charset=utf-8');
    sendText(res, 500, 'Błąd serwera', 'text/plain; charset=utf-8');
  }
});

function scheduleGapMinutes(date = new Date()) {
  return gapMinutes(date, {
    weekdayMin: Math.max(1, REFRESH_WEEKDAY_MIN),
    weekendMin: Math.max(1, REFRESH_WEEKEND_MIN),
  });
}

function formatMinutes(min) {
  if (min >= 1440 && min % 1440 === 0) return `${min / 1440} × dziennie`;
  if (min >= 60 && min % 60 === 0) return `co ${min / 60} h`;
  return `co ${min} min`;
}

/** Sprawdzenie jednej grupy u uczelni + ewentualna nowa wersja. */
async function checkGroup(entry, reason) {
  try {
    await registry.ensureLoaded(entry);
    const result = await entry.cache.get({
      force: true,
      fetchFn: async () => {
        const plan = await fetchPlanLimited(groupIdOf(entry.id), { window: entryWindow(entry.id) });
        entry.store.add(plan);
        return plan;
      },
    });
    const current = entry.store.current();
    console.log(`[check:${reason}] ${new Date().toLocaleString('pl-PL')} — grupa ${entry.id}: `
      + `${result.plan.meta.classes} zajęć, wersja #${current?.id ?? '?'}, `
      + `w pamięci ${entry.store.versions.length}/${entry.store.max}`);
  } catch (err) {
    console.warn(`[check:${reason}] grupa ${entry.id} — błąd: ${err.message}`);
  }
}

/** Sprawdza grupy obserwowane, sekwencyjnie (kultura wobec serwera uczelni). */
async function checkAll(reason, { onlyStale = false, minAgeMs = 0 } = {}) {
  const entries = registry.active().slice(0, registry.maxActive);
  let checked = 0;
  for (const entry of entries) {
    await registry.ensureLoaded(entry);
    if (onlyStale && entry.cache.isFresh) continue;
    if (minAgeMs && entry.cache.fetchedAt && Date.now() - entry.cache.fetchedAt < minAgeMs) continue;
    await checkGroup(entry, reason);
    checked += 1;
    await sleep(1500);
  }
  registry.evict();
  await registry.persist();
  return checked;
}

/**
 * Grupy pasujące do początkowego wyboru (env DEFAULT_*) — to je warto mieć
 * gotowe od razu po wdrożeniu. Pełny katalog ma ~2100 grup, więc rozgrzewamy
 * tylko jedną „stronę” pickera, tak jak poprzednia wersja robiła z 7 grupami.
 */
function defaultSelectionGroups(catalog) {
  const groups = wireGroups(catalog?.groups || []);
  const picked = selection.filter(groups, defaultSelection());
  if (picked.length) return picked;
  // Wybór z env nie pasuje do katalogu (np. po zmianie kierunku) — bierzemy
  // grupę domyślną, żeby start nie kończył się pustym ekranem.
  const fallback = groups.find((g) => String(g.id) === DEFAULT_GROUP);
  return fallback ? [fallback] : [];
}

/**
 * Raz po starcie dociąga w tle plany grup z początkowego wyboru, których nie
 * ma jeszcze na dysku. Dzięki temu pierwsze wejście nie czeka ~5 s na uczelnię
 * — nawet po czystym wdrożeniu.
 */
async function warmDefaultSelection(catalog) {
  const list = defaultSelectionGroups(catalog);
  const missing = [];
  for (const group of list) {
    const id = String(group.id || '');
    if (!/^\d{2,8}$/.test(id) || id === DEFAULT_GROUP) continue;
    const entry = registry.get(id);
    await registry.ensureLoaded(entry);
    if (!entry.cache.plan) missing.push(entry);
  }
  if (!missing.length) return;

  console.log(`[warm] brak planów dla ${missing.length} grup z początkowego wyboru — dociągam w tle`);
  for (const entry of missing.slice(0, registry.maxActive)) {
    await checkGroup(entry, 'rozgrzewanie');
    await sleep(2000);
  }
  await registry.persist();
}

/** Cykliczny tick: decyduje, czy minęło już okno (dzień roboczy vs weekend). */
async function scheduledTick() {
  if (tickRunning) return;
  const gapMs = scheduleGapMinutes() * 60000;

  // Sprawdzamy per grupa — ręczne odświeżenie jednej grupy nie może
  // przesunąć harmonogramu pozostałych.
  const due = registry.active()
    .slice(0, registry.maxActive)
    .some((entry) => !entry.cache.fetchedAt || Date.now() - entry.cache.fetchedAt >= gapMs);
  if (!due) return;

  tickRunning = true;
  try {
    const checked = await checkAll('cykliczne', { minAgeMs: gapMs });
    if (checked) lastCheckAt = Date.now();
  } finally {
    tickRunning = false;
  }
}

async function start() {
  await visits.load();
  await notes.load();
  await registry.restore();
  // Grupa domyślna musi istnieć PRZED wczytaniem cache — nawet jeśli
  // watched.json jeszcze nie istnieje (pierwszy start po wdrożeniu).
  if (!registry.has(DEFAULT_GROUP)) registry.get(DEFAULT_GROUP);

  // Cache planów leżał na dysku bez sprzątania: pliki grup, których rejestr
  // już nie zna, usuwamy raz na start (bieżące wpisy zostają).
  const sweptFiles = await registry.sweepOrphans();
  if (sweptFiles) console.log(`[start] usunięto ${sweptFiles} plików cache spoza rejestru`);

  let newest = 0;
  for (const entry of registry.map.values()) {
    await registry.ensureLoaded(entry);
    if (entry.cache.plan) {
      newest = Math.max(newest, entry.cache.fetchedAt || 0);
    }
  }
  lastCheckAt = newest;

  server.listen(PORT, HOST, () => {
    console.log(`[start] Serwer planu zajęć: http://${HOST}:${PORT}  (grupa domyślna ${DEFAULT_GROUP})`);
    console.log(`[start] początkowy wybór: nabór ${defaultSelection().nabor}, ${defaultSelection().field}, `
      + `${defaultSelection().year}. rok, ${defaultSelection().degree}, tryb ${defaultSelection().mode}`);
    console.log(`[start] grupy obserwowane: ${registry.map.size}, limit pamięci: ${MAX_ACTIVE_GROUPS}`);
    console.log(`[start] odświeżanie: dni robocze ${formatMinutes(Math.max(1, REFRESH_WEEKDAY_MIN))}, `
      + `weekendy ${formatMinutes(Math.max(1, REFRESH_WEEKEND_MIN))}`);
  });

  // Pierwsze sprawdzenie po starcie — tylko grupy z nieświeżym cache.
  setTimeout(async () => {
    try {
      const checked = await checkAll('start', { onlyStale: true });
      if (checked) lastCheckAt = Date.now();
    } catch (err) {
      console.warn('[start] sprawdzenie nieudane:', err.message);
    }
  }, 150).unref?.();

  // Katalog grup w tle — pierwszy użytkownik nie czeka na 3 MB HTML.
  // Po jego wczytaniu dociągamy brakujące plany grup z początkowego wyboru.
  loadCatalog({})
    .then((catalog) => {
      const timer = setTimeout(() => {
        warmDefaultSelection(catalog).catch((err) => console.warn('[warm]', err.message));
      }, 2500);
      timer.unref?.();
    })
    .catch((err) => console.warn('[start] katalog grup:', err.message));

  scheduleTimer = setInterval(scheduledTick, 60 * 1000);
  scheduleTimer.unref?.();
}

async function shutdown() {
  if (scheduleTimer) clearInterval(scheduleTimer);
  await registry.persist().catch(() => {});
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Ostatnia siatka: pojedyncze odrzucenie w tle (np. w cyklicznym ticku) nie
// może kończyć procesu — wcześniej tak właśnie ginął serwer, gdy handler
// rzucił wyjątek przed wejściem w `try`.
process.on('unhandledRejection', (err) => {
  console.error('[unhandled]', err);
});

start();
