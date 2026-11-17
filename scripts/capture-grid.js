#!/usr/bin/env node
'use strict';
/**
 * Zrzut HTML strony planu i siatki (callback DevExpress) do plików.
 * Wynik służy `scripts/mock-apr.js` — atrapie uczelni do testów zmiany planu.
 *
 *   node scripts/capture-grid.js 21188 <katalog>
 */

const fs = require('node:fs');
const path = require('node:path');
const parser = require('../server/parser');

const BASE = process.env.APR_BASE_URL || 'https://harmonogramy.ideis.pl';
const UA = 'PlanZajecBot/1.0 (zrzut do testu)';
const fmt = (iso) => iso.split('-').map(Number).join('-');

async function capture(id, dir, from = '2026-09-01', to = '2027-09-30') {
  fs.mkdirSync(dir, { recursive: true });
  const pageUrl = `${BASE}/Plany/PlanyGrup/${id}`;
  const pageRes = await fetch(pageUrl, { headers: { 'user-agent': UA, accept: 'text/html' } });
  const html = await pageRes.text();
  fs.writeFileSync(path.join(dir, `page-${id}.html`), html, 'utf8');

  const cookies = (pageRes.headers.getSetCookie?.() || []).map((l) => l.split(';')[0]).join('; ');
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
    parametry: `${fmt(from)};${fmt(to)};3;${id}`,
    id: String(id),
  });

  const cbRes = await fetch(`${BASE}/Plany/PlanyGrupGridCustom/${id}`, {
    method: 'POST',
    headers: {
      'user-agent': UA,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      origin: BASE, referer: pageUrl, cookie: cookies,
    },
    body: body.toString(),
  });
  const cbHtml = await cbRes.text();
  fs.writeFileSync(path.join(dir, `grid-${id}.html`), cbHtml, 'utf8');

  const rows = parser.parseGridHtml(cbHtml);
  console.log(`grupa ${id}: strona ${html.length} B, siatka ${cbHtml.length} B, wierszy ${rows.length}`);
  return { rows: rows.length, pageBytes: html.length, gridBytes: cbHtml.length };
}

if (require.main === module) {
  const id = process.argv[2] || '21188';
  const dir = process.argv[3] || path.join(process.env.TEMP || '.', 'aprfix');
  capture(id, dir).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { capture };
