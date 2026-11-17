'use strict';
/**
 * Eksport planu do iCalendar (RFC 5545) i CSV.
 */

const crypto = require('crypto');

const TZ = 'Europe/Warsaw';

function icsDate(dateIso, time) {
  const [y, m, d] = dateIso.split('-');
  const [hh, mm] = time.padStart(5, '0').split(':');
  return `${y}${m}${d}T${hh}${mm}00`;
}

function esc(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Zawijanie długich linii do 75 oktetów zgodnie z RFC 5545. */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 74) return line;
  const out = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, 'utf8');
    const limit = out.length === 0 ? 74 : 73;
    if (currentBytes + chBytes > limit) {
      out.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) out.push(current);
  return out.join('\r\n ');
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Warsaw',
  'BEGIN:STANDARD',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
];

function toICS(plan, { domain = 'plan.local' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//plan-zajec//Plan zajec//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(plan.meta.groupName || 'Plan zajęć')}`,
    'X-WR-TIMEZONE:' + TZ,
    ...VTIMEZONE,
  ];

  for (const c of plan.classes) {
    const uid = crypto
      .createHash('sha1')
      .update(`${c.date}|${c.start}|${c.runId}|${c.group}|${c.subject}`)
      .digest('hex')
      .slice(0, 24);

    const desc = [
      `Przedmiot: ${c.subject}`,
      `Forma: ${c.form.label}`,
      `Prowadzący: ${c.lecturer}`,
      `Grupa: ${c.group}`,
      c.mode === 'zdalne' ? 'Tryb: zdalnie' : `Sala: ${c.room?.label || c.roomRaw || '—'}`,
      c.room?.description ? `Sala (opis): ${c.room.description}` : null,
      c.passForm ? `Zaliczenie: ${c.passForm}` : null,
      c.notes ? `Uwagi: ${c.notes}` : null,
      `Źródło: ${plan.meta.source || ''}`,
    ].filter(Boolean).join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@${domain}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`,
      `DTSTART;TZID=${TZ}:${icsDate(c.date, c.start)}`,
      `DTEND;TZID=${TZ}:${icsDate(c.date, c.end)}`,
      `SUMMARY:${esc(`${c.subject} (${c.form.code})`)}`,
      `LOCATION:${esc(c.mode === 'zdalne' ? 'Zdalnie' : (c.room?.label || c.roomRaw || ''))}`,
      `DESCRIPTION:${esc(desc)}`,
      `CATEGORIES:${esc(c.mode === 'zdalne' ? 'Zdalne' : 'Stacjonarne')},${esc(c.form.label)}`,
      c.status ? `STATUS:${c.status}` : null,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).map(fold).join('\r\n') + '\r\n';
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(plan) {
  const header = [
    'Data', 'Dzień', 'Od', 'Do', 'Godziny', 'Przedmiot', 'Forma', 'Tryb',
    'Sala', 'Budynek', 'Prowadzący', 'Grupa', 'Zaliczenie', 'Uwagi',
  ];
  const rows = plan.classes.map((c) => [
    c.date,
    c.weekday || '',
    c.start,
    c.end,
    c.hours,
    c.subject,
    c.form.label,
    c.mode === 'zdalne' ? 'zdalne' : 'stacjonarne',
    c.mode === 'zdalne' ? '' : (c.room?.label || c.roomRaw || ''),
    c.room?.building || '',
    c.lecturer,
    c.group,
    c.passForm,
    c.notes,
  ]);
  const body = [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
  return '\uFEFF' + body + '\r\n'; // BOM, aby Excel poprawnie odczytał polskie znaki
}

module.exports = { toICS, toCSV };
