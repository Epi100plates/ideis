'use strict';
/**
 * Parser strony harmonogramów APR (harmonogramy.ideis.pl).
 *
 * Format danych: DevExpress MVC GridView renderowany serwerowo.
 * Wiersze danych: <tr id="gridViewPlanyGrup_DXDataRow12">
 * Wiersze nagłówków dni: <tr id="gridViewPlanyGrup_DXGroupRowExp0"> z treścią "Data Zajęć: 2026.10.17 sobota"
 */

const MONTHS_PL = {
  stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6,
  lipca: 7, sierpnia: 8, 'września': 9, pazdziernika: 10, 'października': 10,
  listopada: 11, grudnia: 12,
};

const WEEKDAY_PL = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  oacute: 'ó', aacute: 'á', eacute: 'é', iacute: 'í', uacute: 'ú',
  auml: 'ä', ouml: 'ö', uuml: 'ü', szlig: 'ß',
  hellip: '…', ndash: '–', mdash: '—', bdquo: '„', rdquo: '”',
  'lsquo': '‘', 'rsquo': '’', 'laquo': '«', 'raquo': '»',
  'middot': '·', 'deg': '°',
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&([a-z]+);?/gi, (full, name) => {
      const v = NAMED_ENTITIES[name.toLowerCase()];
      return v !== undefined ? v : full;
    });
}

function cellText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<link[^>]*>/gi, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function firstHref(cellHtml) {
  const m = cellHtml.match(/href=['"]([^'"]+)['"]/i);
  return m ? m[1] : null;
}

const ID_RE = /\/Plany\/(\w+)\/(\d+)\s*$/i;

/** Wyciąga identyfikator encji z linku w komórce, np. /Plany/PlanySal/20 -> {kind:'PlanySal', id:'20'} */
function linkRef(cellHtml) {
  const href = firstHref(cellHtml);
  if (!href) return null;
  const m = href.match(ID_RE);
  if (!m) return null;
  return { kind: m[1], id: m[2], href };
}

/**
 * Stan kontrolki DevExpress GridView (tokeny potrzebne do callbacku filtrowania).
 * W HTML występuje jako: 'stateObject':{'customOperationState':'...','callbackState':'...'}
 */
function extractGridState(html) {
  const grab = (name) => {
    const m = html.match(new RegExp("'" + name + "':'([^']+)'"));
    return m ? m[1] : null;
  };
  const customOperationState = grab('customOperationState');
  const callbackState = grab('callbackState');
  if (!customOperationState || !callbackState) {
    throw new Error('Nie udało się odczytać stanu kontrolki planu (customOperationState/callbackState).');
  }
  return { customOperationState, callbackState };
}

/**
 * Zakres semestru z formularza filtrów.
 * <input id="RadioList_Termin3" value="2026,9,11\2027,2,7\3">  (miesiąc 1-indeksowany)
 */
function extractSemesterRange(html) {
  const m = html.match(/id="RadioList_Termin3"[^>]*value="([^"]+)"/);
  if (!m) return null;
  const parts = decodeEntities(m[1]).split('\\');
  if (parts.length < 2) return null;
  const toIso = (s) => {
    const [y, mo, d] = s.split(',').map(Number);
    if (!y || !mo || !d) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  const start = toIso(parts[0]);
  const end = toIso(parts[1]);
  return start && end ? { start, end } : null;
}

/** Data ostatniej aktualizacji danych pokazana na stronie (jeśli jest). */
function extractPageGroupCode(html) {
  // Nazwa grupy bywa w tytule/etykiecie, np. "Plan dla grupy: Infor. 1st 1sem Cw2N"
  const m = html.match(/Plan dla grupy:\s*([^<]+)/);
  return m ? cellText(m[1]) : null;
}

/**
 * Zamienia HTML siatki na listę surowych rekordów zajęć.
 * Kolejność kolumn: [wcięcie] Czas od | Czas do | Liczba godzin | Zajęcia | Forma zaj. |
 *                   Grupy | Sala | Prowadzący | Forma zaliczenia | Id uruch. | Toki nauki | Uwagi
 */
function parseGridHtml(html) {
  const rowRe = /<tr[^>]*id="gridViewPlanyGrup_(DXGroupRow(?:Exp)?\d+|DXDataRow\d+)"[^>]*>([\s\S]*?)<\/tr>/g;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;

  const records = [];
  let currentDate = null;
  let m;

  while ((m = rowRe.exec(html))) {
    const kind = m[1];
    const inner = m[2];

    const cells = [];
    let cm;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(inner))) cells.push(cm[1]);

    if (kind.startsWith('DXGroupRow')) {
      const txt = cells.map(cellText).join(' ');
      const dm = txt.match(/Data\s*Zaj[^:]*:\s*(\d{4})\.(\d{2})\.(\d{2})/);
      if (dm) currentDate = `${dm[1]}-${dm[2]}-${dm[3]}`;
      continue;
    }

    if (!currentDate) continue;

    const [, from, to, hours, subject, form, group, room, lecturer, passForm, runId, tok, notes] =
      cells.map(cellText);

    if (!/^\d{1,2}[:.]\d{2}$/.test(from || '')) continue;

    // Wszystkie numery grup z komórki „Grupy” — dzięki nim scalony plan można
    // filtrować po numerze, a nie po nazwie („Infor. 1st 3sem Ćw1N”), która
    // bywa inna dla każdego roku.
    const groupIds = [...String(cells[6] || '').matchAll(/\/Plany\/PlanyGrup\/(\d+)/g)]
      .map((m) => m[1]);

    records.push({
      date: currentDate,
      start: from.replace('.', ':'),
      end: (to || '').replace('.', ':'),
      hours,
      subject,
      form,
      group,
      room,
      lecturer,
      passForm,
      runId,
      tok,
      notes,
      groupIds,
      subjectRef: linkRef(cells[4] || ''),
      groupRef: linkRef(cells[6] || ''),
      roomRef: linkRef(cells[7] || ''),
      lecturerRef: linkRef(cells[8] || ''),
      tokRef: linkRef(cells[11] || ''),
    });
  }

  return records;
}

/** "2h00m" -> 120 */
function hoursToMinutes(h) {
  const m = /(\d+)\s*h\s*(\d+)/i.exec(h || '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

const REMOTE_RE = /distance\s*learning|zdaln|online|e-?learning|na\s+odległość/i;

/** Czy zajęcia są zdalne? Na tej uczelni: uwaga "Distance learning" i brak sali. */
function isRemote(rec) {
  const note = (rec.notes || '').trim();
  if (REMOTE_RE.test(note)) return true;
  if ((rec.room || '').trim() === '' && REMOTE_RE.test(note)) return true;
  return false;
}

/**
 * Rozbiór opisu sali na części.
 *   "S47 212"                      -> budynek S47, sala 212
 *   "S47 212 - prac. matematyczna"  -> + opis
 *   "S55 27-AULA"                   -> + typ pomieszczenia (aula)
 *   "Z71 29 (R)"                    -> + dopisek w nawiasie
 */
function splitRoom(raw) {
  const s = (raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;

  const m = s.match(/^(\S+)\s+(\d+[A-Za-z]?)(?:-([A-Za-z]+))?\s*(.*)$/);
  if (!m) return { building: null, number: null, type: null, description: s, raw: s, label: s };

  const building = m[1];
  const number = m[2];
  const type = m[3] ? m[3].toUpperCase() : null;
  const description = (m[4] || '').trim().replace(/^-\s*/, '').trim() || null;

  return {
    building,
    number,
    type,
    description,
    raw: s,
    label: [building, number].filter(Boolean).join(' '),
  };
}

/** Forma zajęć -> etykieta i skrót */
function normalizeForm(form) {
  const f = (form || '').trim();
  const map = {
    'Wyk': { code: 'WYK', label: 'Wykład' },
    'Cw': { code: 'ĆW', label: 'Ćwiczenia' },
    'Lab': { code: 'LAB', label: 'Laboratorium' },
    'Cwi': { code: 'ĆW', label: 'Ćwiczenia' },
    'Sem': { code: 'SEM', label: 'Seminarium' },
    'Proj': { code: 'PRJ', label: 'Projekt' },
    'Prak': { code: 'PRK', label: 'Praktyka' },
    'Lek': { code: 'LEK', label: 'Lektorat' },
    'Wf': { code: 'WF', label: 'WF' },
  };
  if (map[f]) return { ...map[f], raw: f };
  return { code: f ? f.toUpperCase() : '', label: f || 'Zajęcia', raw: f };
}

/** Zamiana surowych rekordów na model używany przez frontend. */
function normalize(records, meta = {}) {
  const seen = new Map();
  const classes = [];

  for (const r of records) {
    const remote = isRemote(r);
    const room = remote ? null : splitRoom(r.room);
    const startMinutes = timeToMinutes(r.start);
    const endMinutes = timeToMinutes(r.end);
    const durationMin = (startMinutes != null && endMinutes != null && endMinutes > startMinutes)
      ? endMinutes - startMinutes
      : hoursToMinutes(r.hours);

    const startISO = `${r.date}T${r.start.padStart(5, '0')}:00`;
    const endISO = `${r.date}T${r.end.padStart(5, '0')}:00`;

    const cls = {
      id: [r.date, r.start, r.end, r.runId, r.form, r.group].join('|'),
      date: r.date,
      weekday: weekdayPl(r.date),
      start: r.start,
      end: r.end,
      startISO,
      endISO,
      startMinutes,
      endMinutes,
      durationMin,
      hours: r.hours,
      subject: r.subject,
      form: normalizeForm(r.form),
      group: r.group,
      groups: (r.group || '').split(',').map(s => s.trim()).filter(Boolean),
      // Numery grup z linków komórki „Grupy” — po nich filtruje scalony plan
      // (`merge.js`), bo nazwa grupy nie jest stabilnym identyfikatorem.
      groupIds: Array.isArray(r.groupIds) ? r.groupIds : [],
      mode: remote ? 'zdalne' : 'stacjonarne',
      room,
      roomRaw: remote ? null : (r.room || null),
      lecturer: r.lecturer,
      passForm: r.passForm,
      notes: (r.notes || '').trim() === 'Brak' ? '' : (r.notes || '').trim(),
      runId: r.runId,
      tok: r.tok,
      links: {
        subject: r.subjectRef?.href || null,
        room: r.roomRef?.href || null,
        lecturer: r.lecturerRef?.href || null,
        group: r.groupRef?.href || null,
        tok: r.tokRef?.href || null,
      },
    };

    if (seen.has(cls.id)) continue;
    seen.set(cls.id, true);
    classes.push(cls);
  }

  classes.sort((a, b) => (a.startISO < b.startISO ? -1 : a.startISO > b.startISO ? 1 : a.start.localeCompare(b.start)));

  return summarize(classes, meta);
}

/**
 * Dokłada do listy zajęć dni, statystyki i liczniki — wspólne dla planu jednej
 * grupy i planu scalonego z kilku grup (`merge.js`).
 * @param {object[]} classes posortowane zajęcia
 * @param {object} meta metadane planu (źródło, grupa, zakres semestru…)
 */
function summarize(classes, meta = {}) {
  // Dni zajęć (zjazdy) pogrupowane po dacie
  const dayMap = new Map();
  for (const c of classes) {
    if (!dayMap.has(c.date)) {
      dayMap.set(c.date, { date: c.date, weekday: weekdayPl(c.date), classes: 0, firstStart: c.start, lastEnd: c.end });
    }
    const d = dayMap.get(c.date);
    d.classes += 1;
    if (c.start < d.firstStart) d.firstStart = c.start;
    if (c.end > d.lastEnd) d.lastEnd = c.end;
  }
  const days = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const stats = computeStats(classes);

  return {
    meta: {
      ...meta,
      semesterFrom: days.length ? days[0].date : meta.semesterFrom || null,
      semesterTo: days.length ? days[days.length - 1].date : meta.semesterTo || null,
      classes: classes.length,
      days: days.length,
      subjects: [...new Set(classes.map(c => c.subject))].length,
      stats,
    },
    classes,
    days,
  };
}

function computeStats(classes) {
  const byMode = { stacjonarne: 0, zdalne: 0 };
  const minutesByMode = { stacjonarne: 0, zdalne: 0 };
  for (const c of classes) {
    byMode[c.mode] += 1;
    minutesByMode[c.mode] += c.durationMin || 0;
  }
  return {
    byMode,
    hoursByMode: {
      stacjonarne: Math.round(minutesByMode.stacjonarne / 60),
      zdalne: Math.round(minutesByMode.zdalne / 60),
    },
    totalHours: Math.round((minutesByMode.stacjonarne + minutesByMode.zdalne) / 60),
  };
}

function timeToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function weekdayPl(isoDate) {
  const [y, mo, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return WEEKDAY_PL[dt.getUTCDay()];
}

module.exports = {
  parseGridHtml,
  summarize,
  extractGridState,
  extractSemesterRange,
  extractPageGroupCode,
  normalize,
  splitRoom,
  isRemote,
  timeToMinutes,
  weekdayPl,
  decodeEntities,
  MONTHS_PL,
};
