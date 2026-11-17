#!/usr/bin/env node
'use strict';
/**
 * Kontrola parzystości: to, co pokazuje aplikacja, kontra to, co jest w siatce
 * uczelni (`/Plany/PlanyGrup/{id}` + callback `PlanyGrupGridCustom`).
 *
 *   node scripts/check-plan-parity.js [--combos=12] [--extra=5]
 *                                    [--base=https://ideis.mati-it.pl] [--ay=2026]
 *
 * Dla kilkunastu par (kierunek, rocznik, tryb) bierze grupę wykładową (od niej
 * aplikacja zaczyna plan) plus kilka grup ćwiczeniowych/laboratoryjnych i:
 *
 *   1. pobiera siatkę zajęć **prosto z uczelni** (bez cache aplikacji),
 *   2. porównuje liczbę wierszy `DXDataRow` z liczbą zajęć po parsowaniu
 *      (nic nie może wypaść w parserze),
 *   3. porównuje zajęcia z odpowiedzią `/api/plan` aplikacji — data, godziny,
 *      przedmiot, forma, sala, prowadzący,
 *   4. sprawdza plan scalony (`?groups=…`): suma planów grup, bez cudzych zajęć.
 *
 * Kod wyjścia 1 = jakakolwiek różnica. Skrypt chodzi po sieci (kilkadziesiąt
 * żądań), więc nie jest częścią `self-test.js`.
 */

const parser = require('../server/parser');
const { getCatalog } = require('../server/groups');
const { cohortPool } = require('../server/ideis-options');

const BASE_APR = process.env.APR_BASE_URL || 'https://harmonogramy.ideis.pl';
const UA = 'PlanZajecBot/1.0 (kontrola parzystosci planow)';
const PAUSE_MS = Number(process.env.PARITY_PAUSE_MS || 500);

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const OPT = {
  base: opt('base', 'https://ideis.mati-it.pl').replace(/\/$/, ''),
  combos: Number(opt('combos', 12)),
  extra: Number(opt('extra', 5)),
  ay: Number(opt('ay', 0)) || null,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtParam = (iso) => iso.split('-').map(Number).join('-');

/** Zakres roku akademickiego — ten sam, którego używa `server/scraper.js`. */
function windowFor(ay) {
  return { from: `${ay}-09-01`, to: `${ay + 1}-09-30` };
}

/** Klucz zajęć: to, co musi się zgadzać co do wartości z siatką uczelni. */
function keyOf(cls) {
  return [cls.date, cls.start, cls.end, cls.subject, cls.form, cls.room || ''].join('|');
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

  // Wiersze danych kontra licznik siatki: `pageRowCount` liczy też nagłówki dat,
  // więc pełna liczba zajęć = pageRowCount − liczba unikalnych dat.
  const dataRows = (cbHtml.match(/DXDataRow\d+/g) || []).length;
  const rows = parser.parseGridHtml(cbHtml);
  const total = cbHtml.match(/'pageRowCount':(\d+)/);
  const dates = new Set(rows.map((row) => row.date)).size;
  const expected = total ? Number(total[1]) - dates : null;
  const plan = parser.normalize(rows.map((row) => ({ ...row })), { groupId: String(groupId), window: win });
  return { classes: plan.classes, dataRows, expected, rows: rows.length };
}

/** Plan z aplikacji (to, co realnie widać). */
async function fetchApp(groupId, ay) {
  const url = `${OPT.base}/api/plan?group=${encodeURIComponent(groupId)}&ay=${encodeURIComponent(ay)}`;
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  const data = await res.json();
  return { classes: data.classes || [], fetchedAt: data.meta?.fetchedAt || null, count: data.meta?.classes };
}

/** Różnice między dwoma zbiorami zajęć (multizbiór — powtórki też się liczą). */
function diffSets(source, app) {
  const bag = (list) => {
    const map = new Map();
    for (const cls of list) map.set(keyOf(cls), (map.get(keyOf(cls)) || 0) + 1);
    return map;
  };
  const a = bag(source);
  const b = bag(app);
  const missing = [];
  const extra = [];
  for (const [key, count] of a) {
    const other = b.get(key) || 0;
    for (let i = other; i < count; i += 1) missing.push(key);
  }
  for (const [key, count] of b) {
    const other = a.get(key) || 0;
    for (let i = other; i < count; i += 1) extra.push(key);
  }
  return { missing, extra };
}

/** Pary (kierunek, rocznik, tryb) z katalogu — po jednej grupie wykładowej. */
async function pickCombos(ay, limit) {
  const catalog = await getCatalog({});
  const groups = catalog.groups || [];
  const byNabor = new Map();
  const seen = new Set();
  for (const group of groups) {
    if (!group.field || !group.mode || !Array.isArray(group.nabory) || !group.nabory.length) continue;
    for (const nabor of group.nabory) {
      const key = `${group.field}|${nabor}|${group.mode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pool = cohortPool(groups, group.field, String(nabor), { ay });
      const lecture = pool.find((item) => item.kind === 'Wyk');
      if (!lecture) continue;
      const combo = { field: group.field, nabor: String(nabor), mode: group.mode, lecture };
      if (!byNabor.has(combo.nabor)) byNabor.set(combo.nabor, []);
      byNabor.get(combo.nabor).push(combo);
    }
  }
  // Po jednym kierunku na rocznik: wybór obejmuje różne roczniki i tryby,
  // a nie pięć grup z tego samego roku.
  const out = [];
  const usedFields = new Set();
  const nabory = [...byNabor.keys()].sort((a, b) => Number(b) - Number(a));
  for (const nabor of nabory) {
    const list = byNabor.get(nabor).sort((a, b) => a.field.localeCompare(b.field, 'pl'));
    for (const combo of list) {
      if (out.length >= limit) break;
      if (usedFields.has(combo.field)) continue;
      usedFields.add(combo.field);
      out.push(combo);
    }
  }
  return out.slice(0, limit);
}

/** Grupy nie-wykładowe z tych samych wyborów — ćwiczenia, laby, lektoraty. */
async function pickExtra(ay, combos, limit) {
  const catalog = await getCatalog({});
  const groups = catalog.groups || [];
  const out = [];
  for (const combo of combos) {
    const pool = cohortPool(groups, combo.field, combo.nabor, { ay });
    for (const kind of ['Ćw', 'Lab', 'Lekt']) {
      const hit = pool.find((item) => item.kind === kind);
      if (hit) out.push({ ...combo, group: hit });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

async function main() {
  const catalog = await getCatalog({});
  const ay = OPT.ay || Number(catalog.academicYear?.start) || new Date().getFullYear();
  const combos = await pickCombos(ay, OPT.combos);
  const extras = await pickExtra(ay, combos, OPT.extra);
  const win = windowFor(ay);

  console.log(`Baza aplikacji: ${OPT.base}`);
  console.log(`Rok akademicki: ${ay}/${ay + 1}, zakres: ${win.from} .. ${win.to}`);
  console.log(`Wyborów: ${combos.length}, dodatkowych grup: ${extras.length}\n`);

  const failures = [];
  const cases = [
    ...combos.map((combo) => ({ ...combo, group: combo.lecture, kind: 'wykład' })),
    ...extras.map((combo) => ({ ...combo, kind: combo.group.kind })),
  ];

  let checked = 0;
  for (const item of cases) {
    const id = String(item.group.id);
    const label = `${item.field} ${item.nabor} ${item.mode}`;
    let source;
    try {
      source = await fetchSource(id, win);
    } catch (err) {
      console.log(`✗ ${label.padEnd(38)} grupa ${id}: błąd źródła — ${err.message}`);
      failures.push(`${label} / ${id}: źródło`);
      await sleep(PAUSE_MS);
      continue;
    }
    await sleep(PAUSE_MS);
    let app;
    try {
      app = await fetchApp(id, ay);
    } catch (err) {
      console.log(`✗ ${label.padEnd(38)} grupa ${id}: błąd API — ${err.message}`);
      failures.push(`${label} / ${id}: API`);
      continue;
    }

    const parserOk = source.dataRows === source.rows;
    const sourceOk = source.expected === null || source.expected === source.rows;
    const { missing, extra } = diffSets(source.classes, app.classes);
    const ok = parserOk && sourceOk && !missing.length && !extra.length;
    checked += 1;

    const line = [
      ok ? '✓' : '✗',
      label.padEnd(38),
      `grupa ${id} ${String(item.kind || '').padEnd(7)}`,
      `źródło ${String(source.rows).padStart(3)}  api ${String(app.classes.length).padStart(3)}`,
      `daty ${String(new Set(app.classes.map((c) => c.date)).size).padStart(2)}`,
    ].join(' ');
    console.log(line);

    if (!parserOk) {
      console.log(`   ! parser: ${source.dataRows} wierszy w siatce, ${source.rows} po parsowaniu`);
      failures.push(`${label} / ${id}: parser`);
    }
    if (!sourceOk) {
      console.log(`   ! siatka: pageRowCount sugeruje ${source.expected} zajęć, odebrano ${source.rows}`);
      failures.push(`${label} / ${id}: siatka`);
    }
    if (missing.length) {
      console.log(`   ! brakuje w aplikacji (${missing.length}): ${missing.slice(0, 3).join(' ⏎ ')}`);
      failures.push(`${label} / ${id}: ${missing.length} brakujących`);
    }
    if (extra.length) {
      console.log(`   ! nadmiar w aplikacji (${extra.length}): ${extra.slice(0, 3).join(' ⏎ ')}`);
      failures.push(`${label} / ${id}: ${extra.length} nadmiarowych`);
    }
  }

  // Plan scalony: suma planów + brak cudzych zajęć.
  const merged = combos[0];
  if (merged) {
    const pool = cohortPool((await getCatalog({})).groups, merged.field, merged.nabor, { ay });
    const base = merged.lecture;
    const others = pool.filter((g) => g.kind !== 'Wyk').slice(0, 2).map((g) => String(g.id));
    const ids = [String(base.id), ...others];
    const res = await fetch(`${OPT.base}/api/plan?groups=${ids.join(',')}&ay=${ay}`, { headers: { 'user-agent': UA } });
    if (!res.ok) {
      console.log(`\n✗ scalony plan: HTTP ${res.status}`);
      failures.push('scalony plan: HTTP');
    } else {
      const data = await res.json();
      const foreign = (data.classes || []).filter((cls) => {
        const own = Array.isArray(cls.groupIds) ? cls.groupIds.map(String) : [];
        return own.length && !own.some((gid) => ids.includes(gid));
      });
      const union = new Set();
      for (const id of ids) {
        const one = await fetchApp(id, ay);
        for (const cls of one.classes) {
          const own = Array.isArray(cls.groupIds) ? cls.groupIds.map(String) : [];
          if (!own.length || own.some((gid) => ids.includes(gid))) union.add(keyOf(cls));
        }
        await sleep(PAUSE_MS);
      }
      const mergedKeys = new Set((data.classes || []).map(keyOf));
      const lost = [...union].filter((key) => !mergedKeys.has(key));
      const ok = !foreign.length && !lost.length;
      console.log(`\n${ok ? '✓' : '✗'} scalony plan ${merged.field} ${merged.nabor}: grupy ${ids.join('+')}`);
      console.log(`   zajęcia ${mergedKeys.size}, unia z grup ${union.size}, cudze ${foreign.length}, zgubione ${lost.length}`);
      if (foreign.length) failures.push(`scalony: ${foreign.length} cudzych zajęć`);
      if (lost.length) failures.push(`scalony: ${lost.length} zgubionych`);
    }
  }

  console.log(`\nSprawdzono ${checked} grup. ${failures.length ? `NIEZGODNOŚCI: ${failures.length}` : 'Wszystko zgodne ze źródłem.'}`);
  if (failures.length) {
    failures.forEach((item) => console.error(` - ${item}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
