'use strict';
/**
 * Licznik wejść do aplikacji (przeglądarka + PWA + aplikacja Android).
 *
 * Stan trzymamy w jednym pliku JSON w katalogu cache (w Dockerze na wolumenie
 * ./data), więc przeżywa restart i przebudowę kontenera. Zapis jest atomowy
 * (plik tymczasowy + rename), a kolejne zapisy są serializowane — równoległe
 * wejścia nie mogą uszkodzić pliku.
 *
 * Liczymy każde otwarcie aplikacji: osobno wejścia z przeglądarki, z trybu
 * standalone (PWA) i z aplikacji Android. Nie zapisujemy adresów IP ani
 * identyfikatorów urządzeń.
 *
 * Rozbicie czasowe (`days`, `hours`) liczymy od pierwszego wejścia po wdrożeniu
 * (`since`), bo starsze wejścia znamy tylko jako sumę — nikt ich nie odtworzy.
 * Dzień i godzinę bierzemy w strefie Europe/Warsaw, tak jak daty na stronie.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const SOURCES = new Set(['web', 'pwa', 'apk']);
const FILE_VERSION = 2;
/** Ile dni rozbicia trzymamy w pliku — starsze są przycinane przy zapisie. */
const KEEP_DAYS = 180;
const HOURS = 24;
const TIME_ZONE = 'Europe/Warsaw';

const WEEKDAY_NAMES = [
  'niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota',
];
const WEEKDAY_SHORT = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];

/** Godzina w dobie i data w strefie licznika — jedno źródło dla zapisu i testów. */
const stampFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

function intOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function isoOrNull(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Jedna komórka rozbicia: trzy źródła i nic więcej. */
function emptyCell() {
  return { web: 0, pwa: 0, apk: 0 };
}

function cellTotal(cell) {
  if (!cell) return 0;
  return intOrZero(cell.web) + intOrZero(cell.pwa) + intOrZero(cell.apk);
}

/** Zapis do pliku może mieć śmieci z ręcznej edycji — bierzemy tylko liczby. */
function normalizeCell(raw) {
  const cell = emptyCell();
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(cell)) cell[key] = intOrZero(raw[key]);
  }
  return cell;
}

function normalizeDays(raw) {
  const days = {};
  if (!raw || typeof raw !== 'object') return days;
  for (const [key, value] of Object.entries(raw)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) days[key] = normalizeCell(value);
  }
  return days;
}

function normalizeHours(raw) {
  const hours = {};
  if (!raw || typeof raw !== 'object') return hours;
  for (const [key, value] of Object.entries(raw)) {
    const hour = Number(key);
    if (Number.isInteger(hour) && hour >= 0 && hour < HOURS) hours[hour] = normalizeCell(value);
  }
  return hours;
}

/** `{ day: '2026-11-16', hour: 20 }` w strefie Europe/Warsaw. */
function warsawStamp(at) {
  const parts = {};
  for (const part of stampFormat.formatToParts(at)) parts[part.type] = part.value;
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    // Niektóre wersje ICU zwracają „24” o północy przy h23 — normalizujemy.
    hour: Number(parts.hour) % HOURS,
  };
}

class VisitCounter {
  constructor({ file }) {
    if (!file) throw new Error('VisitCounter wymaga ścieżki pliku.');
    this.file = file;
    this.data = {
      total: 0, web: 0, pwa: 0, apk: 0, firstAt: null, lastAt: null, updatedAt: null,
      since: null, days: {}, hours: {},
    };
    this.writeChain = Promise.resolve();
  }

  /** Wczytuje stan z dysku. Brak pliku i uszkodzony JSON nie wywalają serwera. */
  async load() {
    let raw;
    try {
      raw = await fs.readFile(this.file, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('[visits] odczyt:', err.message);
      return this.snapshot();
    }

    try {
      const parsed = JSON.parse(raw);
      const web = intOrZero(parsed.web);
      const pwa = intOrZero(parsed.pwa);
      // Starsze pliki nie mają licznika aplikacji — wtedy po prostu 0.
      const apk = intOrZero(parsed.apk);
      this.data = {
        // Suma nigdy nie może być mniejsza niż składniki — gdy plik był
        // ręcznie poprawiany, bierzemy większą wartość.
        total: Math.max(intOrZero(parsed.total), web + pwa + apk),
        web,
        pwa,
        apk,
        firstAt: isoOrNull(parsed.firstAt),
        lastAt: isoOrNull(parsed.lastAt),
        updatedAt: isoOrNull(parsed.updatedAt),
        // Pliki z wersji 1 nie mają rozbicia — liczy się od teraz.
        since: isoOrNull(parsed.since),
        days: normalizeDays(parsed.days),
        hours: normalizeHours(parsed.hours),
      };
      this.pruneDays();
    } catch (err) {
      console.warn('[visits] uszkodzony plik — licznik startuje od zera:', err.message);
    }
    return this.snapshot();
  }

  /** Trzyma tylko `KEEP_DAYS` ostatnich dni — plik nie rośnie w nieskończoność. */
  pruneDays() {
    const keys = Object.keys(this.data.days).sort();
    while (keys.length > KEEP_DAYS) delete this.data.days[keys.shift()];
  }

  /**
   * Zlicza jedno wejście i zapisuje stan. Zwraca aktualny stan.
   * `at` jest tylko dla testów — produkcja zawsze podaje bieżący czas.
   */
  record(source = 'web', at = new Date()) {
    const src = SOURCES.has(source) ? source : 'web';
    const when = at instanceof Date && Number.isFinite(at.getTime()) ? at : new Date();
    const now = when.toISOString();

    this.data.total += 1;
    this.data[src] += 1;
    if (!this.data.firstAt) this.data.firstAt = now;
    if (!this.data.since) this.data.since = now;
    this.data.lastAt = now;
    this.data.updatedAt = now;

    const { day, hour } = warsawStamp(when);
    if (!this.data.days[day]) this.data.days[day] = emptyCell();
    if (!this.data.hours[hour]) this.data.hours[hour] = emptyCell();
    this.data.days[day][src] += 1;
    this.data.hours[hour][src] += 1;
    this.pruneDays();

    // Zapis po kolei: dwa równoległe wejścia nie mogą zamazać sobie pliku.
    //
    // Błąd zapisu jest tu logowany, a nie zwracany, i to jest świadome: licznik
    // trzyma stan w pamięci, więc nie tracimy wejścia od razu — kolejne wejście
    // zapisze całość jeszcze raz (inaczej niż notatka, gdzie klient widzi
    // „Zapisano” i liczy na trwały zapis).
    this.writeChain = this.writeChain
      .then(() => this.save())
      .catch((err) => { console.warn('[visits] zapis:', err.message); });

    return this.writeChain.then(() => this.snapshot());
  }

  async save() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify({ version: FILE_VERSION, ...this.data })}\n`, 'utf8');
    await fs.rename(tmp, this.file);
  }

  /** Kopia bez wspólnych referencji — render nie może zmienić stanu licznika. */
  snapshot() {
    const days = {};
    for (const [key, cell] of Object.entries(this.data.days)) days[key] = { ...cell };
    const hours = {};
    for (const [key, cell] of Object.entries(this.data.hours)) hours[key] = { ...cell };
    return { ...this.data, days, hours };
  }
}

const numberFormat = new Intl.NumberFormat('pl-PL');
const dateFormat = new Intl.DateTimeFormat('pl-PL', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: TIME_ZONE,
});

function formatNumber(value) {
  return numberFormat.format(intOrZero(value));
}

function formatDate(value) {
  const iso = isoOrNull(value);
  if (!iso) return '—';
  return dateFormat.format(new Date(iso));
}

/* --------------------------------------------------------------- rozbicie */

/** `2026-11-16` → obiekt daty (południe UTC, żeby doba nie uciekła na DST). */
function dayDate(day) {
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dayLabel(day) {
  const date = dayDate(day);
  if (!date) return day;
  return `${WEEKDAY_SHORT[date.getUTCDay()]} ${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}`;
}

function dayKey(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Ostatnie `count` dni (łącznie z dzisiejszym w strefie licznika), od najstarszego. */
function recentDays(days, count, now = new Date()) {
  const start = dayDate(warsawStamp(now).day);
  const rows = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(start.getTime());
    date.setUTCDate(date.getUTCDate() - i);
    const key = dayKey(date);
    rows.push({ key, label: dayLabel(key), cell: days[key] || emptyCell() });
  }
  return rows;
}

/** Sumy po dniach tygodnia — z tych samych dni co wykres (max `KEEP_DAYS`). */
function weekdayTotals(days) {
  const totals = WEEKDAY_NAMES.map(() => emptyCell());
  for (const [key, cell] of Object.entries(days)) {
    const date = dayDate(key);
    if (!date) continue;
    const index = date.getUTCDay();
    for (const source of Object.keys(totals[index])) totals[index][source] += intOrZero(cell[source]);
  }
  return totals;
}

function hourTotals(hours) {
  const totals = [];
  for (let hour = 0; hour < HOURS; hour += 1) {
    totals.push(hours[hour] ? normalizeCell(hours[hour]) : emptyCell());
  }
  return totals;
}

/** Pasek: pełna szerokość = największa wartość, w środku segmenty źródeł. */
function segmentBar(cell, max) {
  const total = cellTotal(cell);
  if (!max || !total) return '<span class="bar-empty" aria-hidden="true"></span>';
  const width = Math.max(2, (total / max) * 100);
  const parts = ['web', 'pwa', 'apk']
    .filter((source) => intOrZero(cell[source]) > 0)
    .map((source) => `<span class="seg seg-${source}" style="width:${((intOrZero(cell[source]) / total) * 100).toFixed(2)}%"></span>`)
    .join('');
  return `<span class="bar" style="width:${width.toFixed(2)}%">${parts}</span>`;
}

function renderLegend() {
  return `<p class="legend">
    <span class="legend-item"><span class="seg seg-web" aria-hidden="true"></span> przeglądarka</span>
    <span class="legend-item"><span class="seg seg-pwa" aria-hidden="true"></span> PWA</span>
    <span class="legend-item"><span class="seg seg-apk" aria-hidden="true"></span> aplikacja Android</span>
  </p>`;
}

function renderDayRows(rows, sinceDay = null) {
  const max = Math.max(0, ...rows.map((row) => cellTotal(row.cell)));
  return `<ul class="rows">${rows.map((row) => {
    // Dzień sprzed `since` to „nie wiemy”, nie „zero” — inaczej wykres kłamie.
    const unknown = Boolean(sinceDay) && row.key < sinceDay;
    const value = unknown ? '—' : formatNumber(cellTotal(row.cell));
    return `<li class="row${unknown ? ' is-unknown' : ''}">
      <span class="row-label">${esc(row.label)}</span>
      <span class="row-track">${unknown ? '' : segmentBar(row.cell, max)}</span>
      <span class="row-value">${value}</span>
    </li>`;
  }).join('')}</ul>`;
}

function renderWeekdayRows(totals) {
  const max = Math.max(0, ...totals.map((cell) => cellTotal(cell)));
  // Poniedziałek pierwszy — tak ludzie czytają tydzień.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `<ul class="rows">${order.map((index) => `<li class="row">
      <span class="row-label">${esc(WEEKDAY_NAMES[index])}</span>
      <span class="row-track">${segmentBar(totals[index], max)}</span>
      <span class="row-value">${formatNumber(cellTotal(totals[index]))}</span>
    </li>`).join('')}</ul>`;
}

/** Wykres godzin doby — 24 słupki, etykiety co trzy godziny. */
function renderHourChart(totals) {
  const max = Math.max(0, ...totals.map((cell) => cellTotal(cell)));
  const bars = totals.map((cell, hour) => {
    const total = cellTotal(cell);
    const height = max ? Math.max(2, (total / max) * 100) : 0;
    const label = hour % 3 === 0 ? pad2(hour) : '';
    const title = `${pad2(hour)}:00–${pad2((hour + 1) % HOURS)}:00 — ${formatNumber(total)}`;
    return `<li class="hour${total ? '' : ' is-empty'}" title="${esc(title)}">
        <span class="hour-bar" style="height:${height.toFixed(2)}%"></span>
        <span class="hour-label">${label}</span>
      </li>`;
  }).join('');
  return `<ul class="hours">${bars}</ul>`;
}

function peakHour(totals) {
  let best = null;
  totals.forEach((cell, hour) => {
    const total = cellTotal(cell);
    if (total > 0 && (!best || total > best.total)) best = { hour, total };
  });
  return best;
}

function peakDay(days) {
  let best = null;
  for (const [key, cell] of Object.entries(days)) {
    const total = cellTotal(cell);
    if (total > 0 && (!best || total > best.total)) best = { key, total };
  }
  return best;
}

/**
 * Serwerowo renderowana strona licznika. Zero JS i zero zewnętrznych plików —
 * strona jest lekka, działa też przy wyłączonym JavaScripcie i odświeża się
 * meta refresh co 15 s.
 */
function renderVisitsPage(stats, { appUrl = '/', now = new Date() } = {}) {
  const total = formatNumber(stats.total);
  const web = formatNumber(stats.web);
  const pwa = formatNumber(stats.pwa);
  const apk = formatNumber(stats.apk);
  const first = esc(formatDate(stats.firstAt));
  const last = esc(formatDate(stats.lastAt));
  const href = esc(appUrl);

  const days = stats.days || {};
  const hours = hourTotals(stats.hours || {});
  const sinceDay = stats.since ? warsawStamp(new Date(stats.since)).day : null;
  const lastDays = recentDays(days, 14, now);
  const hasUnknownDays = Boolean(sinceDay) && lastDays.some((row) => row.key < sinceDay);
  const since = esc(formatDate(stats.since));
  const peakH = peakHour(hours);
  const peakD = peakDay(days);
  const hasBreakdown = Boolean(stats.since)
    && (Object.keys(days).length > 0 || hours.some((cell) => cellTotal(cell) > 0));

  const peakCells = peakH || peakD
    ? `<div class="stat"><dt>Najruchliwsza godzina</dt><dd>${peakH ? `${pad2(peakH.hour)}:00` : '—'}</dd></div>
    <div class="stat"><dt>Najruchliwszy dzień</dt><dd>${peakD ? esc(dayLabel(peakD.key)) : '—'}</dd></div>`
    : '';

  const breakdown = hasBreakdown
    ? `<p class="eyebrow">Ostatnie 14 dni</p>
  ${renderDayRows(lastDays, sinceDay)}
  ${renderLegend()}
  ${hasUnknownDays ? `<p class="hint">„—” to dni sprzed ${since} — wtedy licznik nie rozbijał
    wejść na dni, więc nie zgaduję zera.</p>` : ''}

  <p class="eyebrow">Godziny doby</p>
  ${renderHourChart(hours)}
  <p class="hint">Wszystkie wejścia od ${since} — słupki to suma po każdej godzinie.</p>

  <p class="eyebrow">Dni tygodnia</p>
  ${renderWeekdayRows(weekdayTotals(days))}`
    : `<p class="eyebrow">Rozbicie na dni i godziny</p>
  <p class="hint">Zbieram od teraz — pierwsze słupki pojawią się po najbliższym wejściu
    do aplikacji. Suma powyżej obejmuje też wejścia sprzed tej zmiany.</p>`;

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#04070c">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="15">
<title>Licznik wejść — Plan zajęć</title>
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: clamp(16px, 4vw, 40px);
  color: #eef4ff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background:
    radial-gradient(80% 62% at 8% -4%, rgba(0, 202, 255, .34) 0%, rgba(0, 202, 255, 0) 62%),
    radial-gradient(70% 58% at 100% 4%, rgba(72, 128, 255, .28) 0%, rgba(72, 128, 255, 0) 66%),
    radial-gradient(80% 58% at 50% 112%, rgba(0, 255, 208, .16) 0%, rgba(0, 255, 208, 0) 70%),
    linear-gradient(162deg, #031522 0%, #04101a 48%, #01050a 100%);
  background-attachment: fixed;
}
.card {
  width: min(620px, 100%);
  padding: clamp(24px, 5vw, 48px);
  border: 1px solid rgba(190, 220, 255, .18);
  border-radius: 32px;
  background-color: rgba(7, 15, 27, .62);
  background-image: linear-gradient(180deg, rgba(255, 255, 255, .055), rgba(255, 255, 255, 0) 62%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .22), 0 40px 90px -40px #000;
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #9fb3c9;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #5ee0ff;
  box-shadow: 0 0 14px #5ee0ff;
}
.eyebrow {
  margin: 30px 0 4px;
  color: #8ea4ba;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
}
.total {
  font-size: clamp(64px, 16vw, 132px);
  line-height: .95;
  font-weight: 700;
  letter-spacing: -.055em;
  color: #f4faff;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 60px rgba(94, 224, 255, .22);
}
.lead {
  max-width: 42ch;
  margin: 16px 0 0;
  color: #a9bacd;
  font-size: 15px;
  line-height: 1.5;
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 28px 0 0;
  padding: 0;
}
.stat {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid rgba(190, 220, 255, .12);
  border-radius: 16px;
  background: rgba(255, 255, 255, .03);
}
.stat.wide { grid-column: 1 / -1; }
dt {
  color: #8194a9;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .09em;
  text-transform: uppercase;
}
dd {
  margin: 4px 0 0;
  color: #eef4ff;
  font-size: 17px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.rows {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 5px;
}
.row {
  display: grid;
  grid-template-columns: 92px 1fr 52px;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: #a9bacd;
}
.row-label { color: #8ea4ba; font-variant-numeric: tabular-nums; white-space: nowrap; }
.row.is-unknown .row-label,
.row.is-unknown .row-value { color: #5e7386; }
.row-value {
  text-align: right;
  color: #eef4ff;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.row-track {
  display: block;
  height: 14px;
  border-radius: 7px;
  background: rgba(255, 255, 255, .05);
  overflow: hidden;
}
.bar {
  display: flex;
  height: 100%;
  border-radius: 7px;
  overflow: hidden;
}
.bar-empty { display: block; height: 100%; }
.seg { display: block; height: 100%; }
.seg-web { background: #5ee0ff; }
.seg-pwa { background: #a78bfa; }
.seg-apk { background: #ffc46b; }
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 10px 0 0;
  color: #8194a9;
  font-size: 11.5px;
}
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.legend .seg { width: 9px; height: 9px; border-radius: 3px; }
.hours {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  gap: 3px;
  align-items: end;
  height: 132px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}
.hour {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 100%;
  gap: 6px;
}
.hour-bar {
  display: block;
  width: 100%;
  border-radius: 3px 3px 0 0;
  background: linear-gradient(180deg, #8fe8ff, #2f9ecb);
}
.hour.is-empty .hour-bar { background: rgba(255, 255, 255, .08); }
.hour-label {
  color: #6f8598;
  font-size: 9px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  height: 11px;
}
.hint {
  margin: 10px 0 0;
  color: #8194a9;
  font-size: 12px;
  line-height: 1.45;
}
.foot {
  margin: 24px 0 0;
  color: #8194a9;
  font-size: 12.5px;
}
.foot a {
  color: #bfe7ff;
  text-decoration: none;
  border-bottom: 1px solid rgba(191, 231, 255, .35);
}
.foot a:hover { border-bottom-color: #bfe7ff; }
@media (max-width: 480px) {
  .stats { grid-template-columns: 1fr 1fr; }
  .stat.wide { grid-column: 1 / -1; }
  .total { font-size: clamp(56px, 22vw, 96px); }
  .row { grid-template-columns: 78px 1fr 44px; gap: 8px; }
  .hours { height: 104px; }
  .hour-label { font-size: 8px; }
}
</style>
</head>
<body>
<main class="card">
  <div class="brand"><span class="dot" aria-hidden="true"></span> Plan zajęć</div>
  <p class="eyebrow">Licznik wejść</p>
  <div class="total">${total}</div>
  <p class="lead">Każde otwarcie aplikacji — w przeglądarce, jako PWA albo w aplikacji
    Android — zwiększa licznik.</p>

  <dl class="stats">
    <div class="stat"><dt>Przeglądarka</dt><dd>${web}</dd></div>
    <div class="stat"><dt>PWA</dt><dd>${pwa}</dd></div>
    <div class="stat"><dt>Aplikacja Android</dt><dd>${apk}</dd></div>
    ${peakCells}
    <div class="stat wide"><dt>Pierwsze wejście</dt><dd>${first}</dd></div>
    <div class="stat wide"><dt>Ostatnie wejście</dt><dd>${last}</dd></div>
  </dl>

  ${breakdown}

  <p class="foot">Aktualizacja co 15 s · <a href="${href}">otwórz plan zajęć</a></p>
</main>
</body>
</html>
`;
}

module.exports = {
  VisitCounter, renderVisitsPage, formatNumber, formatDate, warsawStamp, KEEP_DAYS,
};
