#!/usr/bin/env node
'use strict';
/**
 * Atrapa harmonogramów uczelni do testów zmiany planu „w trakcie działania”.
 *
 *   node scripts/mock-apr.js <katalog-fixtur> [port]
 *
 * Dla grup, dla których w katalogu fixtur leżą `page-<id>.html` i `grid-<id>.html`,
 * serwer oddaje **zmodyfikowaną** siatkę według pliku `state.json`:
 *
 *   { "21188": { "dropRow": 3, "addRow": true, "replace": [["sala A", "sala B"]] } }
 *
 *   dropRow  — numer wiersza danych (0-based) do usunięcia (odwołane zajęcia),
 *   addRow   — dokleja kopię ostatniego wiersza o innej godzinie (nowe zajęcia),
 *   replace  — dosłowne podmiany w HTML siatki (sala, prowadzący, forma zaliczenia).
 *
 * `state.json` jest czytany przy **każdym** żądaniu, więc plan zmienia się bez
 * restartu atrapy. Wszystko inne jest przekazywane do prawdziwej uczelni, więc
 * katalog grup i opisy grup działają normalnie.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const parser = require('../server/parser');

const REAL = process.env.APR_REAL_URL || 'https://harmonogramy.ideis.pl';
const DIR = process.argv[2] || path.join(process.env.TEMP || '.', 'aprfix');
const PORT = Number(process.argv[3] || process.env.MOCK_PORT || 3150);
const STATE_FILE = path.join(DIR, 'state.json');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** Zamiana liczby w `'pageRowCount':N` — siatka musi zostać spójna. */
function bumpRowCount(html, delta) {
  return html.replace(/('pageRowCount':)(\d+)/, (full, head, value) => `${head}${Number(value) + delta}`);
}

/**
 * Przesunięcie godzin w jednym wierszu. Podmieniamy wyłącznie tekst węzłów
 * (`>9:00<`), a nie dowolne `H:MM` w atrybutach stylów.
 */
function shiftTimes(rowHtml, plusHours) {
  return rowHtml.replace(/(>)(\d{1,2}):(\d{2})(<)/g,
    (full, open, h, m, close) => `${open}${(Number(h) + plusHours) % 24}:${m}${close}`);
}

function mutateGrid(html, spec) {
  let out = html;
  const rowRe = /<tr[^>]*id="gridViewPlanyGrup_DXDataRow\d+"[^>]*>[\s\S]*?<\/tr>/g;
  let dataRows = (out.match(rowRe) || []).length;
  let delta = 0;

  // 1) usunięcie wiersza — „zajęcia odwołane”
  if (Number.isInteger(spec.dropRow) && spec.dropRow >= 0 && spec.dropRow < dataRows) {
    let index = 0;
    out = out.replace(rowRe, (row) => {
      const keep = index !== spec.dropRow;
      index += 1;
      if (!keep) delta -= 1;
      return keep ? row : '';
    });
  }

  // 2) nowe zajęcia — kopia ostatniego wiersza przesunięta o 2 godziny,
  //    wstawiona zaraz po nim (żeby została w tym samym dniu).
  if (spec.addRow) {
    const rows = [...out.matchAll(rowRe)];
    if (rows.length) {
      const last = rows[rows.length - 1];
      const shifted = shiftTimes(last[0], 2)
        .replace(/gridViewPlanyGrup_DXDataRow\d+/, 'gridViewPlanyGrup_DXDataRow990');
      const end = last.index + last[0].length;
      out = out.slice(0, end) + shifted + out.slice(end);
      delta += 1;
    }
  }

  // 3) podmiany tekstu — sala, prowadzący, forma zaliczenia
  for (const pair of spec.replace || []) {
    if (Array.isArray(pair) && pair.length === 2 && pair[0]) {
      out = out.split(pair[0]).join(pair[1]);
    }
  }

  return delta ? bumpRowCount(out, delta) : out;
}

function proxy(req, res) {
  const target = new URL(req.url, REAL);
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
    try {
      const upstream = await fetch(target, { method: req.method, headers, body, redirect: 'follow' });
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') || 'text/html; charset=utf-8',
        'content-length': buf.length,
      });
      res.end(buf);
    } catch (err) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`atrapa: ${err.message}`);
    }
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pageHit = url.pathname.match(/^\/Plany\/PlanyGrup\/(\d+)$/);
  const gridHit = url.pathname.match(/^\/Plany\/PlanyGrupGridCustom\/(\d+)$/);

  if (pageHit) {
    const file = path.join(DIR, `page-${pageHit[1]}.html`);
    if (fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': buf.length,
        'set-cookie': 'ASP.NET_SessionId=atrapa; path=/',
      });
      return res.end(buf);
    }
    return proxy(req, res);
  }

  if (gridHit && req.method === 'POST') {
    const id = gridHit[1];
    const file = path.join(DIR, `grid-${id}.html`);
    if (fs.existsSync(file)) {
      const spec = readState()[id] || {};
      const html = mutateGrid(fs.readFileSync(file, 'utf8'), spec);
      const buf = Buffer.from(html, 'utf8');
      const rows = parser.parseGridHtml(html).length;
      console.log(`[atrapa] siatka ${id}: ${rows} zajęć (spec ${JSON.stringify(spec)})`);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': buf.length });
      return res.end(buf);
    }
    return proxy(req, res);
  }

  return proxy(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[atrapa] http://127.0.0.1:${PORT} — fixture: ${DIR}, prawdziwa uczelnia: ${REAL}`);
});
