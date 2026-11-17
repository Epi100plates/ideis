#!/usr/bin/env node
'use strict';
/**
 * Kontrola planu scalonego: `?groups=Wyk,Ćw,Lab` kontra siatki uczelni.
 *
 * Dla każdej kombinacji pobiera siatkę **każdej** grupy prosto z uczelni,
 * zostawia z niej tylko wiersze przypisane do wybranych grup (komórka „Grupy”)
 * i sumuje po `class.id`. To samo musi zwrócić `/api/plan?groups=…`:
 *   - żadnych cudzych zajęć,
 *   - żadnych zgubionych zajęć,
 *   - zgodność pola w pole dla każdego zachowanego wiersza.
 *
 *   node scripts/check-merged-strict.js --base=http://127.0.0.1:3111 [--ay=2026]
 */

const parser = require('../server/parser');
const { getCatalog } = require('../server/groups');
const { cohortPool } = require('../server/ideis-options');

const BASE_APR = process.env.APR_BASE_URL || 'https://harmonogramy.ideis.pl';
const UA = 'PlanZajecBot/1.0 (kontrola planu scalonego)';
const PAUSE_MS = Number(process.env.PARITY_PAUSE_MS || 400);

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const OPT = {
  base: opt('base', 'http://127.0.0.1:3111').replace(/\/$/, ''),
  ay: Number(opt('ay', 0)) || null,
  combos: Number(opt('combos', 6)),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtParam = (iso) => iso.split('-').map(Number).join('-');
const windowFor = (ay) => ({ from: `${ay}-09-01`, to: `${ay + 1}-09-30` });
const squash = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

function fullKey(row) {
  return [
    row.date, row.start, row.end, squash(row.subject), squash(row.form), squash(row.group),
    squash(row.lecturer), squash(row.room), squash(row.passForm), squash(row.runId), squash(row.tok),
    squash(row.notes) === 'Brak' ? '' : squash(row.notes), (row.groupIds || []).join('+'),
  ].join('|');
}

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
    customOperationState: state.customOperationState, keys: [], callbackState: state.callbackState,
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
      origin: BASE_APR, referer: pageUrl, cookie: cookies,
    },
    body: body.toString(),
  });
  if (!cbRes.ok) throw new Error(`HTTP ${cbRes.status} dla siatki grupy ${groupId}`);
  const cbHtml = await cbRes.text();
  return parser.parseGridHtml(cbHtml);
}

/** Pary (kierunek, nabór, tryb) z kompletem grup: wykład + coś do dodania. */
async function pickCombos(ay, limit) {
  const catalog = await getCatalog({});
  const groups = catalog.groups || [];
  const out = [];
  const used = new Set();
  for (const group of groups) {
    if (out.length >= limit) break;
    if (!group.field || !group.mode || !Array.isArray(group.nabory) || !group.nabory.length) continue;
    const yearNum = Number(group.year) || Math.ceil(Number(group.semester) / 2);
    const fits = group.nabory.some((n) => Number(n) + yearNum - 1 === ay);
    if (!fits) continue;
    const key = `${group.field}|${group.mode}|${yearNum}`;
    if (used.has(key)) continue;
    const pool = cohortPool(groups, group.field, String(group.nabory.find((n) => Number(n) + yearNum - 1 === ay)), { ay });
    const lecture = pool.find((g) => g.kind === 'Wyk');
    const extra = pool.filter((g) => g.kind !== 'Wyk');
    if (!lecture || !extra.length) continue;
    used.add(key);
    // Wykład + po jednej grupie każdej formy (ćwiczenia/lab/lektorat), do 3 grup.
    const picked = [lecture];
    const kinds = new Set();
    for (const g of extra) {
      if (kinds.has(g.kind) || picked.length >= 3) continue;
      kinds.add(g.kind);
      picked.push(g);
    }
    out.push({
      label: `${group.field} ${group.mode} ${yearNum}. rok`, ids: picked.map((g) => String(g.id)),
      kinds: picked.map((g) => g.kind || '?'),
    });
  }
  return out;
}

async function main() {
  const catalog = await getCatalog({});
  const ay = OPT.ay || Number(catalog.academicYear?.start) || new Date().getFullYear();
  const win = windowFor(ay);
  const combos = await pickCombos(ay, OPT.combos);

  console.log(`Baza aplikacji: ${OPT.base}`);
  console.log(`Rok akademicki: ${ay}/${ay + 1}\n`);

  const failures = [];
  for (const combo of combos) {
    const ids = combo.ids;
    // 1) siatki wszystkich grup — zbieramy tylko wiersze naszych grup
    const expected = new Map();
    const foreignRows = new Map();
    try {
      for (const id of ids) {
        const rows = await fetchSource(id, win);
        for (const row of rows) {
          const own = (row.groupIds || []).map(String);
          // Klucz musi być liczony tak samo po obu stronach — z numerami grup,
          // bo one decydują, czy zajęcia należą do tego planu.
          const key = fullKey(row);
          const mine = own.some((g) => ids.includes(g));
          const target = mine ? expected : foreignRows;
          target.set(key, row);
        }
        await sleep(PAUSE_MS);
      }
    } catch (err) {
      console.log(`✗ ${combo.label}: błąd źródła — ${err.message}`);
      failures.push(`${combo.label}: źródło`);
      continue;
    }

    // 2) plan z aplikacji
    const url = `${OPT.base}/api/plan?groups=${ids.join(',')}&ay=${ay}`;
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (!res.ok) {
      console.log(`✗ ${combo.label}: HTTP ${res.status}`);
      failures.push(`${combo.label}: HTTP ${res.status}`);
      continue;
    }
    const data = await res.json();
    const got = new Set((data.classes || []).map((c) => [
      c.date, c.start, c.end, squash(c.subject), squash(c.form && c.form.raw), squash(c.group),
      squash(c.lecturer), squash(c.roomRaw), squash(c.passForm), squash(c.runId), squash(c.tok),
      squash(c.notes), (c.groupIds || []).map(String).join('+'),
    ].join('|')));

    const missing = [...expected.keys()].filter((k) => !got.has(k));
    const foreign = (data.classes || []).filter((c) => {
      const own = (c.groupIds || []).map(String);
      return own.length && !own.some((g) => ids.includes(g));
    });

    const ok = !missing.length && !foreign.length;
    console.log(`${ok ? '✓' : '✗'} ${combo.label.padEnd(34)} grupy ${ids.join('+')} `
      + `[${combo.kinds.join('+')}]  źródło ${String(expected.size).padStart(3)}  api ${String(got.size).padStart(3)}`);
    if (missing.length) {
      console.log(`   ! brakuje w scalonym planie (${missing.length}): ${missing.slice(0, 2).join(' ⏎ ')}`);
      failures.push(`${combo.label}: ${missing.length} brakujących`);
    }
    if (foreign.length) {
      console.log(`   ! cudze zajęcia w scalonym planie: ${foreign.length}`);
      failures.push(`${combo.label}: ${foreign.length} cudzych`);
    }
    await sleep(PAUSE_MS);
  }

  console.log(`\nSprawdzono ${combos.length} planów scalonych. `
    + `${failures.length ? `NIEZGODNOŚCI: ${failures.length}` : 'Wszystko zgodne ze źródłem.'}`);
  if (failures.length) {
    failures.forEach((f) => console.error(` - ${f}`));
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
