#!/usr/bin/env node
'use strict';
/**
 * Sonda: ile zajęć zwraca siatka uczelni dla różnych zakresów dat.
 * Pokazuje, czy „0 zajęć” wynika z braku danych, czy z doboru zakresu
 * (`parametry=R;R;tryb;id`), którego używa `server/scraper.js`.
 *
 *   node scripts/probe-window.js 20478 20450 21188
 */

const parser = require('../server/parser');

const BASE = process.env.APR_BASE_URL || 'https://harmonogramy.ideis.pl';
const UA = 'PlanZajecBot/1.0 (sonda zakresow)';
const fmt = (iso) => iso.split('-').map(Number).join('-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function grab(groupId, from, to, mode = 3) {
  const pageUrl = `${BASE}/Plany/PlanyGrup/${groupId}`;
  const pageRes = await fetch(pageUrl, { headers: { 'user-agent': UA, accept: 'text/html' } });
  const html = await pageRes.text();
  const cookies = (pageRes.headers.getSetCookie?.() || []).map((l) => l.split(';')[0]).join('; ');
  const state = parser.extractGridState(html);
  const semester = parser.extractSemesterRange(html);

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
    parametry: `${fmt(from)};${fmt(to)};${mode};${groupId}`,
    id: String(groupId),
  });
  const res = await fetch(`${BASE}/Plany/PlanyGrupGridCustom/${groupId}`, {
    method: 'POST',
    headers: {
      'user-agent': UA,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      origin: BASE, referer: pageUrl, cookie: cookies,
    },
    body: body.toString(),
  });
  const cbHtml = await res.text();
  const rows = parser.parseGridHtml(cbHtml);
  const pageRowCount = cbHtml.match(/'pageRowCount':(\d+)/);
  return {
    rows: rows.length,
    dataRows: (cbHtml.match(/DXDataRow\d+/g) || []).length,
    pageRowCount: pageRowCount ? Number(pageRowCount[1]) : null,
    dates: new Set(rows.map((r) => r.date)).size,
    first: rows[0] ? `${rows[0].date} ${rows[0].start} ${rows[0].subject}` : null,
    semester,
  };
}

async function main() {
  const ids = process.argv.slice(2).filter(Boolean);
  for (const id of ids) {
    console.log(`\n=== grupa ${id} ===`);
    let semester = null;
    // 1) zakres roku akademickiego — dokładnie tak, jak pyta scraper
    const wide = await grab(id, '2026-09-01', '2027-09-30', 3);
    semester = wide.semester;
    console.log(`rok akad. 2026-09-01..2027-09-30 tryb 3: ${wide.rows} zajęć (pageRowCount ${wide.pageRowCount}) ${wide.first || ''}`);
    await sleep(400);
    // 2) zakres semestru z formularza uczelni
    if (semester) {
      const sem = await grab(id, semester.start, semester.end, 3);
      console.log(`semestr ${semester.start}..${semester.end} tryb 3: ${sem.rows} zajęć (pageRowCount ${sem.pageRowCount}) ${sem.first || ''}`);
      await sleep(400);
      const sem2 = await grab(id, semester.start, semester.end, 0);
      console.log(`semestr tryb 0: ${sem2.rows} zajęć`);
      await sleep(400);
    }
    // 3) szeroko: cały rok kalendarzowy 2026 i 2027
    const cal = await grab(id, '2026-01-01', '2027-12-31', 3);
    console.log(`2026-01-01..2027-12-31 tryb 3: ${cal.rows} zajęć (pageRowCount ${cal.pageRowCount}) ${cal.first || ''}`);
    await sleep(400);
    // 4) poprzedni rok akademicki
    const prev = await grab(id, '2025-09-01', '2026-09-30', 3);
    console.log(`2025-09-01..2026-09-30 tryb 3: ${prev.rows} zajęć ${prev.first || ''}`);
    await sleep(400);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
