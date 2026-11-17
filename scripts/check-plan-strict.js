#!/usr/bin/env node
'use strict';
/**
 * Kontrola parzystości „pole w pole”: siatka uczelni kontra `/api/plan`.
 *
 *   node scripts/check-plan-strict.js --base=http://127.0.0.1:3111 \
 *        --groups=21188,21186,20742 [--ay=2026] [--limit=0]
 *
 * Różnica wobec `check-plan-parity.js`: tamten porównuje podzbiór pól
 * (data, godziny, przedmiot, forma, sala) i porównuje **już znormalizowane**
 * zbiory po obu stronach, więc strata powstała w `parser.normalize()`
 * (deduplikacja po `class.id`) jest niewidoczna — po obu stronach ubywa tyle
 * samo. Tutaj porównujemy surowe wiersze siatki z odpowiedzią API, pole po polu:
 *
 *   1. liczba wierszy `DXDataRow` == liczba rekordów z `parseGridHtml`,
 *   2. liczba rekordów == liczba zajęć po `normalize` (wykrywa deduplikację),
 *   3. multizbiór pełnych kluczy (data, godziny, przedmiot, forma, grupa,
 *      prowadzący, sala, tok, uwagi, id uruchomienia) == to samo z API,
 *   4. `pageRowCount` z siatki == liczba wierszy.
 *
 * Kod wyjścia 1 = jakakolwiek różnica.
 */

const parser = require('../server/parser');
const { getCatalog } = require('../server/groups');

const BASE_APR = process.env.APR_BASE_URL || 'https://harmonogramy.ideis.pl';
const UA = 'PlanZajecBot/1.0 (kontrola parzystosci pol)';
const PAUSE_MS = Number(process.env.PARITY_PAUSE_MS || 400);

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const OPT = {
  base: opt('base', 'http://127.0.0.1:3111').replace(/\/$/, ''),
  groups: opt('groups', ''),
  limit: Number(opt('limit', 0)) || 0,
  ay: Number(opt('ay', 0)) || null,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtParam = (iso) => iso.split('-').map(Number).join('-');
const windowFor = (ay) => ({ from: `${ay}-09-01`, to: `${ay + 1}-09-30` });
const squash = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

/** Klucz „wszystko, co widać w siatce” — do porównania multizbiorów. */
function fullKey(row) {
  return [
    row.date, row.start, row.end, squash(row.subject), squash(row.form),
    squash(row.group), squash(row.lecturer), squash(row.room),
    squash(row.passForm), squash(row.runId), squash(row.tok),
    squash(row.notes) === 'Brak' ? '' : squash(row.notes),
    (row.groupIds || []).join('+'),
  ].join('|');
}

/** Odpowiednik `fullKey` dla zajęć z API. */
function appKey(cls) {
  return [
    cls.date, cls.start, cls.end, squash(cls.subject), squash(cls.form && cls.form.raw),
    squash(cls.group), squash(cls.lecturer), squash(cls.roomRaw),
    squash(cls.passForm), squash(cls.runId), squash(cls.tok),
    squash(cls.notes),
    (cls.groupIds || []).map(String).join('+'),
  ].join('|');
}

/** Zajęcia z siatki uczelni, prosto z callbacku DevExpress (bez cache aplikacji). */
async function fetchSource(groupId, win) {
  const pageUrl = `${BASE_APR}/Plany/PlanyGrup/${groupId}`;
  const pageRes = await fetch(pageUrl, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'pl-PL,pl;q=0.9' },
  });
  if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status} dla ${pageUrl}`);
  const html = await pageRes.text();
  const cookies = (pageRes.headers.getSetCookie?.() || []).map((line) => line.split(';')[0]).join('; ');
  const state = parser.extractGridState(html);

  const stateJson = JSON.stringify({
    customOperationState: state.customOperationState,
    keys: [],
    callbackState: state.callbackState,
  }).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  const body = new URLSearchParams({
    DXCallbackName: 'gridViewPlanyGrup',
    __DXCallbackArgument: 'c0:KV|2;[];GB|35;14|CUSTOMCALLBACK15|[object Object];',
    gridViewPlanyGrup: stateJson,
    'gridViewPlanyGrup$custwindowState': '{"windowsState":"0:0:-1:0:0:0:-10000:-10000:1:0:0:0"}',
    'gridViewPlanyGrup$DXHFPState': '{"windowsState":"0:0:-1:0:0:0:-10000:-10000:1:0:0:0"}',
    DXMVCEditorsValues: '{}',
    parametry: `${fmtParam(win.from)};${fmtParam(win.to)};3;${groupId}`,
    id: String(groupId),
  });

  const cbRes = await fetch(`${BASE_APR}/Plany/PlanyGrupGridCustom/${groupId}`, {
    method: 'POST',
    headers: {
      'user-agent': UA,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      'accept-language': 'pl-PL,pl;q=0.9',
      origin: BASE_APR,
      referer: pageUrl,
      cookie: cookies,
    },
    body: body.toString(),
  });
  if (!cbRes.ok) throw new Error(`HTTP ${cbRes.status} dla callbacku grupy ${groupId}`);
  const cbHtml = await cbRes.text();
  if (!/gridViewPlanyGrup_DX|DXDataRow|DXGroupRow/i.test(cbHtml)) {
    throw new Error(`Brak siatki w odpowiedzi dla grupy ${groupId}`);
  }

  const dataRows = (cbHtml.match(/DXDataRow\d+/g) || []).length;
  const rows = parser.parseGridHtml(cbHtml);
  const total = cbHtml.match(/'pageRowCount':(\d+)/);
  const dates = new Set(rows.map((row) => row.date)).size;
  const pageRowCount = total ? Number(total[1]) : null;

  const normalized = parser.normalize(rows.map((row) => ({ ...row })), { groupId: String(groupId), window: win });
  return { rows, dataRows, pageRowCount, dates, classes: normalized.classes };
}

function bagOf(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function diff(a, b) {
  const onlyA = [];
  const onlyB = [];
  for (const [key, count] of a) {
    const other = b.get(key) || 0;
    for (let i = other; i < count; i += 1) onlyA.push(key);
  }
  for (const [key, count] of b) {
    const other = a.get(key) || 0;
    for (let i = other; i < count; i += 1) onlyB.push(key);
  }
  return { onlyA, onlyB };
}

async function fetchApp(groupId, ay) {
  const url = `${OPT.base}/api/plan?group=${encodeURIComponent(groupId)}&ay=${encodeURIComponent(ay)}`;
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  return res.json();
}

async function pickGroups(ay, limit) {
  const catalog = await getCatalog({});
  const groups = (catalog.groups || []).filter((g) => g.field && g.mode && Array.isArray(g.nabory) && g.nabory.length);
  const out = [];
  const usedFields = new Set();
  for (const group of groups) {
    if (usedFields.has(group.field)) continue;
    const hasAy = group.nabory.some((n) => Number(n) === Number(ay) - (Number(group.year) - 1));
    if (!hasAy) continue;
    usedFields.add(group.field);
    out.push(String(group.id));
    if (out.length >= limit) break;
  }
  return out;
}

async function main() {
  const catalog = await getCatalog({});
  const ay = OPT.ay || Number(catalog.academicYear && catalog.academicYear.start) || new Date().getFullYear();
  const win = windowFor(ay);
  const ids = OPT.groups
    ? OPT.groups.split(',').map((s) => s.trim()).filter(Boolean)
    : await pickGroups(ay, OPT.limit || 12);

  console.log(`Baza aplikacji: ${OPT.base}`);
  console.log(`Rok akademicki: ${ay}/${ay + 1}, zakres: ${win.from} .. ${win.to}`);
  console.log(`Grupy: ${ids.length}\n`);

  const failures = [];
  let checked = 0;

  for (const id of ids) {
    let source;
    try {
      source = await fetchSource(id, win);
    } catch (err) {
      console.log(`✗ ${String(id).padEnd(7)} źródło: ${err.message}`);
      failures.push(`${id}: źródło ${err.message}`);
      await sleep(PAUSE_MS);
      continue;
    }
    await sleep(PAUSE_MS);

    let app;
    try {
      app = await fetchApp(id, ay);
    } catch (err) {
      console.log(`✗ ${String(id).padEnd(7)} API: ${err.message}`);
      failures.push(`${id}: API ${err.message}`);
      continue;
    }

    const problems = [];

    // 1. wiersze siatki == rekordy parsera
    if (source.dataRows !== source.rows.length) {
      problems.push(`siatka/parser: ${source.dataRows} wierszy, ${source.rows.length} rekordów`);
    }
    // 2. rekordy == zajęcia po normalize (tu ginie deduplikacja)
    if (source.rows.length !== source.classes.length) {
      const lost = source.rows.length - source.classes.length;
      const seen = new Set();
      for (const cls of source.classes) seen.add(cls.id);
      const dupes = source.rows.filter((r) => {
        const key = [r.date, r.start, r.end, r.runId, r.form, r.group].join('|');
        return !seen.has(key);
      });
      problems.push(`normalize: ${source.rows.length} rekordów → ${source.classes.length} zajęć (scalone ${lost})`
        + (dupes.length ? ` np. ${squash(dupes[0].subject)} / ${squash(dupes[0].room)} vs ` : ''));
    }
    // 3. pageRowCount
    if (source.pageRowCount != null && source.pageRowCount !== source.dataRows + source.dates) {
      problems.push(`siatka: pageRowCount ${source.pageRowCount} != ${source.dataRows} wierszy + ${source.dates} nagłówków dat`);
    }

    // 4. pełny multizbiór: siatka → API
    const appClasses = app.classes || [];
    const { onlyA, onlyB } = diff(bagOf(source.rows, fullKey), bagOf(appClasses, appKey));
    if (onlyA.length) problems.push(`brakuje w API (${onlyA.length}): ${onlyA.slice(0, 2).join(' ⏎ ')}`);
    if (onlyB.length) problems.push(`nadmiar w API (${onlyB.length}): ${onlyB.slice(0, 2).join(' ⏎ ')}`);

    checked += 1;
    const mark = problems.length ? '✗' : '✓';
    console.log(`${mark} ${String(id).padEnd(7)} źródło ${String(source.rows.length).padStart(3)} `
      + `api ${String(appClasses.length).padStart(3)} daty ${String(new Set(appClasses.map((c) => c.date)).size).padStart(2)}`
      + (app.meta && app.meta.groupCode ? `  ${app.meta.groupCode}` : ''));
    for (const problem of problems) {
      console.log(`   ! ${problem}`);
      failures.push(`${id}: ${problem}`);
    }
    await sleep(PAUSE_MS);
  }

  console.log(`\nSprawdzono ${checked} grup. ${failures.length ? `NIEZGODNOŚCI: ${failures.length}` : 'Wszystko zgodne pole w pole.'}`);
  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
