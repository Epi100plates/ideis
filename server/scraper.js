'use strict';
/**
 * Klient harmonogramów APR (harmonogramy.ideis.pl).
 *
 * Przebieg pobierania planu grupy na cały semestr:
 *   1. GET  /Plany/PlanyGrup/{id}          -> sesja (cookie) + tokeny stanu siatki + zakres semestru
 *   2. POST /Plany/PlanyGrupGridCustom/{id} -> callback DevExpress z parametrem "parametry"
 *      parametry = "RRRR-M-D;RRRR-M-D;tryb;idGrupy"  (tryb 3 = cały semestr)
 *   3. Odpowiedź to fragment HTML siatki z wszystkimi zajęciami -> parser
 *
 * Dzięki temu nie trzeba przeglądarki: dwa zapytania HTTP na odświeżenie.
 */

const BASE_URL = process.env.APR_BASE_URL || 'https://harmonogramy.ideis.pl';
const UA = process.env.APR_USER_AGENT
  || 'PlanZajecBot/1.0 (+https://github.com/; wlasny podglad planu zajec)';

const parser = require('./parser');

const DEFAULTS = {
  timeoutMs: Number(process.env.APR_TIMEOUT_MS || 30000),
  retries: Number(process.env.APR_RETRIES || 2),
  pauseMs: Number(process.env.APR_PAUSE_MS || 800),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Odczyt odpowiedzi jako UTF-8 (serwer nie zawsze podaje charset). */
async function readText(res) {
  const buf = Buffer.from(await res.arrayBuffer());
  return new TextDecoder('utf-8').decode(buf);
}

function parseSetCookie(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const cookies = {};
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return cookies;
}

function cookieHeader(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function withTimeout(ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, done: () => clearTimeout(timer) };
}

async function fetchWithRetry(url, options, attempt = 0) {
  const { signal, done } = withTimeout(DEFAULTS.timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
    return res;
  } catch (err) {
    if (attempt < DEFAULTS.retries) {
      await sleep(1200 * (attempt + 1));
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw err;
  } finally {
    done();
  }
}

/**
 * Zakres dat do pobrania: cały rok akademicki (1 września .. 30 września roku następnego).
 * Szeroki zakres jest bezpieczny — serwer zwraca tylko to, co ma zaplanowane.
 * @param {Date} [now]
 * @param {number} [startYear] rok rozpoczęcia (np. 2025 dla 2025/2026); domyślnie bieżący
 */
function academicWindowFor(startYear, now = new Date()) {
  const current = now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const start = Number.isFinite(Number(startYear)) ? Number(startYear) : current;
  return { from: `${start}-09-01`, to: `${start + 1}-09-30` };
}

function academicWindow(now = new Date()) {
  const startYear = now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  return academicWindowFor(startYear, now);
}

function fmtParam(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}-${m}-${d}`;
}

/** Nazwa/kod grupy z podstrony OpisGrupy (opcjonalne — błąd nie przerywa pracy). */
async function fetchGroupInfo(groupId, cookies) {
  try {
    const res = await fetchWithRetry(`${BASE_URL}/Plany/OpisGrupy/${groupId}`, {
      headers: {
        'user-agent': UA,
        'accept-language': 'pl-PL,pl;q=0.9',
        cookie: cookieHeader(cookies),
      },
    });
    const html = await readText(res);
    const text = parser
      .decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ');

    const name = text.match(/Nazwa grupy:\s*(.+?)\s*Kod grupy:/)?.[1]?.trim() || null;
    const code = text.match(/Kod grupy:\s*(.+?)\s*Liczba student/)?.[1]?.trim() || null;
    const students = text.match(/Liczba student[^:]*:\s*(\d+)/)?.[1] || null;
    const type = text.match(/Typ grupy:\s*(.+?)\s*Rodzaj grupy:/)?.[1]?.trim() || null;
    return { name, code, students: students ? Number(students) : null, type };
  } catch {
    return { name: null, code: null, students: null, type: null };
  }
}

/**
 * Pobiera pełny plan grupy.
 * @param {string|number} groupId
 * @param {{ window?: {from:string,to:string} }} [opts]
 */
async function fetchPlan(groupId, opts = {}) {
  const id = String(groupId);
  const win = opts.window || academicWindow();
  const startedAt = Date.now();

  // 1) Strona planu — sesja + stan siatki
  const pageUrl = `${BASE_URL}/Plany/PlanyGrup/${id}`;
  const pageRes = await fetchWithRetry(pageUrl, {
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'pl-PL,pl;q=0.9',
    },
  });
  const html = await readText(pageRes);
  const cookies = parseSetCookie(pageRes);

  if (!/gridViewPlanyGrup/.test(html)) {
    throw new Error('Strona planu nie zawiera siatki zajęć — sprawdź numer grupy.');
  }

  const state = parser.extractGridState(html);
  const semester = parser.extractSemesterRange(html);

  await sleep(DEFAULTS.pauseMs);

  // 2) Callback filtrowania — cały zakres
  const stateJson = JSON.stringify({
    customOperationState: state.customOperationState,
    keys: [],
    callbackState: state.callbackState,
  })
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');

  const body = new URLSearchParams({
    DXCallbackName: 'gridViewPlanyGrup',
    __DXCallbackArgument: 'c0:KV|2;[];GB|35;14|CUSTOMCALLBACK15|[object Object];',
    gridViewPlanyGrup: stateJson,
    'gridViewPlanyGrup$custwindowState': '{"windowsState":"0:0:-1:0:0:0:-10000:-10000:1:0:0:0"}',
    'gridViewPlanyGrup$DXHFPState': '{"windowsState":"0:0:-1:0:0:0:-10000:-10000:1:0:0:0"}',
    DXMVCEditorsValues: '{}',
    parametry: `${fmtParam(win.from)};${fmtParam(win.to)};3;${id}`,
    id,
  });

  const cbUrl = `${BASE_URL}/Plany/PlanyGrupGridCustom/${id}`;
  const cbRes = await fetchWithRetry(cbUrl, {
    method: 'POST',
    headers: {
      'user-agent': UA,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      'accept-language': 'pl-PL,pl;q=0.9',
      origin: BASE_URL,
      referer: pageUrl,
      cookie: cookieHeader(cookies),
    },
    body: body.toString(),
  });
  const cbHtml = await readText(cbRes);

  // 3) Parsowanie
  const records = parser.parseGridHtml(cbHtml);

  // Odpowiedź musi zawierać siatkę zajęć. Brak siatki = zmiana strony lub wygaśnięcie sesji,
  // a wtedy nie wolno nadpisać dobrego cache pustym planem.
  const hasGrid = /gridViewPlanyGrup_DX|DXDataRow|DXGroupRow/i.test(cbHtml);
  if (!hasGrid) {
    throw new Error('Serwer nie zwrócił siatki zajęć — możliwa zmiana strony uczelni albo wygaśnięcie sesji.');
  }

  const groupInfo = await fetchGroupInfo(id, cookies);

  const plan = parser.normalize(records, {
    source: pageUrl,
    groupId: id,
    groupName: groupInfo.name,
    groupCode: groupInfo.code,
    groupStudents: groupInfo.students,
    groupType: groupInfo.type,
    semesterOfficial: semester,       // oficjalny zakres semestru wg uczelni
    window: win,                      // zakres faktycznie zapytany
    fetchedAt: new Date().toISOString(),
    fetchMs: Date.now() - startedAt,
    tok: records.length ? records[0].tok : null,
  });

  return plan;
}

module.exports = { fetchPlan, academicWindow, academicWindowFor, BASE_URL };
