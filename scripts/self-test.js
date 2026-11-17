#!/usr/bin/env node
'use strict';
/**
 * Szybkie testy własne (bez frameworków):  node scripts/self-test.js
 * Sprawdzają parser, wykrywanie zmian, limit historii i eksporty.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseGridHtml, extractSemesterRange, normalize, splitRoom } = require('../server/parser');
const { diffPlans } = require('../server/diff');
const { VersionStore } = require('../server/versions');
const { toICS, toCSV } = require('../server/export');
const { parseCatalogHtml, normalizeEntry } = require('../server/groups');
const {
  academicYearFromNabor,
  academicYearLabel,
  academicYearStart,
  degreeFromToki,
  deriveDimensions,
  modeFromToki,
  naborFromAcademicYear,
  splitName,
  yearOfStudy,
} = require('../server/dimensions');
const selection = require('../public/selection');
const { groupIdFromValue } = require('../server/group-id');
const { isWeekend, gapMinutes } = require('../server/schedule');
const { GroupRegistry } = require('../server/registry');
const { PlanCache } = require('../server/cache');
const { AttachmentStore, sanitizeFileName, normalizeLinkUrl } = require('../server/attachments');
const { VisitCounter, renderVisitsPage, formatNumber, KEEP_DAYS } = require('../server/visits');
const { NoteStore, normalizeNote, noteLength, MAX_LENGTH } = require('../server/notes');
const { ReleaseStore, normalizeRelease, parseRange } = require('../server/app-updates');

/** Wyimek prawdziwego katalogu — testy działają bez sieci. */
const CATALOG_FIXTURE = path.join(__dirname, '..', 'tests', 'fixtures', 'znajdz-grupe.html');

/** Katalog stylów web — ten sam plik, który ładuje przeglądarka. */
function loadPlanStyles() {
  if (!globalThis.PlanStyles) require('../public/styles.js');
  return globalThis.PlanStyles;
}

let passed = 0;
const failures = [];
const asyncTests = [];

function test(name, fn) {
  // Test asynchroniczny MUSI być wyczekany. Wcześniej `fn()` bez `await`
  // liczyło się jako zdane od razu — async test dawał fałszywe zielone,
  // a jego błąd wypływał dopiero jako nieobsłużone odrzucenie.
  if (fn.constructor && fn.constructor.name === 'AsyncFunction') {
    asyncTests.push({ name, fn });
    return;
  }
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

function testAsync(name, fn) {
  asyncTests.push({ name, fn });
}

/**
 * Czyta plik repo z normalizacją końców linii.
 *
 * Windows z `core.autocrlf=true` (i część edytorów) zapisuje CRLF, a testy
 * porównują wielolinijkowe fragmenty źródeł — bez normalizacji `indexOf`/regex
 * z `\n` przestają trafiać i „źródło się zmieniło”, choć nic się nie zmieniło.
 */
function readRepo(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8').replace(/\r\n/g, '\n');
}

async function withStore(opts, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-attachments-'));
  try {
    return await fn(new AttachmentStore({ root, ...opts }), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ atrapa HTML
const ROW = (opts = {}) => {
  const {
    date = '2026.10.17 sobota', from = '9:00', to = '10:30', hours = '2h00m',
    subject = 'Algebra', form = 'Wyk', group = 'Infor. 1st 1sem WykN',
    room = 'S55 27-AULA', lecturer = 'mgr Janusz Grabski', pass = 'Egzamin',
    run = '74835', tok = 'Informatyka N inż. 3.50 2026/2027 Zima', notes = 'Brak',
  } = opts;
  return `tr data`;
};

const GRID = `
<table>
  <tr id="gridViewPlanyGrup_DXGroupRowExp0" class="dxgvGroupRow"><td></td><td colspan="12">Data Zajęć: 2026.10.17 sobota </td></tr>
  <tr id="gridViewPlanyGrup_DXDataRow1">
    <td class="dxgvIndentCell">&nbsp;</td>
    <td>9:00</td><td>10:30</td><td>2h00m</td>
    <td><a class='planLink' href='/Plany/PlanyPrzedmiotow/74835'>Algebra liniowa</a>&nbsp</td>
    <td>Wyk</td><td><a href='/Plany/PlanyGrup/21186'>Infor. 1st 1sem WykN</a>&nbsp</td>
    <td><a href='/Plany/PlanySal/20'>S55 27-AULA</a>&nbsp</td>
    <td><a href='/Plany/PlanyProwadzacych/1399'>mgr Janusz Grabski</a>&nbsp</td>
    <td>Egzamin</td><td>74835</td><td>Informatyka N inż. 3.50 2026/2027 Zima</td><td>Brak</td>
    <td class="dxgvAIC"></td>
  </tr>
  <tr id="gridViewPlanyGrup_DXGroupRowExp1" class="dxgvGroupRow"><td></td><td colspan="12">Data Zajęć: 2026.10.18 niedziela </td></tr>
  <tr id="gridViewPlanyGrup_DXDataRow2">
    <td class="dxgvIndentCell">&nbsp;</td>
    <td>8:10</td><td>10:30</td><td>3h00m</td>
    <td>Fizyka 1</td><td>Wyk</td><td>Infor. 1st 1sem WykN</td>
    <td></td><td>mgr Artur Rokosa</td>
    <td>Zaliczenie ocena</td><td>74856</td><td>Informatyka N</td><td>Distance learning</td>
    <td class="dxgvAIC"></td>
  </tr>
</table>`;

const PAGE = `<input id="RadioList_Termin3" value="2026,9,11\\2027,2,7\\3">`;

// --------------------------------------------------------------------- testy
console.log('Parser:');
test('odczytuje zakres semestru z radio', () => {
  const range = extractSemesterRange(PAGE);
  assert.deepEqual(range, { start: '2026-09-11', end: '2027-02-07' });
});

test('parsuje wiersze siatki i daty dni', () => {
  const rows = parseGridHtml(GRID);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2026-10-17');
  assert.equal(rows[1].date, '2026-10-18');
  assert.equal(rows[0].subject, 'Algebra liniowa');
  assert.equal(rows[0].start, '9:00');
  assert.equal(rows[1].notes, 'Distance learning');
});

test('rozpoznaje zajęcia zdalne po uwadze i braku sali', () => {
  const plan = normalize(parseGridHtml(GRID));
  const remote = plan.classes.filter((c) => c.mode === 'zdalne');
  assert.equal(remote.length, 1);
  assert.equal(remote[0].subject, 'Fizyka 1');
  assert.equal(plan.classes[0].mode, 'stacjonarne');
});

test('rozkłada salę na budynek / numer / opis', () => {
  assert.deepEqual(splitRoom('S55 27-AULA'), {
    building: 'S55', number: '27', type: 'AULA', description: null, raw: 'S55 27-AULA', label: 'S55 27',
  });
  assert.equal(splitRoom('S47 212 - prac. matematyczna').label, 'S47 212');
  assert.equal(splitRoom('S47 212 - prac. matematyczna').description, 'prac. matematyczna');
});

console.log('\nHistoria wersji:');
const basePlan = normalize(parseGridHtml(GRID), { fetchedAt: new Date().toISOString() });

test('identyczny plan nie tworzy nowej wersji', () => {
  const store = new VersionStore({ max: 200 });
  const a = store.add(basePlan, new Date());
  const b = store.add(JSON.parse(JSON.stringify(basePlan)), new Date());
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(store.versions.length, 1);
});

test('zmiana sali tworzy wersję ze zmianą typu "changed"', () => {
  const store = new VersionStore({ max: 200 });
  store.add(basePlan, new Date());
  const changed = JSON.parse(JSON.stringify(basePlan));
  changed.classes[0].roomRaw = 'S47 310';
  changed.classes[0].room = splitRoom('S47 310');
  const res = store.add(changed, new Date());
  assert.equal(res.created, true);
  assert.equal(store.versions.length, 2);
  assert.equal(res.version.diff.counts.changed, 1);
  assert.equal(res.version.diff.counts.added, 0);
});

test('dodane i usunięte zajęcia są liczone osobno', () => {
  const store = new VersionStore({ max: 200 });
  store.add(basePlan, new Date());
  const next = JSON.parse(JSON.stringify(basePlan));
  next.classes[1].date = '2026-10-24';   // przesunięcie na inny dzień = usunięcie + dodanie
  next.classes[1].id = next.classes[1].id.replace('2026-10-18', '2026-10-24');
  const res = store.add(next, new Date());
  assert.equal(res.version.diff.counts.added, 1);
  assert.equal(res.version.diff.counts.removed, 1);
});

test('limit 200 wersji — najstarsze wypadają', () => {
  const store = new VersionStore({ max: 200 });
  for (let i = 0; i < 260; i++) {
    const p = JSON.parse(JSON.stringify(basePlan));
    p.classes[0].start = `${8 + (i % 4)}:${String(i % 60).padStart(2, '0')}`;
    p.classes[0].id = `v${i}`;
    store.add(p, new Date());
  }
  assert.equal(store.versions.length, 200);
  assert.equal(store.versions[0].id, 61);            // pierwsze 60 wypadło
  assert.equal(store.current().id, 260);
});

test('diff zwraca zera dla identycznych planów', () => {
  const d = diffPlans(basePlan, JSON.parse(JSON.stringify(basePlan)));
  assert.deepEqual(d.counts, { added: 0, removed: 0, changed: 0 });
});

console.log('\nEksporty:');
test('ICS ma poprawne nagłówki, strefę i liczbę zdarzeń', () => {
  const ics = toICS(basePlan);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR/);
  assert.match(ics, /TZID=Europe\/Warsaw/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  const longest = Math.max(...ics.split('\r\n').map((l) => Buffer.byteLength(l, 'utf8')));
  assert.ok(longest <= 75, `linia ma ${longest} oktetów`);
});

test('CSV ma BOM, nagłówek i tyle wierszy ile zajęć', () => {
  const csv = toCSV(basePlan);
  assert.ok(csv.startsWith('\uFEFF'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 1 + basePlan.classes.length);
  assert.match(lines[0], /Przedmiot/);
});

console.log('\nKatalog grup:');
const catalogHtml = fs.readFileSync(CATALOG_FIXTURE, 'utf8');
const catalog = parseCatalogHtml(catalogHtml, { now: new Date('2026-11-15T12:00:00Z') });

test('parsuje katalog offline (19 grup z wyimka)', () => {
  assert.equal(catalog.length, 19);
});

test('każda grupa ma cyfrowe id, bez duplikatów', () => {
  const ids = catalog.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^\d{2,8}$/.test(id)));
});

test('kod grupy jest niepusty', () => {
  assert.ok(catalog.every((g) => g.code && g.code.trim()));
});

test('grupa domyślna 21188 jest w katalogu i ma poprawne części', () => {
  const g = catalog.find((x) => x.id === '21188');
  assert.ok(g, 'brak grupy 21188');
  assert.equal(g.field, 'Informatyka');
  assert.equal(g.semester, 1);
  assert.equal(g.kind, 'Ćw');
  assert.equal(g.number, '2');
  assert.match(g.code, /Infor\. 1st 1sem/);
});

test('normalizacja kodu: Labor7B → Lab / 7B', () => {
  const g = normalizeEntry({
    id: '22499',
    code: 'Psychologia Jmgr 5sem Labor7B',
    name: 'Psychologia, Jmgr 5sem Labor (gr. 7B) S',
    field: 'Psychologia',
  });
  assert.equal(g.semester, 5);
  assert.equal(g.kind, 'Lab');
  assert.equal(g.number, '7B');
  assert.equal(g.field, 'Psychologia');
});

console.log('\nWymiary grup (rok, specjalność, nabór, typ studiów):');
test('rok studiów = ceil(semestr / 2)', () => {
  assert.equal(yearOfStudy(1), 1);
  assert.equal(yearOfStudy(2), 1);
  assert.equal(yearOfStudy(3), 2);
  assert.equal(yearOfStudy(10), 5);
  assert.equal(yearOfStudy(null), null);
});

test('nabór i rok akademicki przeliczają się w obie strony', () => {
  // Nabór 2024 + 2. rok studiów → plan na rok akademicki 2025/2026.
  assert.equal(academicYearFromNabor(2024, 2), 2025);
  // Grupa z 3. semestru w roku 2025/2026 to nabór 2023/2024.
  assert.equal(naborFromAcademicYear(2025, 2), 2024);
  assert.equal(academicYearLabel(2026), '2026/2027');
  assert.equal(academicYearStart('2026/2027'), 2026);
  assert.equal(academicYearStart('25/26z'), null);
});

test('nazwa grupy dzieli się na człon, stopień i semestr', () => {
  const parts = splitName('Prawo w biznesie i administracji, 1st 3sem Wyk N');
  assert.equal(parts.subject, 'Prawo w biznesie i administracji');
  assert.equal(parts.degree, '1st');
  assert.equal(parts.semester, 3);
  assert.equal(parts.mode, 'N');
});

test('pierwszy rok nie ma specjalności', () => {
  const g = deriveDimensions({ name: 'Informatyka, 1st 1sem Wyk N', field: 'Informatyka', academicYears: ['2026/2027'] });
  assert.equal(g.specialty, null);
  assert.equal(g.year, 1);
  assert.equal(g.degree, '1st');
  assert.equal(g.mode, 'N');
  assert.deepEqual(g.nabory, [2026]);
});

test('prawdziwa specjalność zostaje, także gdy zaczyna się od nazwy kierunku', () => {
  const a = deriveDimensions({
    name: 'Prawo w biznesie i administracji, 1st 3sem Wyk N',
    field: 'Administracja',
    academicYears: ['2026/2027'],
  });
  assert.equal(a.specialty, 'Prawo w biznesie i administracji');
  assert.equal(a.year, 2);

  const b = deriveDimensions({
    name: 'Psychologia kliniczna i zdrowia, Jmgr 7sem Wyk N',
    field: 'Psychologia',
    academicYears: ['2026/2027'],
  });
  assert.equal(b.specialty, 'Psychologia kliniczna i zdrowia');
  assert.equal(b.degree, 'jmgr');
  assert.equal(b.year, 4);
});

test('skrót i literówka kierunku to nie specjalność', () => {
  const abbrev = deriveDimensions({ name: 'Infor. 1st 3sem Lek/NIEM N', field: 'Informatyka', academicYears: [] });
  assert.equal(abbrev.specialty, null);

  const typo = deriveDimensions({ name: 'Inforamtyka, 1st 3sem Lekt/ANG (gr.3) N', field: 'Informatyka', academicYears: [] });
  assert.equal(typo.specialty, null);
});

test('skrót kierunku macierzystego trafia do pola parent', () => {
  const g = deriveDimensions({
    name: 'Kryminologia z kryminalistyką (BW), 1st 3sem Wyk S',
    field: 'Bezpieczeństwo wewnętrzne',
    academicYears: ['2025/2026'],
  });
  assert.equal(g.specialty, 'Kryminologia z kryminalistyką');
  assert.equal(g.parent, 'BW');
});

test('„Inżynier …” nie jest stopniem „inż”', () => {
  const g = deriveDimensions({
    name: 'Inżynier aplikacji i systemów mobilnych, 1st 4sem Wyk S',
    field: 'Informatyka',
    academicYears: ['2026/2027'],
  });
  assert.equal(g.degree, '1st');
  assert.equal(g.specialty, 'Inżynier aplikacji i systemów mobilnych');
});

test('studia podyplomowe i jednolite magisterskie mają własny typ', () => {
  const podypl = deriveDimensions({
    name: 'Administracja – prawo, zarządzanie i organizacja z elementami AI (BIS), Podypl. 1sem Wyk N',
    field: 'Administracja – prawo, zarządzanie i organizacja z elementami AI',
    academicYears: ['2026/2027'],
  });
  assert.equal(podypl.degree, 'podypl');
  assert.equal(podypl.year, 1);
  assert.equal(podypl.specialty, null);
  assert.equal(podypl.parent, 'BIS');
});

test('nabór wynika z każdego roku akademickiego w tokach i z bieżącego roku', () => {
  const g = deriveDimensions({
    name: 'Informatyka, 1st 3sem Wyk N',
    field: 'Informatyka',
    academicYears: ['2024/2025', '2025/2026'],
  }, { now: new Date('2026-11-15T12:00:00Z') });
  // 3. semestr = 2. rok → nabory 2023 i 2024 z toków, a bieżący rok akademicki
  // (2026/2027) dokłada nabór 2025 — uczelnia nie dopisuje toku od razu.
  assert.deepEqual(g.nabory, [2023, 2024, 2025]);
  assert.ok(g.academicYears.includes('2026/2027'), 'bieżący rok akademicki jest w tokach grupy');
});

test('każdy wpis katalogu ma spójne wymiary (rok z semestru, nabór z toku)', () => {
  for (const group of catalog) {
    if (Number.isInteger(group.semester)) {
      assert.equal(group.year, Math.ceil(group.semester / 2), `${group.id}: rok z semestru ${group.semester}`);
    }
    if (Number.isInteger(group.year) && group.academicYears.length) {
      for (const label of group.academicYears) {
        const start = academicYearStart(label);
        const expected = start - (group.year - 1);
        assert.ok(group.nabory.includes(expected), `${group.id}: brak naboru ${expected} z toku ${label}`);
      }
    }
    if (group.mode) assert.match(group.mode, /^[NS]$/, `${group.id}: tryb ${group.mode}`);
    if (group.degree) {
      assert.match(group.degree, /^(1st|2st|jmgr|inż|podypl)$/, `${group.id}: typ ${group.degree}`);
    }
    // Grupa bez roku nie może mieć wynalezionego naboru z sufitu.
    if (!group.year && group.academicYears.length) {
      assert.ok(group.nabory.every((nabor) => group.academicYears
        .map(academicYearStart)
        .includes(nabor)), `${group.id}: nabór bez roku`);
    }
  }
});

test('grupa bez semestru nie dostaje wymyślonego roku', () => {
  const g = deriveDimensions({
    name: 'Exploring Central Europe: History, Memory and Identity Across Borders, 25/26z Wyk',
    field: 'Exploring Central Europe: History, Memory and Identity Across Borders',
    academicYears: [],
  });
  assert.equal(g.semester, null);
  assert.equal(g.year, null);
  assert.equal(g.specialty, null);
});

test('tryb i typ uzupełniane z toków, gdy nazwa ich nie podaje', () => {
  // Nazwa bez litery trybu i bez stopnia — tok podaje oba.
  const samorzad = deriveDimensions({
    name: 'Administracja samorządowa 2st 3sem Wyk',
    field: 'Administracja samorządowa',
    academicYears: ['2025/2026'],
    toki: 'Administracja samorządowa N mgr 2.00 2025/2026 Zima',
  });
  assert.equal(samorzad.mode, 'N');
  assert.equal(samorzad.degree, '2st');
  assert.equal(samorzad.year, 2);

  const licencjat = deriveDimensions({
    name: 'Zrównoważone zarządzanie projektami, 1st 5sem Wyk',
    field: 'Zrównoważone zarządzanie projektami',
    academicYears: ['2024/2025'],
    toki: 'Zrównoważone zarządzanie projektami N lic. 3.00 2024/2025 Zima',
  });
  assert.equal(licencjat.mode, 'N');
  assert.equal(licencjat.degree, '1st');
});

test('nazwa grupy ma pierwszeństwo przed tokami', () => {
  const g = deriveDimensions({
    name: 'Informatyka, 2st 3sem Wyk S',
    field: 'Informatyka',
    academicYears: ['2025/2026'],
    toki: 'Informatyka N mgr 2.00 2025/2026 Zima',
  });
  assert.equal(g.mode, 'S');
  assert.equal(g.degree, '2st');
});

test('sprzeczne toki nie dają zgadywanego trybu ani stopnia', () => {
  const g = deriveDimensions({
    name: 'Erasmus+ Creative Media Wyk',
    field: 'Erasmus+',
    academicYears: ['2025/2026'],
    toki: 'Erasmus+ Creative Media N lic. 1.00 2025/2026 Zima , Erasmus+ Creative Media S mgr 1.00 2025/2026 Zima',
  });
  assert.equal(g.mode, null);
  assert.equal(g.degree, null);
});

test('sam tok bez trybu nie tworzy wymiaru', () => {
  assert.equal(modeFromToki('Informatyka lic. 3.00 2025/2026 Zima'), null);
  assert.equal(degreeFromToki('Informatyka N 3.00 2025/2026 Zima'), null);
  assert.equal(degreeFromToki(''), null);
});

test('tryb działa także z dopiskiem w nawiasie na końcu nazwy', () => {
  // Część grup kończy się na „(K)”/„(W)”, a litera trybu stoi wcześniej.
  const g = deriveDimensions({
    name: 'Cyfryzacja, współpraca i bezpieczeństwo pracy - praktyczne kompetencje specjalistów PSZ, Podypl. 1sem Wyk N (K)',
    field: 'Cyfryzacja, współpraca i bezpieczeństwo pracy - praktyczne kompetencje specjalistów PSZ (K)',
    academicYears: ['2026/2027'],
  });
  assert.equal(g.mode, 'N');
  assert.equal(g.degree, 'podypl');
  assert.equal(g.year, 1);
});

test('„P” w nazwie to studia podyplomowe', () => {
  const g = deriveDimensions({
    name: 'Arteterapia P 1sem Cw2 N',
    field: 'Arteterapia',
    academicYears: ['2026/2027'],
  });
  assert.equal(g.degree, 'podypl');
  assert.equal(g.mode, 'N');
  assert.equal(g.year, 1);
});

test('nazwa bez litery trybu zostaje bez trybu (nie zgadujemy)', () => {
  const g = deriveDimensions({
    name: 'Exploring Central Europe: History, Memory and Identity Across Borders, 25/26z Wyk',
    field: 'Exploring Central Europe: History, Memory and Identity Across Borders',
    academicYears: ['2025/2026'],
  });
  assert.equal(g.mode, null);
});

console.log('\nWybór grupy (wspólny dla przeglądarki i serwera):');
// Picker i serwer porównują skrócone wpisy — pełny katalog mapuje `toWire`.
const wireCatalog = catalog.map(selection.toWire);
const DEFAULT_PICK = { nabor: '2026', field: 'Informatyka', spec: '', year: '1', degree: '1st', mode: 'N' };

test('toWire przenosi wymiary i jest idempotentne', () => {
  const source = catalog.find((g) => g.id === '20764');
  const wire = selection.toWire(source);
  assert.equal(wire.f, 'Bezpieczeństwo wewnętrzne');
  // Toki z fixture'a dają nabór 2024, a bieżący rok akademicki (2026) — 2025.
  assert.deepEqual(wire.b, [2024, 2025]);
  assert.equal(wire.s, 'Kryminologia z kryminalistyką');
  assert.deepEqual(selection.toWire(wire), wire);
});

test('wybór 1. roku informatyki niestacjonarnej zwraca 7 grup', () => {
  const picked = selection.filter(wireCatalog, DEFAULT_PICK);
  assert.equal(picked.length, 7);
  assert.deepEqual(
    picked.map((g) => g.id).sort(),
    ['21186', '21187', '21188', '21189', '21190', '21191', '22563'],
  );
});

test('każda wybrana grupa ma kierunek, tryb, typ i nabór z wyboru', () => {
  for (const g of selection.filter(wireCatalog, DEFAULT_PICK)) {
    assert.equal(g.f, 'Informatyka');
    assert.equal(g.d, '1st');
    assert.equal(g.m, 'N');
    assert.equal(g.y, 1);
    assert.ok(g.b.includes(2026));
  }
});

test('specjalność „—” pokazuje grupy bez specjalności, „” pokazuje wszystkie', () => {
  const everything = { nabor: '', field: '', spec: '', year: '', degree: '', mode: '' };
  const withNone = selection.filter(wireCatalog, { ...everything, spec: selection.NONE });
  assert.ok(withNone.length > 0);
  assert.ok(withNone.every((g) => !g.s));
  const all = selection.filter(wireCatalog, everything);
  assert.ok(all.some((g) => g.s), 'są grupy ze specjalnością');
  assert.ok(all.length > withNone.length);
});

test('stary nabór trafia w inne grupy albo w nic', () => {
  const current = selection.filter(wireCatalog, DEFAULT_PICK);
  const older = selection.filter(wireCatalog, { ...DEFAULT_PICK, nabor: '2023' });
  assert.equal(current.length, 7);
  assert.equal(older.length, 0, 'grupy 1. roku z 2026 nie mają naboru 2023');
});

test('opcje wymiarów nie zubażają się o wybraną wartość', () => {
  const facets = selection.facets(wireCatalog, DEFAULT_PICK);
  // Wybrany kierunek nie znika z listy, a inne kierunki wciąż są wybieralne.
  assert.ok(facets.field.includes('Administracja'), 'inny kierunek nadal wybieralny');
  assert.ok(facets.field.includes('Informatyka'));
  assert.ok(facets.nabor.includes(2026));
  assert.ok(facets.year.includes(1));
  assert.ok(facets.spec.includes(null), 'są grupy bez specjalności');

  // Specjalności pojawiają się dopiero na starszych latach i innych kierunkach —
  // po poluzowaniu kierunku muszą być widoczne.
  const wide = selection.facets(wireCatalog, { nabor: '', field: '', spec: '', year: '', degree: '', mode: '' });
  assert.ok(wide.spec.some((value) => value && value.includes('Psychologia kliniczna')));
  assert.ok(wide.spec.some((value) => value && value.includes('Kryminologia')));
});

test('opis wyboru jest czytelny dla człowieka', () => {
  const text = selection.describe(DEFAULT_PICK, {
    degree: { '1st': 'I stopnia' },
    mode: { N: 'niestacjonarne' },
  });
  assert.equal(text, 'nabór 2026/2027 · Informatyka · 1. rok · I stopnia · niestacjonarne');
});

test('normalizacja rozpoznaje tryb, stopień i lata akademickie', () => {
  const g = normalizeEntry({
    id: '21188',
    code: 'Infor. 1st 1sem Ćw2',
    name: 'Informatyka, 1st 1sem Ćw (gr. 2) N',
    toki: 'Informatyka N inż. 3.50 2026/2027 Zima',
    field: 'Informatyka',
  });
  assert.equal(g.mode, 'N');
  assert.equal(g.degree, '1st');
  assert.deepEqual(g.academicYears, ['2026/2027']);
  assert.deepEqual(g.nabory, [2026]);
});

console.log('\nWalidacja i rejestr grup:');
test('groupFrom: brak parametru → domyślna, zły numer → 400', () => {
  assert.equal(groupIdFromValue(null, '21188'), '21188');
  assert.equal(groupIdFromValue('21188'), '21188');
  assert.throws(() => groupIdFromValue('abc'), (err) => err.status === 400);
  assert.throws(() => groupIdFromValue('../etc'), (err) => err.status === 400);
});

test('registry.get() dwa razy zwraca TEN SAM obiekt', () => {
  const reg = new GroupRegistry({ pinned: '21188', maxActive: 8 });
  const a = reg.get('21188');
  const b = reg.get('21188');
  assert.equal(a, b);
});

test('evict() usuwa najdawniej używaną, ale nie PINNED', () => {
  const reg = new GroupRegistry({ pinned: '21188', maxActive: 8 });
  reg.get('21188');
  const entries = [];
  for (let i = 1; i <= 8; i++) entries.push(reg.get(String(30000 + i)));
  entries.forEach((e, i) => { e.lastUsed = Date.now() - (8 - i) * 1000; });
  reg.evict();
  assert.equal(reg.map.size, 8);
  assert.equal(reg.has('30001'), false);
  assert.equal(reg.has('21188'), true);
});

console.log('\nCache planu:');
testAsync('świeży plan nie pyta uczelni', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-cache-'));
  try {
    const file = path.join(dir, 'plan.json');
    const plan = JSON.parse(JSON.stringify(basePlan));
    plan.meta.fetchedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify({ savedAt: plan.meta.fetchedAt, plan }));

    const cache = new PlanCache({ ttlMs: 60 * 60 * 1000, file });
    assert.equal(await cache.load(), true);
    let calls = 0;
    const result = await cache.get({ fetchFn: async () => { calls += 1; return plan; } });
    assert.equal(calls, 0);
    assert.equal(result.stale, false);
    assert.equal(result.plan.classes.length, plan.classes.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

testAsync('nieświeży plan wraca od razu, a odświeżanie idzie w tle', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-cache-'));
  try {
    const file = path.join(dir, 'plan.json');
    const old = JSON.parse(JSON.stringify(basePlan));
    old.meta.fetchedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    fs.writeFileSync(file, JSON.stringify({ savedAt: old.meta.fetchedAt, plan: old }));

    const cache = new PlanCache({ ttlMs: 60 * 1000, file });
    assert.equal(await cache.load(), true);

    let release;
    let calls = 0;
    const pending = new Promise((resolve) => { release = resolve; });
    const fetchFn = () => { calls += 1; return pending; };

    const started = Date.now();
    const result = await cache.get({ fetchFn });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(result.stale, true);
    assert.equal(result.plan.classes.length, old.classes.length);
    assert.equal(calls, 1);
    assert.ok(Date.now() - started < 1000, 'odpowiedź nie może czekać na uczelnię');
    assert.equal(cache.refreshing, true);

    const inFlight = cache.inFlight;
    const fresh = JSON.parse(JSON.stringify(old));
    fresh.meta.fetchedAt = new Date().toISOString();
    release(fresh);
    await inFlight;

    assert.equal(cache.refreshing, false);
    assert.equal(cache.plan, fresh);
    assert.equal(cache.error, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

testAsync('bez żadnego planu błąd pobrania jest zwracany', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-cache-'));
  try {
    const cache = new PlanCache({ file: path.join(dir, 'brak.json') });
    await assert.rejects(
      () => cache.get({ fetchFn: async () => { throw new Error('uczelnia leży'); } }),
      /uczelnia leży/,
    );
    assert.equal(cache.error, 'uczelnia leży');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

testAsync('grupa dodana po starcie wczytuje plan z dysku', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-cache-'));
  try {
    const file = path.join(dir, 'plan-77777.json');
    const plan = JSON.parse(JSON.stringify(basePlan));
    plan.meta.fetchedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify({ savedAt: plan.meta.fetchedAt, plan }));

    const registry = new GroupRegistry({ pinned: null });
    const entry = registry.get('77777');
    entry.cache.file = file;

    assert.equal(await registry.ensureLoaded(entry), true);
    assert.equal(entry.cache.plan.classes.length, plan.classes.length);
    assert.equal(entry.store.current().classes, plan.classes.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log('\nHarmonogram odświeżania:');
test('weekend = 60 min, dzień roboczy = 1440 min', () => {
  const saturday = new Date(2026, 9, 17);
  const sunday = new Date(2026, 9, 18);
  const monday = new Date(2026, 9, 19);
  assert.equal(isWeekend(saturday), true);
  assert.equal(isWeekend(sunday), true);
  assert.equal(isWeekend(monday), false);
  assert.equal(gapMinutes(saturday, { weekdayMin: 1440, weekendMin: 60 }), 60);
  assert.equal(gapMinutes(sunday, { weekdayMin: 1440, weekendMin: 60 }), 60);
  assert.equal(gapMinutes(monday, { weekdayMin: 1440, weekendMin: 60 }), 1440);
});

console.log('\nZałączniki do zajęć:');
const ATT_CLASS = '2026-10-17|09:00|10:30|74835|Wyk|21188';

testAsync('nazwa pliku nie pozwala wyjść z katalogu', () => {
  assert.equal(sanitizeFileName('../../etc/passwd.pdf'), 'passwd.pdf');
  assert.equal(sanitizeFileName('..\\..\\x.txt'), 'x.txt');
  assert.equal(sanitizeFileName('Zażółć gęślą jaźń.docx'), 'Zażółć gęślą jaźń.docx');
});

testAsync('dodaje, listuje i otwiera PDF przypisany do zajęć', async () => {
  await withStore({}, async (store) => {
    const data = Buffer.from('%PDF-1.4\nnotatka z algebry\n');
    const added = await store.add('21188', ATT_CLASS, {
      name: 'notatka.pdf',
      data,
      classInfo: { subject: 'Algebra', date: '2026-10-17', start: '09:00', end: '10:30', form: { code: 'WYK' } },
    });
    assert.equal(added.attachment.name, 'notatka.pdf');
    assert.equal(added.attachments.length, 1);
    assert.match(added.attachment.url, /^\/api\/attachments\/[a-f0-9]{24}\?group=21188&class=/);

    const listed = await store.list('21188', ATT_CLASS);
    assert.equal(listed.attachments.length, 1);
    assert.equal(listed.totalBytes, data.length);

    const opened = await store.open('21188', ATT_CLASS, added.attachment.id);
    assert.equal(opened.name, 'notatka.pdf');
    assert.equal(opened.mime, 'application/pdf');
    assert.equal(fs.readFileSync(opened.path).toString(), data.toString());
  });
});

testAsync('odrzuca zły typ, złą sygnaturę i pusty plik', async () => {
  await withStore({}, async (store) => {
    await assert.rejects(
      () => store.add('21188', ATT_CLASS, { name: 'wirus.exe', data: Buffer.from('MZ') }),
      (err) => err.status === 415,
    );
    await assert.rejects(
      () => store.add('21188', ATT_CLASS, { name: 'podrobiony.pdf', data: Buffer.from('MZ') }),
      (err) => err.status === 415,
    );
    await assert.rejects(
      () => store.add('21188', ATT_CLASS, { name: 'pusty.txt', data: Buffer.alloc(0) }),
      (err) => err.status === 400,
    );
  });
});

testAsync('obsługuje PPTX/XLSX/ODT, RTF, CSV i obrazy', async () => {
  await withStore({}, async (store) => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    for (const name of ['slajdy.pptx', 'arkusz.xlsx', 'dokument.odt']) {
      const added = await store.add('21188', ATT_CLASS, { name, data: zip });
      assert.equal(added.attachment.ext, name.split('.').pop());
    }

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const image = await store.add('21188', ATT_CLASS, { name: 'skan.png', data: png });
    assert.equal(image.attachment.mime, 'image/png');

    const rtf = await store.add('21188', ATT_CLASS, {
      name: 'notatka.rtf',
      data: Buffer.from('{\\rtf1\\ansi tekst}'),
    });
    assert.equal(rtf.attachment.mime, 'application/rtf');

    const csv = await store.add('21188', ATT_CLASS, {
      name: 'oceny.csv',
      data: Buffer.from('przedmiot,ocena\nAlgebra,4\n'),
    });
    assert.equal(csv.attachment.ext, 'csv');

    await assert.rejects(
      () => store.add('21188', ATT_CLASS, { name: 'fałszywy.pptx', data: Buffer.from('to nie zip') }),
      (err) => err.status === 415,
    );
  });
});

testAsync('dodaje bezpieczne linki i pilnuje ich limitu', async () => {
  await withStore({ maxLinksPerClass: 1 }, async (store) => {
    assert.throws(() => normalizeLinkUrl('javascript:alert(1)'), (err) => err.status === 400);
    assert.throws(() => normalizeLinkUrl('https://user:pass@example.com/x'), (err) => err.status === 400);

    const added = await store.addLink('21188', ATT_CLASS, {
      url: 'https://example.com/material.pdf',
      title: 'Materiał z wykładu',
    });
    assert.equal(added.link.url, 'https://example.com/material.pdf');
    assert.equal(added.links.length, 1);

    const listed = await store.list('21188', ATT_CLASS);
    assert.equal(listed.links.length, 1);
    assert.equal(listed.links[0].title, 'Materiał z wykładu');

    await assert.rejects(
      () => store.addLink('21188', ATT_CLASS, { url: 'https://example.com/inny' }),
      (err) => err.status === 409,
    );
  });
});

testAsync('linki nie zużywają limitu plików', async () => {
  await withStore({ maxFilesPerClass: 1, maxLinksPerClass: 1 }, async (store) => {
    const pdf = Buffer.from('%PDF-1.4\nx\n');
    await store.addLink('21188', ATT_CLASS, { url: 'https://example.com/material' });
    await store.add('21188', ATT_CLASS, { name: 'pierwszy.pdf', data: pdf });

    await assert.rejects(
      () => store.add('21188', ATT_CLASS, { name: 'drugi.pdf', data: pdf }),
      (err) => err.status === 409,
    );
    await assert.rejects(
      () => store.addLink('21188', ATT_CLASS, { url: 'https://example.com/drugi' }),
      (err) => err.status === 409,
    );
  });
});

testAsync('usuwa plik i link oraz ich metadane', async () => {
  await withStore({}, async (store) => {
    const pdf = Buffer.from('%PDF-1.4\nx\n');
    const file = await store.add('21188', ATT_CLASS, { name: 'do-usuniecia.pdf', data: pdf });
    const link = await store.addLink('21188', ATT_CLASS, { url: 'https://example.com/do-usuniecia' });

    const removedFile = await store.remove('21188', ATT_CLASS, file.attachment.id);
    assert.equal(removedFile.deleted.id, file.attachment.id);
    assert.equal(removedFile.attachments.length, 0);
    assert.equal(removedFile.links.length, 1);

    const removedLink = await store.removeLink('21188', ATT_CLASS, link.link.id);
    assert.equal(removedLink.deleted.id, link.link.id);
    assert.equal(removedLink.links.length, 0);

    const listed = await store.list('21188', ATT_CLASS);
    assert.equal(listed.attachments.length, 0);
    assert.equal(listed.links.length, 0);

    await assert.rejects(
      () => store.remove('21188', ATT_CLASS, file.attachment.id),
      (err) => err.status === 404,
    );
    await assert.rejects(
      () => store.removeLink('21188', ATT_CLASS, link.link.id),
      (err) => err.status === 404,
    );
  });
});

testAsync('limity liczby plików i miejsca działają per zajęcia', async () => {
  await withStore({ maxFilesPerClass: 1, maxBytesPerClass: 64 }, async (store) => {
    const pdf = Buffer.from('%PDF-1.4\nx\n');
    await store.add('21188', ATT_CLASS, { name: 'pierwszy.pdf', data: pdf });
    await assert.rejects(
      () => store.add('21188', ATT_CLASS, { name: 'drugi.pdf', data: pdf }),
      (err) => err.status === 409,
    );
  });

  await withStore({ maxBytesPerClass: 1024 }, async (store) => {
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1100, 0x20)]);
    await assert.rejects(
      () => store.add('21188', ATT_CLASS, { name: 'duzy.pdf', data: big }),
      (err) => err.status === 413,
    );
  });
});

testAsync('globalny limit miejsca chroni dysk', async () => {
  await withStore({ maxTotalBytes: 1024 * 1024 }, async (store) => {
    const chunk = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(600 * 1024, 0x20)]);
    await store.add('21188', ATT_CLASS, { name: 'a.pdf', data: chunk });
    await assert.rejects(
      () => store.add('21188', ATT_CLASS, { name: 'b.pdf', data: chunk }),
      (err) => err.status === 507,
    );
  });
});

testAsync('pliki różnych zajęć są rozdzielone', async () => {
  await withStore({}, async (store) => {
    const pdf = Buffer.from('%PDF-1.4\nx\n');
    await store.add('21188', ATT_CLASS, { name: 'a.pdf', data: pdf });
    const other = await store.list('21188', '2026-10-18|08:10|10:30|74856|Wyk|21188');
    assert.equal(other.attachments.length, 0);
  });
});

console.log('\nNotatki na kafelkach zajęć:');
const NOTE_CLASS = '2026-11-16|09:00|10:30|74835|Wyk|21188';
const NOTE_CLASS_2 = '2026-11-17|11:00|12:30|74840|Cw|21188';

async function withNotes(opts, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-notes-'));
  try {
    return await fn(new NoteStore({ file: path.join(dir, 'notes.json'), ...opts }), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('notatka jest jedną linią bez zbędnych spacji', () => {
  assert.equal(normalizeNote('  Kolos  '), 'Kolos');
  assert.equal(normalizeNote('Egzamin\n\tpoprawkowy'), 'Egzamin poprawkowy');
  assert.equal(normalizeNote(null), '');
  assert.equal(normalizeNote(undefined), '');
  // Emoji liczy się jako jeden znak — inaczej limit 15 ucinałby je w połowie.
  assert.equal(noteLength('0123456789abcde'), 15);
  assert.equal(noteLength('Zażółć gęślą jaźń'), 17);
  assert.equal(noteLength('📝'), 1);
  assert.equal(MAX_LENGTH, 15);
});

testAsync('zapisuje notatkę, widzi ją każdy i przeżywa restart', async () => {
  await withNotes({}, async (store) => {
    await store.load();
    const saved = await store.set(NOTE_CLASS, 'Kolos');
    assert.deepEqual(saved, { classId: NOTE_CLASS, text: 'Kolos' });
    assert.equal(store.snapshot()[NOTE_CLASS], 'Kolos');

    await store.set(NOTE_CLASS_2, 'Egzamin');
    assert.deepEqual(Object.keys(store.snapshot()).sort(), [NOTE_CLASS, NOTE_CLASS_2].sort());

    // Nowa instancja czyta ten sam plik — notatki nie giną przy restarcie.
    const again = new NoteStore({ file: store.file });
    await again.load();
    assert.deepEqual(again.snapshot(), store.snapshot());
  });
});

testAsync('pusta treść usuwa notatkę, a limit 15 znaków jest twardy', async () => {
  await withNotes({}, async (store) => {
    await store.load();
    await store.set(NOTE_CLASS, 'Kolos');
    const cleared = await store.set(NOTE_CLASS, '   ');
    assert.equal(cleared.text, '');
    assert.equal(store.snapshot()[NOTE_CLASS], undefined);

    await assert.rejects(
      () => store.set(NOTE_CLASS, 'Szesnaście znaków'),
      (err) => err.status === 400,
    );
    // Dokładnie 15 znaków przechodzi.
    const fifteen = '123456789012345';
    await store.set(NOTE_CLASS, fifteen);
    assert.equal(store.snapshot()[NOTE_CLASS], fifteen);
  });
});

testAsync('odrzuca identyfikator, który nie jest zajęciami z planu', async () => {
  await withNotes({}, async (store) => {
    await store.load();
    for (const bad of ['', 'kolos', '../../etc/passwd', `${NOTE_CLASS}\nX`]) {
      await assert.rejects(
        () => store.set(bad, 'Kolos'),
        (err) => err.status === 400,
        `powinno odrzucić: ${bad}`,
      );
    }
  });
});

testAsync('równoległe zapisy nie gubią notatek', async () => {
  await withNotes({}, async (store) => {
    await store.load();
    const ids = Array.from({ length: 10 }, (_, i) => `2026-11-${String(i + 10).padStart(2, '0')}|09:00|10:30|74835|Wyk|21188`);
    await Promise.all(ids.map((id, i) => store.set(id, `N${i}`)));
    const again = new NoteStore({ file: store.file });
    await again.load();
    for (let i = 0; i < ids.length; i += 1) {
      assert.equal(again.snapshot()[ids[i]], `N${i}`);
    }
  });
});

testAsync('stare notatki są przycinane, przyszłe zostają', async () => {
  await withNotes({ keepDays: 60 }, async (store) => {
    await store.load();
    const old = '2026-05-04|09:00|10:30|74835|Wyk|21188';
    const future = '2027-01-08|09:00|10:30|74835|Wyk|21188';
    await store.set(old, 'Stare');
    await store.set(future, 'Nowe');
    store.prune(new Date('2026-11-16T12:00:00Z'));
    const kept = store.snapshot();
    assert.equal(kept[old], undefined, 'notatka sprzed 60 dni musi zniknąć');
    assert.equal(kept[future], 'Nowe');
  });
});

testAsync('uszkodzony plik nie wywala notatek', async () => {
  await withNotes({}, async (store) => {
    fs.writeFileSync(store.file, '{ to nie jest JSON');
    await store.load();
    assert.deepEqual(store.snapshot(), {});
    await store.set(NOTE_CLASS, 'Kolos');
    assert.equal(store.snapshot()[NOTE_CLASS], 'Kolos');
  });
});

test('notatka jest na kafelku i w szczegółach, w kolorze motywu', () => {
  const app = readRepo('public', 'app.js');
  const css = readRepo('public', 'native.css');
  const index = readRepo('public', 'index.html');

  // Kafelek dnia rysuje plakietkę; początek linii metadanych zostaje bez zmian.
  assert.match(app, /function noteBadge\(/);
  assert.match(app, /class="class-card\$\{ongoing \? ' is-ongoing' : ''\}\$\{badge \? ' has-note' : ''\}"/);
  assert.match(app, /\$\{badge\}/);
  // Edytor w szczegółach zajęć: limit, chipy i usuwanie.
  assert.match(app, /const NOTE_MAX = 15;/);
  assert.match(app, /id="noteInput"/);
  assert.match(app, /data-note-chip="Kolos"/);
  assert.match(app, /data-note-chip="Egzamin"/);
  assert.match(app, /data-note-clear/);
  assert.match(app, /getJson\('\/api\/notes'/);
  // Notatka jest wspólna — nie może siedzieć tylko w localStorage.
  assert.ok(!/localStorage[^\n]*notes/i.test(app), 'notatki muszą przychodzić z serwera');
  // Wygląd „szklany” (APK 1.12): przezroczyste podbarwienie akcentem, cienka
  // krawędź i tekst w kolorze akcentu — zamiast litego wypełnienia akcentem.
  assert.match(css, /\.note-badge\s*\{[^}]*max-width: 35%/);
  assert.match(css, /\.note-badge\s*\{[^}]*linear-gradient\(168deg/);
  assert.match(css, /\.note-badge\s*\{[^}]*rgba\(var\(--accent-rgb\), 0\.30\)/);
  assert.match(css, /\.note-badge\s*\{[^}]*rgba\(var\(--accent-rgb\), 0\.10\)/);
  assert.match(css, /\.note-badge\s*\{[^}]*box-shadow: inset 0 0 0 1px rgba\(var\(--accent-rgb\), 0\.45\)/);
  assert.match(css, /\.note-badge\s*\{[^}]*color: var\(--accent\)/);
  assert.ok(
    !/\.note-badge\s*\{[^}]*background: var\(--accent\)/.test(css),
    'plakietka nie może wracać do litego wypełnienia akcentem',
  );
  assert.match(app, /function fitNotes\(/);
  assert.match(app, /NOTE_FIT = \{ max: 20, min: 9 \}/);
  // Ścięty lewy brzeg (APK 1.10): ukośna krawędź liczona z wysokości karty.
  assert.match(css, /\.note-badge\s*\{[^}]*clip-path: polygon\(100% 0, 100% 100%, 0 100%, var\(--note-slant\) 0\)/);
  assert.ok(!/\.note-badge\s*\{[^}]*border-radius/.test(css), 'plakietka nie może wracać do łuku');
  assert.match(app, /const NOTE_SLANT = 0\.6;/);
  assert.match(app, /setProperty\('--note-slant'/);
  // Powłoka musi pobrać nowy arkusz i skrypt, inaczej notatki się nie pojawią.
  assert.match(index, /native\.css\?v=/);
  assert.match(index, /app\.js\?v=/);
});

console.log('\nLicznik wejść:');
testAsync('zlicza wejścia web i PWA oraz przeżywa restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-visits-'));
  const file = path.join(dir, 'visits.json');
  try {
    const counter = new VisitCounter({ file });
    await counter.load();
    await counter.record('web');
    await counter.record('pwa');
    await counter.record('pwa');
    await counter.record('nieznane'); // nieznane źródło liczymy jako web

    const snap = counter.snapshot();
    assert.equal(snap.total, 4);
    assert.equal(snap.web, 2);
    assert.equal(snap.pwa, 2);
    assert.ok(snap.firstAt);
    assert.ok(snap.lastAt);

    // Nowa instancja czyta ten sam plik — licznik przeżywa restart.
    const again = new VisitCounter({ file });
    await again.load();
    assert.deepEqual(again.snapshot(), snap);

    // Równoległe wejścia nie mogą zgubić ani jednego zliczenia.
    await Promise.all(Array.from({ length: 12 }, (_, i) => counter.record(i % 2 ? 'pwa' : 'web')));
    const reloaded = new VisitCounter({ file });
    await reloaded.load();
    const final = reloaded.snapshot();
    assert.equal(final.total, 16);
    assert.equal(final.web + final.pwa, 16);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

testAsync('uszkodzony plik nie wywala licznika', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-visits-'));
  const file = path.join(dir, 'visits.json');
  try {
    fs.writeFileSync(file, '{ to nie jest JSON');
    const counter = new VisitCounter({ file });
    await counter.load();
    assert.equal(counter.snapshot().total, 0);
    await counter.record('web');
    assert.equal(counter.snapshot().total, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('strona licznika pokazuje sumę, podział i odświeżanie', () => {
  const html = renderVisitsPage({
    total: 1234,
    web: 1000,
    pwa: 234,
    firstAt: '2026-11-08T10:00:00.000Z',
    lastAt: '2026-11-08T11:00:00.000Z',
  }, { appUrl: 'https://plany.mati-it.pl/' });

  assert.ok(html.includes(`class="total">${formatNumber(1234)}<`), 'brak sumy wejść');
  assert.match(html, /Przeglądarka/);
  assert.match(html, /PWA/);
  assert.match(html, /https:\/\/plany\.mati-it\.pl\//);
  assert.match(html, /http-equiv="refresh"/);
});

// --- rozbicie czasowe: dni, godziny, dni tygodnia --------------------------

testAsync('licznik rozbija wejścia na dni i godziny w czasie warszawskim', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-visits-'));
  const file = path.join(dir, 'visits.json');
  try {
    const counter = new VisitCounter({ file });
    await counter.load();
    // 23:30 UTC to już następny dzień w Warszawie (00:30).
    await counter.record('web', new Date('2026-11-16T23:30:00.000Z'));
    // 22:30 UTC to 23:30 tego samego dnia w Warszawie.
    await counter.record('apk', new Date('2026-11-16T22:30:00.000Z'));
    await counter.record('pwa', new Date('2026-11-17T09:15:00.000Z'));

    const snap = counter.snapshot();
    assert.equal(snap.total, 3);
    assert.equal(snap.web, 1);
    assert.equal(snap.apk, 1);
    assert.deepEqual(Object.keys(snap.days).sort(), ['2026-11-16', '2026-11-17']);
    assert.deepEqual(snap.days['2026-11-16'], { web: 0, pwa: 0, apk: 1 });
    assert.deepEqual(snap.days['2026-11-17'], { web: 1, pwa: 1, apk: 0 });
    assert.equal(snap.hours[23].apk, 1, '22:30 UTC = 23:00 czasu warszawskiego');
    assert.equal(snap.hours[0].web, 1, '23:30 UTC = 00:00 następnego dnia');
    assert.equal(snap.hours[10].pwa, 1);
    assert.equal(snap.since, '2026-11-16T23:30:00.000Z', 'rozbicie startuje od pierwszego wejścia');

    // Rozbicie przeżywa restart razem z sumami.
    const again = new VisitCounter({ file });
    await again.load();
    assert.deepEqual(again.snapshot().days, snap.days);
    assert.deepEqual(again.snapshot().hours, snap.hours);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, 2);

    // Kopia w snaphocie nie może zmienić stanu licznika.
    const mutated = counter.snapshot();
    mutated.days['2026-11-17'].web = 999;
    assert.equal(counter.snapshot().days['2026-11-17'].web, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

testAsync('stary plik licznika (bez rozbicia) wczytuje się bez błędu', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-visits-'));
  const file = path.join(dir, 'visits.json');
  try {
    fs.writeFileSync(file, JSON.stringify({
      version: 1,
      total: 127,
      web: 79,
      pwa: 16,
      apk: 32,
      firstAt: '2026-11-10T18:56:09.835Z',
      lastAt: '2026-11-16T20:10:11.012Z',
      updatedAt: '2026-11-16T20:10:11.012Z',
    }));
    const counter = new VisitCounter({ file });
    await counter.load();
    const snap = counter.snapshot();
    assert.equal(snap.total, 127);
    assert.equal(snap.apk, 32);
    assert.equal(snap.since, null, 'stary plik nie zna początku rozbicia');
    assert.deepEqual(snap.days, {});
    assert.deepEqual(snap.hours, {});
    // Strona mówi wprost, że rozbicie liczy się od teraz.
    assert.match(renderVisitsPage(snap), /Zbieram od teraz/);
    // Pierwsze nowe wejście zakłada rozbicie.
    await counter.record('web', new Date('2026-11-17T10:00:00.000Z'));
    const after = counter.snapshot();
    assert.equal(after.total, 128);
    assert.deepEqual(Object.keys(after.days), ['2026-11-17']);
    assert.equal(after.hours[11].web, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

testAsync('rozbicie dzienne trzyma tylko ostatnie 180 dni', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-visits-'));
  const file = path.join(dir, 'visits.json');
  try {
    const counter = new VisitCounter({ file });
    await counter.load();
    const start = Date.parse('2026-01-01T12:00:00.000Z');
    for (let day = 0; day < KEEP_DAYS + 5; day += 1) {
      await counter.record('web', new Date(start + day * 86400000));
    }
    const snap = counter.snapshot();
    assert.equal(snap.total, KEEP_DAYS + 5, 'suma liczy wszystkie wejścia');
    assert.equal(Object.keys(snap.days).length, KEEP_DAYS, 'dzienne rozbicie jest przycinane');
    assert.ok(!('2026-01-01' in snap.days), 'najstarsze dni wypadają');
    assert.equal(snap.days['2026-06-30'].web, 1, 'najnowszy dzień zostaje');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('strona licznika pokazuje dni, godziny i dni tygodnia', () => {
  const html = renderVisitsPage({
    total: 10,
    web: 6,
    pwa: 2,
    apk: 2,
    firstAt: '2026-11-14T10:00:00.000Z',
    lastAt: '2026-11-17T10:00:00.000Z',
    since: '2026-11-14T10:00:00.000Z',
    days: {
      '2026-11-16': { web: 3, pwa: 1, apk: 1 },
      '2026-11-17': { web: 3, pwa: 1, apk: 1 },
    },
    hours: { 10: { web: 4, pwa: 1, apk: 1 }, 23: { web: 2, pwa: 1, apk: 1 } },
  }, { appUrl: 'https://ideis.mati-it.pl/', now: new Date('2026-11-17T12:00:00.000Z') });

  assert.match(html, /Ostatnie 14 dni/);
  assert.equal((html.match(/class="row[ "]/g) || []).length, 21, '14 dni + 7 dni tygodnia');
  // Dni sprzed `since` są oznaczone jako „nie wiadomo”, nie jako zero.
  assert.equal((html.match(/class="row is-unknown"/g) || []).length, 10, '10 dni przed since');
  assert.match(html, /„—” to dni sprzed/);
  assert.equal((html.match(/class="hour( |")/g) || []).length, 24, 'słupki wszystkich godzin');
  assert.match(html, /poniedziałek/);
  assert.match(html, /niedziela/);
  assert.match(html, /Najruchliwsza godzina<\/dt><dd>10:00/);
  assert.match(html, /Najruchliwszy dzień/);
  assert.match(html, /class="seg seg-web"/);
  assert.match(html, /class="seg seg-apk"/);
  assert.ok(!/<script/i.test(html), 'strona licznika nie ładuje skryptów');
  assert.ok(!/\.js["']/.test(html), 'zero zewnętrznych plików JS');
});


console.log('\nWydania aplikacji Android:');
test('manifest wydania przechodzi walidację i ma komplet pól', () => {
  const release = normalizeRelease({
    app: 'pl.matiit.planzajec.ideis',
    versionCode: 3,
    versionName: '1.2',
    apkFile: 'planzajec-ideis-1.2-3.apk',
    sha256: 'a'.repeat(64),
    sizeBytes: 2_500_000,
  }, { appId: 'pl.matiit.planzajec.ideis' });

  assert.equal(release.versionCode, 3);
  assert.equal(release.apkUrl, `/api/app/download/${encodeURIComponent('planzajec-ideis-1.2-3.apk')}`);
  assert.equal(release.minSupportedVersionCode, 0);
});

test('manifest innej aplikacji jest odrzucany (dwa kanały się nie mieszają)', () => {
  assert.throws(() => normalizeRelease({
    app: 'pl.matiit.planzajec',
    versionCode: 19,
    versionName: '1.17',
    apkFile: 'planzajec-1.17-19.apk',
    sha256: 'b'.repeat(64),
    sizeBytes: 2_500_000,
  }, { appId: 'pl.matiit.planzajec.ideis' }), /innej aplikacji/);
});

test('zły manifest nie ogłasza wydania (brak APK, zły hash, zły adres)', () => {
  const base = {
    app: 'pl.matiit.planzajec.ideis',
    versionCode: 1,
    versionName: '1.0',
    apkFile: 'a.apk',
    sha256: 'c'.repeat(64),
    sizeBytes: 1,
  };
  assert.throws(() => normalizeRelease({ ...base, apkFile: 'katalog/a.apk' }));
  assert.throws(() => normalizeRelease({ ...base, sha256: 'nie-hash' }));
  assert.throws(() => normalizeRelease({ ...base, apkUrl: 'javascript:alert(1)' }));
  assert.throws(() => normalizeRelease({ ...base, versionCode: 0 }));
});

test('Range: pełny plik, wycinek, koniec pliku i zakres niemożliwy', () => {
  assert.equal(parseRange(undefined, 100), null);
  assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.equal(parseRange('bytes=200-300', 100), 'invalid');
  assert.equal(parseRange('bytes=abc', 100), null);
});

testAsync('ReleaseStore czyta manifest z dysku i pilnuje nazw plików', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-releases-'));
  try {
    const store = new ReleaseStore({ dir, appId: 'pl.matiit.planzajec.ideis' });
    assert.equal(await store.latest(), null, 'brak manifestu = brak wydania');

    fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({
      app: 'pl.matiit.planzajec.ideis',
      versionCode: 4,
      versionName: '1.3',
      apkFile: 'planzajec-ideis-1.3-4.apk',
      sha256: 'd'.repeat(64),
      sizeBytes: 4,
    }));
    fs.writeFileSync(path.join(dir, 'planzajec-ideis-1.3-4.apk'), 'APK!');

    const release = await store.latest();
    assert.equal(release.versionCode, 4);

    const file = await store.apk(release.apkFile);
    assert.equal(file.size, 4);
    // Ścieżki i obce rozszerzenia nie wychodzą z katalogu wydań.
    assert.equal(await store.apk('../latest.json'), null);
    assert.equal(await store.apk('latest.json'), null);
    assert.equal(await store.apk('nie-ma.apk'), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

testAsync('uszkodzony manifest to błąd publikacji, nie brak wydania', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-releases-'));
  try {
    const store = new ReleaseStore({ dir, appId: 'pl.matiit.planzajec.ideis' });
    fs.writeFileSync(path.join(dir, 'latest.json'), '{ to nie jest JSON');
    await assert.rejects(() => store.latest(), /nieprawidłowy/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('strona aplikacji prowadzi do stałego adresu APK', () => {
  // Nowy interfejs nie ma stopki z linkiem — pobieranie APK jest w Opcjach →
  // „Aplikacja Android”, pod stałym adresem `/api/app/apk`.
  const app = readRepo('public', 'app.js');
  assert.match(app, /href="\/api\/app\/apk"/);
  assert.match(app, /fetch\('\/api\/app\/latest'/);
});

console.log('\nInterfejs nowej aplikacji (port widoku z APK):');
test('katalog stylów ma wszystkie 20 pozycji z natywnej aplikacji', () => {
  const styles = readRepo('public', 'styles.js');
  for (const id of [
    'lg1-dark', 'lg1-light', 'lg2-dark', 'lg2-light', 'lg3-dark', 'lg3-light',
    'visionos-dark', 'visionos-light', 'visionos-perf-dark', 'visionos-perf-light',
    'apple', 'light', 'dark',
    'violet-dark', 'violet-light', 'pink-dark', 'pink-light', 'mix-dark', 'mix-light',
  ]) {
    assert.ok(styles.includes(`id: '${id}'`), `brak stylu ${id}`);
  }
  assert.ok(styles.includes("DEFAULT_STYLE = 'lg2-dark'"), 'domyślny styl to Liquid Glass 2 ciemny');
});

/**
 * Anti-drift: lista stylów w webie musi być 1:1 z `StyleCatalog.kt`.
 * Rozjazd (np. motyw dodany tylko w APK) łapie się tutaj, a nie w Opcjach.
 */
test('style w webie zgadzają się z StyleCatalog.kt (id, podpis, grupa, jasność)', () => {
  const kotlin = fs.readFileSync(path.join(
    __dirname, '..', 'android', 'app', 'src', 'main', 'java', 'pl', 'matiit', 'planzajec', 'ui', 'theme', 'StyleCatalog.kt',
  ), 'utf8');
  const groups = {
    LIQUID_GLASS: 'lg', VISION_OS: 'visionos', CLASSIC: 'classic', KOLOROWE: 'color', WLASNY: 'custom',
  };
  const kotlinStyles = [...kotlin.matchAll(
    /StyleDef\("([a-z0-9-]+)", "([^"]+)", "([^"]+)", StyleGroup\.(\w+), (true|false)\)/g,
  )].map((m) => ({
    id: m[1], label: m[2], hint: m[3], group: groups[m[4]], dark: m[5] === 'true',
  }));
  assert.equal(kotlinStyles.length, 21, 'StyleCatalog.kt powinien mieć 21 pozycji');

  const web = loadPlanStyles();
  assert.deepEqual(web.STYLES.map((s) => s.id), kotlinStyles.map((s) => s.id), 'kolejność i id stylów');
  for (const k of kotlinStyles) {
    const w = web.STYLES.find((s) => s.id === k.id);
    assert.deepEqual(
      { label: w.label, hint: w.hint, group: w.group },
      { label: k.label, hint: k.hint, group: k.group },
      `opis stylu ${k.id}`,
    );
    const pal = web.PALETTES[k.id];
    // „Auto” rozwiązuje się do `dark`/`light`, a „Własny” liczy paletę z kolorów
    // użytkownika (`customPalette`) — żaden z nich nie ma stałego wpisu.
    if (k.id === 'auto' || k.id === 'custom') {
      assert.equal(pal, undefined, `${k.id} nie może mieć stałej palety`);
      continue;
    }
    assert.ok(pal, `brak palety ${k.id} w webie`);
    assert.equal(pal.dark, k.dark, `jasność palety ${k.id}`);
    assert.ok(/^[0-9A-F]{8}$/.test(pal.page), `page ${k.id} musi być ARGB`);
    assert.ok(pal.gradient.length >= 2, `gradient ${k.id}`);
    for (const blob of pal.blobs) {
      assert.ok(/^[0-9A-F]{8}$/.test(blob.c), `kolor plamy ${k.id}`);
    }
  }
  // Każda grupa z katalogu musi mieć etykietę w arkuszu Opcji.
  const webGroups = web.STYLES.map((s) => s.group);
  for (const key of new Set(webGroups)) {
    assert.ok(web.STYLE_GROUPS.some((g) => g.key === key), `brak grupy ${key} w STYLE_GROUPS`);
  }
});

/**
 * Motyw „Własny”: paleta liczona z dwóch kolorów. Test pilnuje reguł, które
 * muszą być **identyczne w Kotlinie** (`CustomTheme.kt`) — czytelności tekstu,
 * tonacji z tła i dociągania akcentu do kontrastu.
 */
test('motyw własny liczy paletę z dwóch kolorów według reguł z CustomTheme.kt', () => {
  const web = loadPlanStyles();
  assert.deepEqual(web.CUSTOM_DEFAULT, { primary: '#7C5CFF', background: '#0C0A18' });

  // Ciemne tło → ciemna tonacja i jasny tekst.
  const dark = web.customPalette('#7C5CFF', '#0C0A18');
  assert.equal(dark.id, 'custom');
  assert.equal(dark.dark, true);
  assert.ok(dark.text.endsWith('F2F5FF'), `tekst na ciemnym tle: ${dark.text}`);
  assert.equal(dark.page, 'FF0C0A18', 'tło strony to kolor użytkownika');
  assert.equal(dark.radius, 26);
  assert.ok(dark.blobs.length === 2 && dark.blobs.every((b) => /^FF[0-9A-F]{6}$/.test(b.c)));

  // Jasne tło → jasna tonacja i ciemny tekst (bez białego tekstu na bieli).
  const light = web.customPalette('#7C5CFF', '#F7F7FB');
  assert.equal(light.dark, false);
  assert.ok(light.text.endsWith('12141B'), `tekst na jasnym tle: ${light.text}`);

  // Akcent zawsze czytelny na tle strony: kontrast WCAG ≥ 4,0 (tolerancja 0,1).
  const channelLuminance = (c) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const contrastOf = (argbA, argbB) => {
    const lum = (argb) => {
      const v = Number.parseInt(argb.slice(2), 16);
      return 0.2126 * channelLuminance((v >> 16) & 0xFF)
        + 0.7152 * channelLuminance((v >> 8) & 0xFF)
        + 0.0722 * channelLuminance(v & 0xFF);
    };
    const la = lum(argbA);
    const lb = lum(argbB);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  for (const palette of [dark, light]) {
    const ratio = contrastOf(palette.accent, palette.page);
    assert.ok(
      ratio >= 3.9,
      `kontrast akcentu ${palette.accent} na tle ${palette.page} = ${ratio.toFixed(2)}`,
    );
  }

  // Kolejność argumentów nie może wpływać na wynik — tylko wartości.
  assert.deepEqual(web.customPalette('#7c5cff', '#0c0a18'), dark, 'zapis małymi literami');
  // Śmieci wracają do pary domyślnej (nie wysypują motywu).
  assert.deepEqual(web.normalizeCustom('nie-kolor', null), {
    primary: web.CUSTOM_DEFAULT.primary,
    background: web.CUSTOM_DEFAULT.background,
  });
  assert.equal(web.normalizeCustomHex('#abc'), '#AABBCC', 'skrót 3 znaków');
  // Stałe reguł muszą istnieć w obu implementacjach.
  const kotlin = fs.readFileSync(path.join(
    __dirname, '..', 'android', 'app', 'src', 'main', 'java', 'pl', 'matiit', 'planzajec', 'ui', 'theme', 'CustomTheme.kt',
  ), 'utf8');
  for (const [kotlinName, value] of [
    ['DARK_LUMINANCE', '0.179'],
    ['ACCENT_CONTRAST_TARGET', '4.0'],
    ['ACCENT_STEP', '0.14'],
    ['MAX_ACCENT_STEPS', '10'],
  ]) {
    assert.ok(kotlin.includes(`const val ${kotlinName} = ${value}`), `CustomTheme.kt: brak ${kotlinName}`);
  }
  assert.match(readRepo('public', 'theme-boot.js'), /luminance\(customBg\) < 0\.179/,
    'bootstrap musi wybrać tonację motywu własnego tym samym progiem');
  // Próg dobrany tak, żeby jasny fiolet nie dostawał białego tekstu.
  const midTone = web.customPalette('#7F6AFF', '#7F6AFF');
  assert.equal(midTone.dark, false, 'jasny fiolet to motyw jasny');
  assert.ok(midTone.text.endsWith('12141B'), 'jasny fiolet → ciemny tekst');
});

test('Opcje → Wygląd mają wybór dwóch kolorów motywu własnego', () => {
  const app = readRepo('public', 'app.js');
  const css = readRepo('public', 'native.css');

  assert.match(app, /function settingsCustomHtml\(/);
  assert.match(app, /row\('customPrimary', 'customPrimaryHex'/);
  assert.match(app, /row\('customBackground', 'customBackgroundHex'/);
  assert.match(app, /type="color"/);
  assert.match(app, /function bindCustomColors\(/);
  assert.match(app, /writePrefs\(\{\s*\n?\s*customPrimary/);
  assert.match(app, /function paletteOf\(/);
  assert.match(app, /customPalette\(state\.custom\.primary, state\.custom\.background\)/);
  // Strona „Wygląd” musi podpinać słuchacze po każdym renderze (arkusz
  // rysuje się od nowa, więc delegacja kliknięć nie wystarczy).
  assert.match(app, /if \(page === 'look'\) bindCustomColors\(body\)/);
  assert.match(css, /\.settings-color-input/);
  assert.match(css, /\.settings-color-swatch/);
  // Widżety: ten sam wybór trafia do odcisku, więc zmiana koloru je przerysowuje.
  const theme = readRepo('android', 'app', 'src', 'main', 'java', 'pl', 'matiit', 'planzajec', 'widget', 'WidgetTheme.kt');
  assert.match(theme, /custom\.fingerprint\(\)/);
});

test('widżety pokazują notatki z kafelka (obie kopie i podgląd)', () => {
  const row = readRepo('android', 'app', 'src', 'main', 'java', 'pl', 'matiit', 'planzajec', 'widget', 'WidgetModel.kt');
  const look = readRepo('android', 'app', 'src', 'main', 'java', 'pl', 'matiit', 'planzajec', 'widget', 'WidgetLookView.kt');
  const updater = readRepo('android', 'app', 'src', 'main', 'java', 'pl', 'matiit', 'planzajec', 'widget', 'WidgetUpdater.kt');
  const notes = readRepo('android', 'app', 'src', 'main', 'java', 'pl', 'matiit', 'planzajec', 'data', 'NotesRepository.kt');

  // Model: notatka w wierszu i w odcisku treści (inaczej widżet się nie odświeży).
  assert.match(row, /val note: String\? = null/);
  assert.match(row, /notes: Map<String, String> = emptyMap\(\)/);
  assert.match(row, /\$\{note\.orEmpty\(\)\}/);
  // Każdy z siedmiu wariantów rysuje plakietkę.
  assert.equal((look.match(/RowNote\(row, colors/g) || []).length, 7, 'siedem wariantów wiersza');
  assert.match(look, /fun WidgetNoteChip\(/);
  // Notatki dla widżetu idą z kopii na dysku (bez sieci).
  assert.match(updater, /PlanGraph\.notes\(app\)\.cached\(\)/);
  assert.match(updater, /notes = notes/);
  assert.match(notes, /fun cached\(\): Map<String, String> = store\.read\(\)/);
});

test('plan zmienia się tylko z Opcji — bez skrótu w nagłówku', () => {
  // Nagłówek ma tylko „Odśwież”. Wybór planu jest w Opcjach → Plan →
  // „Wybór planu”, więc skrót „Plan” w prawym górnym rogu zniknął (APK 1.8).
  const html = readRepo('public', 'index.html');
  assert.ok(!html.includes('btnGroup'), 'nagłówek nie może mieć przycisku „Plan”');
  assert.match(html, /id="btnRefresh"/, 'odświeżanie zostaje w nagłówku');
  const app = readRepo('public', 'app.js');
  assert.ok(!app.includes("$('btnGroup')"), 'nie może zostać nasłuch usuniętego przycisku');
});

test('bootstrap HTML ustawia styl przed pierwszym malowaniem', () => {
  const html = readRepo('public', 'index.html');
  // Bootstrap jest osobnym plikiem (CSP nie dopuszcza inline <script>), ale
  // nadal musi być w <head> PRZED arkuszem — inaczej zimny start mignie tłem.
  assert.match(html, /<script src="\/theme-boot\.js\?v=\d+"><\/script>/);
  assert.ok(html.indexOf('theme-boot.js') < html.indexOf('native.css'),
    'bootstrap musi ładować się przed arkuszem');
  const boot = readRepo('public', 'theme-boot.js');
  assert.match(boot, /'visionos-perf-dark': '#05070d'/);
  assert.match(boot, /'mix-light': '#f6eefb'/, 'kolor nowego motywu w bootstrapie');
  assert.match(boot, /root\.dataset\.style = picked/);
  // Palety i warianty liczy app.js z /styles.js — arkusz nie ma już motywów 1:1.
  assert.ok(!html.includes('/styles.css'), 'stary arkusz nie może wracać');

  // Kolor tła z bootstrapu musi być tłem palety, inaczej przy starcie mignie inny motyw.
  const web = loadPlanStyles();
  const inline = Object.fromEntries([...boot.matchAll(/'([a-z0-9-]+)': '#([0-9a-f]{6})'/g)]
    .map((m) => [m[1], m[2].toUpperCase()]));
  for (const [id, pal] of Object.entries(web.PALETTES)) {
    assert.equal(inline[id], pal.page.slice(2), `bootstrap: tło ${id} musi być równe page palety`);
  }
  assert.equal(inline.auto, undefined, 'auto nie ma własnego tła w bootstrapie');
  for (const [id, pal] of Object.entries(web.PALETTES)) {
    if (pal.dark === false) {
      assert.ok(boot.includes(`'${id}': false`), `bootstrap: ${id} musi być od razu jasny`);
    }
  }
});

test('arkusz nowej powłoki nie używa backdrop-filter (jak APK)', () => {
  const css = readRepo('public', 'native.css');
  assert.equal(/backdrop-filter:\s*(?!none)/.test(css), false, 'blur nie jest częścią nowej powłoki');
  assert.match(css, /\.aurora/, 'brak tła aurora');
  assert.match(css, /\.picker-card/, 'brak stylów pickera wymiarów');
});

test('wybór planu jest w ekranie powitalnym i w Opcjach → Wybór planu', () => {
  const html = readRepo('public', 'index.html');
  const app = readRepo('public', 'app.js');
  assert.match(html, /id="welcomePicker"/);
  assert.match(html, /<script src="\/selection\.js/);
  assert.match(html, /<script src="\/wizard\.js/);
  // Jeden ekran wyboru: rocznik → kierunek → specjalność („Pomiń
  // specjalność”) → tryb, rysowany w obu miejscach tą samą funkcją.
  assert.match(app, /function pickerHtml\(/);
  assert.match(app, /data-wiz-skip-spec/);
  assert.match(app, /data-wiz-nabor/);
  assert.match(app, /data-wiz-tryb/);
  assert.equal((app.match(/\$\{pickerHtml\(\)\}/g) || []).length >= 1, true);
  assert.match(app, /paintPicker\(\$\('welcomePicker'\)\)/);
  // API planu musi nieść rok akademicki i listę grup (plan scalony).
  assert.match(app, /function apiUrl\(path\)/);
  assert.match(app, /groups=\$\{state\.planGroups/);
  assert.match(app, /ay=\$\{encodeURIComponent\(state\.ay\)\}/);
});

test('specjalność z formularza uczelni trafia w wartość katalogu', () => {
  const ideis = require('../server/ideis-selection');
  assert.equal(ideis.matchValue('Inżynier aplikacji i systemów chmurowych', ['IAiSC', 'Inżynier aplikacji i systemów chmurowych']), 'Inżynier aplikacji i systemów chmurowych');
  assert.equal(ideis.matchValue('Programista Gier Komputerowych', ['Programowanie gier komputerowych', 'Programista gier komputerowych']), 'Programista gier komputerowych');
  // Skrótowiec: „Kryminologia z kryminalistyką (BW)” ↔ „KzK”.
  assert.equal(ideis.matchValue('Kryminologia z kryminalistyką (BW)', ['KzK']), 'KzK');
  // Dopisek w nawiasie nie przeszkadza w dopasowaniu dokładnym.
  assert.equal(ideis.matchValue('Marketing i social media (ZARZ)', ['Marketing i social media']), 'Marketing i social media');
  // „Erasmus+ Creative Media” to początek dłuższej nazwy grupy.
  assert.equal(ideis.matchValue('Erasmus+ Creative Media', ['Erasmus+ Creative Media Wyk S']), 'Erasmus+ Creative Media Wyk S');
  assert.equal(ideis.matchValue('Syracuse', ['Coś innego']), null);
});

test('lista specjalności łączy ofertę uczelni z wartościami katalogu', () => {
  const ideis = require('../server/ideis-selection');
  const groups = [
    { id: '1', field: 'Informatyka', specialty: 'IAiSC' },
    { id: '2', field: 'Informatyka', specialty: 'IAiSC' },
    { id: '3', field: 'Informatyka', specialty: 'Programista gier komputerowych' },
    { id: '5', field: 'Informatyka', specialty: 'Dawna specjalność' },
    { id: '4', field: 'Prawo', specialty: 'Prawo karne' },
  ];
  const items = ideis.specjalnosciFor(groups, 'Informatyka', [
    { id: '10', label: 'Inżynier aplikacji i systemów chmurowych' },
    { id: '11', label: 'Programista Gier Komputerowych' },
  ]);
  assert.equal(items[0].value, 'IAiSC');
  assert.equal(items[0].groups, 2);
  assert.equal(items[1].value, 'Programista gier komputerowych');
  // Wartości tylko z katalogu (starsze nazwy) też są dostępne.
  assert.ok(items.some((item) => item.source === 'catalog' && item.value === 'Dawna specjalność'), 'brak wpisu z katalogu');
});

test('parser formularza uczelni czyta pary value/text', () => {
  const combos = require('../server/ideis-combos');
  const html = "<script>ASPx.createControl({itemsInfo:[{'value':'','text':''},{'value':'2333','text':'Informatyka'},{'value':'740','text':'Administracja'}]});</script>";
  assert.deepEqual(combos.parseItemsInfo(html), [
    { id: '2333', label: 'Informatyka' },
    { id: '740', label: 'Administracja' },
  ]);
  assert.equal(combos.parseItemsInfo('<div>brak</div>').length, 0);
});

// ---------------------------------------------- kreator, plany, licznik, zgłoszenia
test('semestr liczy się z naboru i bieżącej daty', () => {
  const W = require('../public/wizard');
  assert.deepEqual(W.semesterFor(2026, '2024', new Date('2026-11-15T12:00:00Z')),
    { year: 3, sem: 5, season: 'winter' });
  assert.deepEqual(W.semesterFor(2026, '2024', new Date('2027-04-10T12:00:00Z')),
    { year: 3, sem: 6, season: 'summer' });
  assert.equal(W.semesterFor(2026, '2030'), null);
  const sel = W.withSemester({ nabor: '2025' }, 2026, new Date('2026-11-15T12:00:00Z'));
  assert.equal(sel.year, '2');
  assert.equal(sel.sem, '3');
  // Bez naboru nie ma czego liczyć — pola zostają puste, filtr ich nie używa.
  assert.equal(W.withSemester({ nabor: '' }, 2026).sem, '');
});

test('semestr w wyborze zawęża grupy (a bez niego nie filtruje)', () => {
  const groups = [
    { id: '1', f: 'Informatyka', b: [2024], y: 2, sem: 3, d: '1st', m: 'N', s: null, k: 'Wyk' },
    { id: '2', f: 'Informatyka', b: [2024], y: 2, sem: 4, d: '1st', m: 'N', s: null, k: 'Wyk' },
  ];
  const sel = { nabor: '2024', field: 'Informatyka', spec: '', year: '2', degree: '1st', mode: 'N', sem: '3' };
  assert.deepEqual(selection.filter(groups, sel).map((g) => g.id), ['1']);
  assert.equal(selection.filter(groups, { ...sel, sem: '' }).length, 2);
});

test('plan bazowy to grupa wykładowa, a do dodania są tylko nie-wykłady', () => {
  const W = require('../public/wizard');
  const groups = [
    { id: '1', f: 'Informatyka', k: 'Wyk', y: 2, sem: 3, b: [2024], d: '1st', m: 'N' },
    { id: '2', f: 'Informatyka', k: 'Ćw', num: '2', y: 2, sem: 3, b: [2024], d: '1st', m: 'N' },
    { id: '3', f: 'Informatyka', k: 'Lab', num: '1A', y: 2, sem: 3, b: [2024], d: '1st', m: 'N' },
    { id: '4', f: 'Informatyka', k: 'Wyk', y: 2, sem: 4, b: [2024], d: '1st', m: 'N' },
  ];
  const sel = { nabor: '2024', field: 'Informatyka', spec: '', year: '2', degree: '1st', mode: 'N', sem: '3' };
  assert.deepEqual(W.baseCandidates(groups, sel).groups.map((g) => g.id), ['1']);
  assert.deepEqual(W.addableGroups(groups, sel, ['1']).map((g) => g.id), ['2', '3']);
  assert.deepEqual(W.addableGroups(groups, sel, ['1', '2']).map((g) => g.id), ['3']);
  // Wykład nigdy nie trafia na listę dodawania, nawet gdy nie jest w planie.
  assert.ok(W.addableGroups(groups, sel, []).every((g) => g.k !== 'Wyk'));
});

// ---------------------------------------- kaskada: kierunek → rocznik → specjalność → tryb
test('rocznik zawęża się do lat studiów i odsiewa grupy ze starych toków', () => {
  const options = require('../server/ideis-options');
  const groups = [
    // 3. rok w roku akademickim 2026/2027 → rocznik 2024
    { id: '1', field: 'Administracja', specialty: 'APUB', year: 3, nabory: [2024], mode: 'N', tokiYears: ['2025/2026'] },
    { id: '2', field: 'Administracja', specialty: 'APUB', year: 3, nabory: [2024], mode: 'N', tokiYears: ['2025/2026'] },
    // 2. rok → rocznik 2025
    { id: '3', field: 'Administracja', specialty: null, year: 2, nabory: [2025], mode: 'N', tokiYears: ['2025/2026'] },
    // ta sama specjalność, ale tok 2022/2023 — plan sprzed lat, nie proponujemy
    { id: '4', field: 'Administracja', specialty: 'IAiSM', year: 2, nabory: [2025], mode: 'N', tokiYears: ['2022/2023'] },
    // grupa bez toków (np. Erasmus+) nie ma jak się zestarzeć
    { id: '5', field: 'Administracja', specialty: null, year: 2, nabory: [2025], mode: 'S', tokiYears: [] },
  ];
  assert.deepEqual(options.cohorts(groups, 'Administracja', { ay: 2026 }), [
    { value: '2025', groups: 2 },
    { value: '2024', groups: 2 },
  ]);
  assert.deepEqual(options.cohortPool(groups, 'Administracja', '2024', { ay: 2026 }).map((g) => g.id), ['1', '2']);
  assert.deepEqual(options.cohortPool(groups, 'Administracja', '2025', { ay: 2026 }).map((g) => g.id), ['3', '5']);
  // Inny rok akademicki = inne roczniki (rok studiów liczy się od `ay`).
  assert.deepEqual(options.cohorts(groups, 'Administracja', { ay: 2027 }), []);
});

test('specjalności i tryby pokazują tylko to, co ma grupy w roczniku', () => {
  const options = require('../server/ideis-options');
  const groups = [
    { id: '1', field: 'Informatyka', specialty: 'IAiSC', year: 3, nabory: [2024], mode: 'N', tokiYears: ['2025/2026'] },
    { id: '2', field: 'Informatyka', specialty: 'IAiSC', year: 3, nabory: [2024], mode: 'S', tokiYears: ['2025/2026'] },
    { id: '3', field: 'Informatyka', specialty: 'PGK', year: 3, nabory: [2024], mode: 'N', tokiYears: ['2025/2026'] },
    { id: '4', field: 'Informatyka', specialty: 'Stara', year: 2, nabory: [2025], mode: 'N', tokiYears: ['2022/2023'] },
  ];
  const site = [
    { id: '10', label: 'Inżynier aplikacji i systemów chmurowych' },
    { id: '11', label: 'Programista gier komputerowych' },
    { id: '12', label: 'Nieistniejąca' },
  ];
  const specs = options.specsFor(groups, 'Informatyka', '2024', site, { ay: 2026 });
  assert.equal(specs.groups, 3);
  assert.equal(specs.noSpecGroups, 0);
  assert.deepEqual(specs.items.map((item) => [item.value, item.groups]), [
    ['IAiSC', 2],
    ['PGK', 1],
    [null, 0],
  ]);
  // Rocznik 2025 to 2. rok — jedyna grupa ma stary tok, więc nie ma czego pokazać.
  const other = options.specsFor(groups, 'Informatyka', '2025', site, { ay: 2026 });
  assert.equal(other.groups, 0);
  // Tryby: tylko te, które mają grupy w tym roczniku i specjalności.
  assert.deepEqual(options.modesFor(groups, 'Informatyka', '2024', 'IAiSC', { ay: 2026 }), [
    { value: 'N', groups: 1 },
    { value: 'S', groups: 1 },
  ]);
  assert.deepEqual(options.modesFor(groups, 'Informatyka', '2024', 'PGK', { ay: 2026 }), [
    { value: 'N', groups: 1 },
  ]);
});

test('wybór planu rośnie krok po kroku: rocznik → kierunek → specjalność → tryb', () => {
  const W = require('../public/wizard');
  // Na starcie jest tylko rocznik; kolejny krok dochodzi po wybraniu poprzedniego.
  assert.deepEqual(W.stepsFor({}), ['nabor']);
  assert.deepEqual(W.stepsFor({ nabor: '2024' }), ['nabor', 'kierunek']);
  assert.deepEqual(W.stepsFor({ nabor: '2024', field: 'Informatyka' }),
    ['nabor', 'kierunek', 'spec', 'tryb']);
  assert.deepEqual(W.stepsFor({ nabor: '2024', field: 'Informatyka', mode: 'S' }),
    ['nabor', 'kierunek', 'spec', 'tryb', 'plan']);

  const app = readRepo('public', 'app.js');
  // Jeden otwarty krok + zwinięte podsumowania; bez arkusza i bez paska kroków.
  assert.match(app, /function pickerHtml\(/);
  assert.match(app, /PW\.stepsFor\(state\.sel\)/);
  assert.match(app, /function activeStep\(/);
  assert.match(app, /data-pick-open="\$\{step\}"/);
  assert.ok(!/wiz-steps/.test(app), 'pasek kroków nie może wrócić');
  assert.ok(!/openWizard\(/.test(app), 'wybór nie otwiera już arkusza');
  // Roczniki i tryby pochodzą z serwera (nie z listy wymiarów całego katalogu).
  assert.match(app, /function kierunkiOfNabor/);
  assert.match(app, /PW\.cohortIndex\(/);
  assert.match(app, /api\/ideis\/tryby/);
  assert.match(app, /params\.set\('nabor'/);
  // Zmiana rocznika nie może zostawić kierunku, którego w nim nie ma.
  assert.match(app, /const keepField = Boolean\(state\.sel\.field\)/);
});

test('roczniki i kierunki rocznika liczą się z listy kierunków', () => {
  const W = require('../public/wizard');
  const kierunki = [
    { id: '10', label: 'Administracja', field: 'Administracja', nabory: [{ value: '2024', groups: 4 }] },
    { id: '11', label: 'Informatyka', field: 'Informatyka', nabory: [{ value: '2024', groups: 7 }, { value: '2023', groups: 3 }] },
    { id: '12', label: 'Zarządzanie', field: 'Zarządzanie', nabory: [] },
  ];
  // Roczniki całego wydziału, od najnowszego, z liczbą kierunków i grup.
  assert.deepEqual(W.cohortIndex(kierunki), [
    { value: '2024', fields: 2, groups: 11 },
    { value: '2023', fields: 1, groups: 3 },
  ]);
  // Kierunek bez grup w roczniku nie trafia na listę (Zarządzanie ma pusto).
  assert.deepEqual(W.kierunkiInCohort(kierunki, '2024').map((item) => item.label),
    ['Administracja', 'Informatyka']);
  assert.deepEqual(W.kierunkiInCohort(kierunki, '2024').map((item) => item.groups), [4, 7]);
  assert.deepEqual(W.kierunkiInCohort(kierunki, '2023').map((item) => item.label), ['Informatyka']);
  // Licznik grup jest z rocznika, nie z całego katalogu.
  assert.equal(W.kierunkiInCohort(kierunki, '2023')[0].groups, 3);
  assert.deepEqual(W.kierunkiInCohort(kierunki, ''), []);
  assert.deepEqual(W.cohortIndex([]), []);
});

test('szukanie kierunku po kilku literach — bez ogonków i z priorytetem początku', () => {
  const W = require('../public/wizard');
  const items = [
    { id: '1', label: 'Informatyka', field: 'Informatyka' },
    { id: '2', label: 'Inżynieria materiałowa', field: 'Inżynieria materiałowa' },
    { id: '3', label: 'Administracja', field: 'Administracja' },
    { id: '4', label: 'Zarządzanie i inżynieria produkcji', field: 'Zarządzanie i inżynieria produkcji' },
  ];
  // Wpisane bez ogonków trafia w nazwę z ogonkami.
  assert.equal(W.foldText('Inżynieria ŁÓDŹ'), 'inzynieria lodz');
  assert.deepEqual(W.rankKierunki(items, 'inz').map((item) => item.label),
    ['Inżynieria materiałowa', 'Zarządzanie i inżynieria produkcji']);
  // „adm” — tylko Administracja; wielkość liter bez znaczenia.
  assert.deepEqual(W.rankKierunki(items, 'ADM').map((item) => item.id), ['3']);
  // „mat” jest początkiem słowa w Inżynierii, a środkiem wyrazu w Informatyce —
  // początek słowa wygrywa.
  assert.deepEqual(W.rankKierunki(items, 'mat').map((item) => item.id), ['2', '1']);
  // Pusty wpis = cała lista, alfabetycznie.
  assert.deepEqual(W.rankKierunki(items, '').map((item) => item.id), ['3', '1', '2', '4']);
  assert.deepEqual(W.rankKierunki(items, 'xyz'), []);
  assert.equal(W.searchScore('Informatyka', ''), 1);
  assert.equal(W.searchScore('Informatyka', 'inf'), 3);
  assert.equal(W.searchScore('Informatyka', 'mat'), 1);
  assert.equal(W.searchScore('Inżynieria materiałowa', 'mat'), 2);
  assert.equal(W.searchScore('Informatyka', 'q'), 0);
});

test('zaznaczenie widać w kółku, a pasek akcji jest przyklejony do dołu', () => {
  const css = readRepo('public', 'native.css');
  // Kropka w kółku rośnie po zaznaczeniu; wcześniej kółko nigdy się nie wypełniało,
  // a zaznaczenie było widoczne tylko jako tło całego kafelka.
  assert.match(css, /\.radio-mark::after \{[\s\S]*?transform: scale\(0\)/);
  assert.match(css, /\.radio-row\[aria-checked="true"\] \.radio-mark::after \{ transform: scale\(1\); \}/);
  assert.match(css, /\.radio-row\[aria-pressed="true"\] \.radio-mark::after \{ transform: scale\(1\); \}/);
  assert.match(css, /\.wiz-actions \{[\s\S]*?position: sticky;/);
  const app = readRepo('public', 'app.js');
  assert.match(app, /aria-pressed="\$\{on \? 'true' : 'false'\}"/);
});

test('scalony plan filtruje zajęcia po numerze grupy', () => {
  const { mergePlans } = require('../server/merge');
  const mk = (id, groups, date) => ({
    id, date, start: '10:00', end: '11:30', startISO: `${date}T10:00:00`, subject: 'X',
    groupIds: groups, groups: [], form: { code: 'WYK' },
  });
  const planA = { classes: [mk('a', ['1'], '2026-10-01'), mk('b', ['2'], '2026-10-02')], meta: { groupId: '1', groupName: 'A' } };
  const planB = { classes: [mk('c', ['2'], '2026-10-02'), mk('d', ['2', '3'], '2026-10-03')], meta: { groupId: '2', groupName: 'B' } };
  const merged = mergePlans([planA, planB], ['1', '2']);
  assert.deepEqual(merged.classes.map((c) => c.id), ['a', 'b', 'c', 'd']);
  assert.equal(merged.meta.classes, 4);
  assert.equal(merged.meta.groupIds.length, 2);
  assert.equal(merged.meta.unfiltered, false);
  // Stary cache bez `groupIds` nie może zniknąć — wraca nieprzefiltrowany.
  const oldPlan = { classes: [{ id: 'x', date: '2026-10-01', start: '10:00', end: '11:00', startISO: '2026-10-01T10:00:00', subject: 'Y', groups: [] }], meta: {} };
  const old = mergePlans([oldPlan], ['5']);
  assert.equal(old.meta.unfiltered, true);
  assert.equal(old.classes.length, 1);
});

test('wersja scalonego planu zmienia się z wersjami grup', () => {
  const { mergedVersionId } = require('../server/merge');
  const a = mergedVersionId(['1', '2'], 2026, [1, 2]);
  assert.equal(a, mergedVersionId(['2', '1'], 2026, [2, 1]));
  assert.notEqual(a, mergedVersionId(['1', '2'], 2026, [1, 3]));
  assert.equal(Number.isSafeInteger(a), true);
});

test('odcisk treści planu obejmuje wszystko, co widać w planie', () => {
  const { fingerprint } = require('../server/versions');
  const mk = (patch) => ({
    classes: [{
      id: '2026-11-27|10:00|11:30|74869|Wyk|Infor. 1st 1sem WykN',
      subject: 'Infor. 1st 1sem WykN',
      start: '10:00',
      end: '11:30',
      roomRaw: 'A1',
      lecturer: 'dr X',
      notes: '',
      form: { raw: 'Wykład' },
      passForm: 'Egzamin',
      groupIds: ['21188'],
      ...patch,
    }],
    meta: {},
  });
  const base = fingerprint(mk({}));
  const fields = {
    sala: { roomRaw: 'B2' },
    prowadzący: { lecturer: 'dr Y' },
    przedmiot: { subject: 'Inne zajęcia' },
    uwagi: { notes: 'UWAGA: distance learning' },
    godzina: { start: '11:00' },
    'forma zaliczenia': { passForm: 'Zaliczenie na ocenę' },
    'przypisanie do grupy': { groupIds: ['21189'] },
  };
  for (const [name, patch] of Object.entries(fields)) {
    assert.notEqual(fingerprint(mk(patch)), base, `odcisk nie reaguje na pole: ${name}`);
  }
  // Ta sama treść w innej kolejności numerów grup to nadal ta sama wersja.
  assert.equal(fingerprint(mk({ groupIds: ['2', '1'] })), fingerprint(mk({ groupIds: ['1', '2'] })));
  assert.equal(fingerprint(mk({})), base);
});

test('odcisk scalonego planu bierze treść grup, nie numery wersji', () => {
  const { mergedFingerprint, mergedVersionId } = require('../server/merge');
  const a = mergedFingerprint(['aaa', 'bbb']);
  assert.equal(a, mergedFingerprint(['bbb', 'aaa']));
  assert.notEqual(a, mergedFingerprint(['aaa', 'ccc']));
  assert.notEqual(a, mergedFingerprint([]));
  // Ten sam odcisk = ten sam numer wersji scalonej, niezależnie od kolejności grup.
  assert.equal(
    mergedVersionId(['1', '2'], 2026, ['aaa', 'bbb']),
    mergedVersionId(['2', '1'], 2026, ['bbb', 'aaa']),
  );
});

test('tożsamość wersji planu to odcisk treści, nie licznik procesu', () => {
  const app = readRepo('public', 'app.js');
  assert.match(app, /function samePlanVersion\(known, server\)/);
  // Kolejność porównania: odcisk → czas pobrania → numer wersji (ostatnia deska).
  const body = app.slice(
    app.indexOf('function samePlanVersion('),
    app.indexOf('async function load(force)'),
  );
  assert.ok(body.indexOf('currentFingerprint') > 0, 'brak porównania odcisku');
  assert.ok(body.indexOf('currentFingerprint') < body.indexOf('currentId'),
    'numer wersji nie może wyprzedzać odcisku');
  assert.match(app, /samePlanVersion\(cached\.plan\.version, serverVersion\)/);
  // Numer wersji jest licznikiem serwera: po restarcie wraca do #1.
  assert.match(app, /state\.planVersion = plan\.version/);
});

test('aplikacja sprawdza w tle, czy plan się zmienił', () => {
  const app = readRepo('public', 'app.js');
  assert.match(app, /async function checkPlanVersion\(/);
  assert.match(app, /const VERSION_POLL_MS = 5 \* 60 \* 1000/);
  assert.match(app, /setInterval\(\(\) => \{ checkPlanVersion\(\); \}, VERSION_POLL_MS\)/);
  // Sprawdzanie nie może: budzić ukrytej karty, pytać bez sieci ani psuć planu.
  assert.match(app, /if \(document\.visibilityState === 'hidden'\) return;/);
  assert.match(app, /if \(navigator\.onLine === false\) return;/);
  // Powrót do karty sprawdza od razu, bez czekania na interwał.
  assert.match(app, /render\(\);\s*\n\s*\/\/ Powrót do karty[\s\S]{0,200}checkPlanVersion\(\);/);
});

test('krok „Rocznik” dociąga listę także z Opcji → Wybór planu', () => {
  const app = readRepo('public', 'app.js');
  // Powitanie i panel Opcji rysują ten sam picker, więc listę kierunków
  // dociąga jedno miejsce — wcześniej tylko powitanie (użytkownik z zapisanym
  // planem widział „katalog nie ma roczników” bez wyjścia).
  assert.match(app, /function ensurePickerData\(/);
  assert.match(app, /if \(state\.wizard\.kierunki\.length \|\| state\.wizard\.loading \|\| state\.wizard\.error\) return;/);
  assert.match(app, /ensurePickerData\(\);[^]{0,200}target\.innerHTML|target\.innerHTML = pickerHtml\(\)/);
  assert.match(app, /if \(page === 'group'\) \{\s*\n\s*bindSettingsManual\(\);\s*\n[^]{0,300}ensurePickerData\(\);/);
  assert.match(app, /if \(!\$\('welcome'\)\.hidden\) ensurePickerData\(\);/);
});

test('pusty plan mówi wprost, że to normalne, i daje zmianę rocznika', () => {
  const app = readRepo('public', 'app.js');
  assert.match(app, /Ten plan nie ma zajęć/);
  assert.match(app, /Na starszych rocznikach to normalne/);
  assert.match(app, /data-empty-action="pick">Zmień rocznik lub plan/);
  assert.match(app, /action === 'pick'\) openSettings\('plan'\)/);
});

test('link z całym planem otwiera plan na świeżej przeglądarce', () => {
  const app = readRepo('public', 'app.js');
  // `?groups=` jest tak samo ważne jak stary `?group=` — inaczej aplikacja
  // kasowała własny adres i pokazywała kreator.
  assert.match(app, /state\.needsGroup = !prefs\.hasChosenGroup && !query\.group && !queryGroups\.length/);
  assert.match(app, /if \(query\.group \|\| queryGroups\.length\) \{/);
  assert.match(app, /planGroups: state\.planGroups,\s*\n\s*hasChosenGroup: true/);
});

test('szkic wyboru w Opcjach nie zmienia planu pod spodem', () => {
  const app = readRepo('public', 'app.js');
  // Kroki pickera zmieniają `state.sel` od razu, więc bez cofnięcia szkicu
  // karta „Plan” mówiła „Informatyka · 2023/2024”, pokazując plan 2. roku.
  assert.match(app, /state\.wizard\.applied = \{ sel: \{ \.\.\.state\.sel \}, site: \{ \.\.\.state\.site \} \}/);
  assert.match(app, /function restoreAppliedSelection\(\)/);
  assert.match(app, /if \(state\.sheetKind === 'settings'\) restoreAppliedSelection\(\);/);
  // Szkic nie trafia do localStorage — wybór zapisuje dopiero `selectPlan`.
  // Inaczej przeładowanie w połowie wyboru dogrywało grupę z innego rocznika.
  const steps = app.slice(app.indexOf('function wizChooseKierunek'), app.indexOf('function finishWizard'));
  assert.equal(/writePrefs\(/.test(steps), false, 'szkic wyboru nie może trafiać do pamięci');
});

test('animacja wczytywania trwa do najnowszego planu (bez wyścigu żądań)', () => {
  const app = readRepo('public', 'app.js');
  // Dwa wczytania mogą iść naraz: wybór planu, a zaraz po nim dodanie grup.
  // Odpowiedź starszego przychodzi pierwsza — nie może zgasić animacji ani
  // podmienić planu na niepełny.
  assert.match(app, /const seq = \(state\.loadSeq = \(state\.loadSeq \|\| 0\) \+ 1\);/);
  assert.match(app, /const isCurrent = \(\) => seq === state\.loadSeq;/);
  const body = app.slice(app.indexOf('async function load(force)'), app.indexOf('async function checkPlanVersion'));
  assert.match(body, /if \(!isCurrent\(\)\) return;\s*\n\s*if \(!plan \|\| !plan\.ok\)/, 'starsza odpowiedź nie może podmienić planu');
  assert.match(body, /if \(isCurrent\(\)\) \{\s*\n\s*state\.loading = false;/, 'starsze wczytanie nie może zgasić animacji');
  // Pamięć planu też nie może dostać starszej wersji (kasuje wpisy innych grup).
  const beforeApply = body.indexOf('if (!isCurrent()) return;\n      if (!plan || !plan.ok)');
  assert.ok(beforeApply > 0 && body.indexOf('writeCachedPlan(plan, savedAt)', beforeApply) > beforeApply,
    'zapis do pamięci musi być po barierze');
});

test('panel Opcji animuje się tylko przy zmianie strony (bez powtórek)', () => {
  const app = readRepo('public', 'app.js');
  const css = readRepo('public', 'native.css');
  // Nawigacja stron panelu podaje kierunek; odświeżenie treści (wydanie APK,
  // aktualizacja PWA, zmiana planu) nie może powtarzać animacji w bok.
  assert.match(app, /function renderSettings\(\{ keepScroll = false, direction = '' \} = \{\}\)/);
  assert.match(app, /const animate = direction === 'forward' \|\| direction === 'back';/);
  assert.match(app, /\$\{animate \? \(direction === 'back' \? ' is-back' : ''\) : ' is-still'\}/);
  assert.match(css, /\.settings-page\.is-still \{ animation: none; \}/);
  // `refreshSettings` nie jest nawigacją — nie może podawać kierunku.
  const refresh = app.slice(app.indexOf('function refreshSettings()'), app.indexOf('function bindSettingsManual'));
  assert.equal(/direction/.test(refresh), false, 'odświeżenie panelu nie animuje strony');
});

test('kafelek dnia w widoku Semestr otwiera ten dzień w widoku Dzień', () => {
  const app = readRepo('public', 'app.js');
  const body = app.slice(app.indexOf('function selectDate(iso)'), app.indexOf('function onViewportClick'));
  assert.match(body, /if \(state\.view === 'semester'\) \{/);
  assert.match(body, /state\.view = 'day';/);
  assert.match(body, /state\.enter = \{ target: 'view', dir: -1 \};/);
  // Kafelek semestru musi być klikalny (data-select-date) — inaczej nie ma czego obsłużyć.
  const semester = app.slice(app.indexOf('function renderSemester()'), app.indexOf('// --- ekran powitalny'));
  assert.match(semester, /renderMonthGrid\(monthKey, null, true\)/);
});

test('licznik wejść liczy przeglądarkę, PWA i aplikację Android', async () => {
  const os = require('node:os');
  const fsp = fs.promises;
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'visits-'));
  const { VisitCounter, renderVisitsPage } = require('../server/visits');
  const counter = new VisitCounter({ file: path.join(dir, 'visits.json') });
  await counter.load();
  await counter.record('web');
  await counter.record('apk');
  await counter.record('pwa');
  await counter.record('nieznane');
  const snap = counter.snapshot();
  assert.equal(snap.total, 4);
  assert.equal(snap.web, 2);
  assert.equal(snap.apk, 1);
  assert.equal(snap.pwa, 1);
  const page = renderVisitsPage(snap, { appUrl: '/' });
  assert.match(page, /Licznik wejść/);
  assert.match(page, /Aplikacja Android/);
  assert.match(page, /PWA/);
  await fsp.rm(dir, { recursive: true, force: true });
});

test('zgłoszenia błędów zapisują się, wracają z listy i dają się usunąć', async () => {
  const os = require('node:os');
  const fsp = fs.promises;
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'feedback-'));
  const { FeedbackStore } = require('../server/feedback');
  const store = new FeedbackStore({ dir });
  const item = await store.add({ kind: 'bug', message: '  Nie  działa  ', version: 'v23', platform: 'web' });
  assert.equal(item.message, 'Nie działa');
  assert.equal(item.kind, 'bug');
  const list = await store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, item.id);
  await assert.rejects(() => store.add({ kind: 'x', message: 'abc' }));
  await assert.rejects(() => store.add({ kind: 'idea', message: 'a' }));
  assert.equal(await store.remove(item.id), true);
  assert.equal((await store.list()).length, 0);
  await fsp.rm(dir, { recursive: true, force: true });
});

test('ekran powitalny i Opcje → Wybór planu obsługują ten sam wybór', () => {
  const app = readRepo('public', 'app.js');
  // Wybór leży poza arkuszem, więc potrzebuje własnego nasłuchu — bez tego
  // na telefonie „Kierunek” nie reagował (zgłoszenie z 15.11).
  assert.match(app, /\$\('welcomePicker'\)\.addEventListener\('click'/);
  assert.match(app, /event\.target\.closest\(PICK_SELECTOR\)/);
  assert.match(app, /function pickerClick\(/);
  // Ten sam selektor w arkuszu (Opcje → Wybór planu).
  assert.match(app, /`\$\{PICK_SELECTOR\},`/);
  // Ręczny numer grupy schowany za linkiem — na starcie widać sam wybór.
  assert.match(app, /\$\('welcomeManualToggle'\)\.addEventListener/);
  assert.match(app, /welcomeManualBox/);
});

test('arkusz i dialog trzymają fokus w środku (trap + inert + powrót)', () => {
  const app = readRepo('public', 'app.js');
  const html = readRepo('public', 'index.html');
  // `aria-modal` niczego nie wymusza — bez pułapki Tab wychodził na stronę.
  assert.match(app, /function trapFocus\(/);
  assert.match(app, /function setBackgroundInert\(/);
  assert.match(app, /event\.key !== 'Tab'/);
  assert.match(app, /node\.inert = inert/);
  // Po zamknięciu fokus wraca tam, gdzie był przed otwarciem okna.
  assert.match(app, /restoreFocus\('sheet'\)/);
  assert.match(app, /restoreFocus\('dialog'\)/);
  // Jedno wejście do okna dla wszystkich ścieżek (arkusz, Opcje, dialogi).
  assert.match(app, /function enterOverlay\(/);
  assert.equal(/\$\('dialog'\)\.hidden = false/.test(app), false,
    'dialog musi być otwierany przez enterOverlay, nie ręcznie');
  assert.equal(/\$\('sheet'\)\.hidden = false/.test(app), false,
    'arkusz musi być otwierany przez enterOverlay, nie ręcznie');
  // Sam arkusz też musi być focusowalny (gdy w środku nie ma przycisków).
  assert.match(html, /id="sheet"[^>]*tabindex="-1"/);
  assert.match(html, /id="dialog"[^>]*tabindex="-1"/);
});

// ------------------------------------------------------- odporne zapisy
// Notatka i licznik piszą na wolumen. Pełny dysk nie może udawać sukcesu,
// bo klient widzi wtedy „Zapisano”, a dane przepadają po restarcie.
const NOTE_CLASS_ID = '2026-11-16|09:40|11:10|74835|Wyk|21188';

testAsync('nieudany zapis notatki zwraca 503 i cofa zmianę w pamięci', async () => {
  const { NoteStore } = require('../server/notes');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-fail-'));
  try {
    const file = path.join(dir, 'notes.json');
    const store = new NoteStore({ file });
    await store.load();
    await store.set(NOTE_CLASS_ID, 'Kolos');

    // Katalog w miejscu pliku: writeFile/rename nie mają prawa się udać.
    fs.rmSync(file, { force: true });
    fs.mkdirSync(file);
    await assert.rejects(
      () => store.set(NOTE_CLASS_ID, 'Egzamin'),
      (err) => err.status === 503,
      'nieudany zapis musi zwrócić 503, a nie udawać sukces',
    );
    assert.equal(store.snapshot()[NOTE_CLASS_ID], 'Kolos',
      'po nieudanym zapisie pamięć musi wrócić do poprzedniej wartości');

    // Łańcuch zapisów nie może się zablokować po jednym błędzie.
    fs.rmSync(file, { recursive: true, force: true });
    await store.set(NOTE_CLASS_ID, 'Egzamin');
    assert.equal(store.snapshot()[NOTE_CLASS_ID], 'Egzamin');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rejestr grup nie rośnie bez końca — najstarszy wpis wypada już w get()', () => {
  const { GroupRegistry } = require('../server/registry');
  const registry = new GroupRegistry({ maxActive: 3, pinned: '21188', idleDays: 14 });
  registry.get('21188');
  for (let i = 0; i < 50; i += 1) registry.get(String(30000 + i));
  assert.ok(registry.map.size <= 4, `rejestr urósł do ${registry.map.size} wpisów`);
  assert.ok(registry.has('21188'), 'grupa przypięta nie może wypaść z rejestru');
  assert.ok(registry.has('30049'), 'ostatnio użyta grupa musi zostać');
});

testAsync('cache planów jest sprzątany: wypadająca grupa traci plik, obcy plik znika przy starcie', async () => {
  const { GroupRegistry } = require('../server/registry');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-gc-'));
  const waitGone = async (file) => {
    for (let i = 0; i < 40; i += 1) {
      if (!fs.existsSync(file)) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return !fs.existsSync(file);
  };
  try {
    const registry = new GroupRegistry({ maxActive: 2, pinned: null, cacheDir: dir });
    const first = registry.get('30001');
    fs.writeFileSync(first.cache.file, '{"plan":null}');
    registry.get('30002');
    fs.writeFileSync(registry.get('30002').cache.file, '{"plan":null}');
    // Trzecia grupa wypiera najstarszą — razem z jej plikiem na dysku.
    const third = registry.get('30003');
    fs.writeFileSync(third.cache.file, '{"plan":null}');
    assert.equal(await waitGone(first.cache.file), true,
      'plik wypartej grupy musi zniknąć z dysku');

    // Plik grupy, której rejestr nie zna (np. po restarcie), znika przy starcie.
    const orphan = path.join(dir, 'plan-30009.json');
    fs.writeFileSync(orphan, '{"plan":null}');
    const removed = await registry.sweepOrphans();
    assert.ok(removed >= 1, `sweepOrphans usunął ${removed} plików`);
    assert.equal(fs.existsSync(orphan), false);
    assert.equal(fs.existsSync(third.cache.file), true, 'pliki znanych grup zostają');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

testAsync('cache negatywny: nieistniejącej grupy nie pytamy przy każdym żądaniu', async () => {
  const { PlanCache } = require('../server/cache');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-neg-'));
  try {
    const cache = new PlanCache({ file: path.join(dir, 'plan.json'), errorTtlMs: 60_000 });
    let calls = 0;
    const failing = async () => { calls += 1; throw new Error('HTTP 500 dla harmonogramów'); };
    for (let i = 0; i < 3; i += 1) {
      await assert.rejects(() => cache.get({ fetchFn: failing }));
    }
    assert.equal(calls, 1, `uczelnia zapytana ${calls} razy zamiast raz`);
    // Przycisk „Odśwież” (force) świadomie omija cache negatywny.
    await assert.rejects(() => cache.get({ force: true, fetchFn: failing }));
    assert.equal(calls, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------- HTTP
// Wcześniej żaden test nie uruchamiał serwera HTTP, więc crash po nagłówku
// `Host: [` (ERR_INVALID_URL poza `try`) przeszedł przez komplet zielonych testów.
const net = require('node:net');
const nodeHttp = require('node:http');
const { spawn } = require('node:child_process');
const httpServers = [];

/** Plan w cache — dzięki temu testy nie pytają uczelni o nic. */
function seedPlanCache(dir, groupId = '21188') {
  const plan = {
    meta: { fetchedAt: new Date().toISOString(), classes: 1 },
    days: [{ date: '2026-11-16' }],
    classes: [{
      id: `2026-11-16|09:40|11:10|74835|Wyk|${groupId}`,
      date: '2026-11-16',
      start: '09:40',
      end: '11:10',
      subject: 'Algebra',
      lecturer: 'mgr Janusz Grabski',
      notes: 'Brak',
      form: { raw: 'Wyk' },
      groupIds: [groupId],
    }],
  };
  fs.writeFileSync(path.join(dir, `plan-${groupId}.json`),
    JSON.stringify({ savedAt: new Date().toISOString(), plan }), 'utf8');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Uruchamia prawdziwy serwer na wolnym porcie i czeka, aż odpowie /health. */
async function startPlanServer(extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-http-'));
  seedPlanCache(dir, String(extraEnv.GROUP_ID || '21188'));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      CACHE_DIR: dir,
      GROUP_ID: '21188',
      NODE_ENV: 'test',
      REFRESH_TOKEN: '',
      TRUST_PROXY: 'private',
      PLAN_RATE_PER_MIN: '120',
      ...extraEnv,
    },
    stdio: 'ignore',
  });
  httpServers.push({ child, dir });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`serwer padł przy starcie (kod ${child.exitCode})`);
    const alive = await httpCall(base, { path: '/health' }).then((res) => res.status === 200)
      .catch(() => false);
    if (alive) break;
    if (Date.now() > deadline) throw new Error('serwer nie wstał w 20 s');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { base, dir, child };
}

/** Żądanie z pełną kontrolą nagłówków (testy muszą wysłać własny `Host`). */
function httpCall(base, { method = 'GET', path: reqPath = '/', headers = {}, body = null } = {}) {
  const target = new URL(base);
  return new Promise((resolve, reject) => {
    const req = nodeHttp.request({
      hostname: target.hostname,
      port: target.port,
      method,
      path: reqPath,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

let sharedServer = null;
function planServer() {
  if (!sharedServer) sharedServer = startPlanServer();
  return sharedServer;
}

process.on('exit', () => {
  for (const { child, dir } of httpServers) {
    if (child.exitCode === null) child.kill('SIGKILL');
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* już sprzątnięte */ }
  }
});

testAsync('HTTP: nagłówek Host nie zabija serwera (ERR_INVALID_URL)', async () => {
  const { base } = await planServer();
  // `Host: [` wywalał proces, bo `new URL(req.url, \`http://${host}\`)` stało
  // poza `try`. Host nie jest potrzebny do routingu, więc żądanie przechodzi.
  const res = await httpCall(base, { headers: { Host: '[' } });
  assert.equal(res.status, 200, `oczekiwano 200, jest ${res.status}`);
  const health = await httpCall(base, { path: '/health' });
  assert.equal(health.status, 200, 'proces musi żyć po żądaniu z niepoprawnym Hostem');
});

testAsync('HTTP: nieparsowalny adres żądania kończy się 400, nie crashem', async () => {
  const { base } = await planServer();
  const res = await httpCall(base, { path: 'http://[' });
  assert.equal(res.status, 400);
  const health = await httpCall(base, { path: '/health' });
  assert.equal(health.status, 200);
});

testAsync('HTTP: POST /api/plan to 405 z nagłówkiem Allow', async () => {
  const { base } = await planServer();
  const res = await httpCall(base, { method: 'POST', path: '/api/plan?group=21188' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.allow, 'GET, HEAD');
  const ok = await httpCall(base, { path: '/api/plan?group=21188' });
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse(ok.body).classes.length, 1, 'plan ma iść z cache, nie z uczelni');
});

testAsync('HTTP: plik statyczny ma ETag, a powtórka daje 304 bez ciała', async () => {
  const { base } = await planServer();
  const first = await httpCall(base, { path: '/' });
  assert.equal(first.status, 200);
  assert.ok(first.headers.etag, 'brak nagłówka ETag');
  const second = await httpCall(base, { path: '/', headers: { 'If-None-Match': first.headers.etag } });
  assert.equal(second.status, 304);
  assert.equal(second.body, '', '304 nie może mieć ciała');
});

testAsync('HTTP: publiczne odczyty planu mają limit tempa (429)', async () => {
  const { base } = await startPlanServer({ PLAN_RATE_PER_MIN: '4' });
  const statuses = [];
  for (let i = 0; i < 8; i += 1) {
    statuses.push((await httpCall(base, { path: '/api/plan?group=21188' })).status);
  }
  assert.ok(statuses.includes(429), `brak 429 w ${statuses.join(', ')}`);
  assert.equal(statuses.filter((s) => s === 200).length, 4, `statusy: ${statuses.join(', ')}`);
});

testAsync('HTTP: na produkcji wymuszone odświeżenie wymaga tokenu', async () => {
  const withoutToken = await startPlanServer({ NODE_ENV: 'production' });
  const refused = await httpCall(withoutToken.base, { method: 'POST', path: '/api/refresh?group=21188' });
  assert.equal(refused.status, 503, 'bez REFRESH_TOKEN produkcja nie może odpytywać uczelni');

  const withToken = await startPlanServer({ NODE_ENV: 'production', REFRESH_TOKEN: 'tajne' });
  const unauthorized = await httpCall(withToken.base, { method: 'POST', path: '/api/refresh?group=21188' });
  assert.equal(unauthorized.status, 401);
});

testAsync('HTTP: ?refresh=1 na produkcji wymaga tokenu (katalog nie do zalewania)', async () => {
  const noToken = await startPlanServer({ NODE_ENV: 'production' });
  const denied = await httpCall(noToken.base, { path: '/api/groups?refresh=1' });
  assert.equal(denied.status, 403, 'bez tokenu nie wolno wymuszać pobrania katalogu');

  const withToken = await startPlanServer({ NODE_ENV: 'production', REFRESH_TOKEN: 'tajne' });
  const wrong = await httpCall(withToken.base, { path: '/api/groups?refresh=1&token=nie-to' });
  assert.equal(wrong.status, 403);
  const ideis = await httpCall(withToken.base, { path: '/api/ideis/kierunki?refresh=1' });
  assert.equal(ideis.status, 403, 'lista kierunków ma ten sam limit');
});

testAsync('HTTP: nagłówki bezpieczeństwa są na HTML, JSON i plikach', async () => {
  const { base } = await planServer();
  for (const probe of [
    { path: '/' },
    { path: '/api/plan?group=21188' },
    { path: '/theme-boot.js' },
  ]) {
    const res = await httpCall(base, probe);
    assert.equal(res.status, 200, `${probe.path}: ${res.status}`);
    const csp = res.headers['content-security-policy'] || '';
    assert.match(csp, /frame-ancestors 'none'/, `${probe.path}: brak frame-ancestors`);
    assert.match(csp, /script-src 'self'/, `${probe.path}: brak script-src`);
    assert.equal(csp.includes("script-src 'self' 'unsafe-inline'"), false,
      `${probe.path}: CSP nie może dopuszczać inline JS`);
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(res.headers['strict-transport-security'] || '', /max-age=\d+/);
    assert.match(res.headers['permissions-policy'] || '', /camera=\(\)/);
  }
});

test('HTML nie ma inline <script> — inaczej CSP musiałby dopuścić unsafe-inline', () => {
  for (const file of ['index.html', 'propozycje.html']) {
    const html = readRepo('public', file);
    assert.equal(/<script>/.test(html), false, `${file} ma inline <script>`);
  }
  assert.match(readRepo('public', 'index.html'),
    /<script src="\/theme-boot\.js\?v=\d+"><\/script>/);
  assert.match(readRepo('public', 'propozycje.html'),
    /<script src="\/propozycje\.js\?v=\d+"><\/script>/);
});

testAsync('HTTP: notatki tylko dla zajęć, które są w planie', async () => {
  const { base } = await planServer();
  const known = '2026-11-16|09:40|11:10|74835|Wyk|21188';
  const post = (classId, text = 'Kolos') => httpCall(base, {
    method: 'POST',
    path: '/api/notes?group=21188',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ classId, text }),
  });

  // Data spoza okna roku akademickiego — odrzucana bez pytania uczelni.
  const farFuture = await post('2099-01-01|08:00|09:30|99999|Wyk|Fake');
  assert.equal(farFuture.status, 400, 'data 2099 nie może przejść');
  // Poprawny format, ale takich zajęć nie ma w planie grupy.
  const missing = await post('2026-11-20|09:40|11:10|74835|Wyk|21188');
  assert.equal(missing.status, 404, 'nieistniejące zajęcia muszą dać 404');

  const saved = await post(known);
  assert.equal(saved.status, 200);
  assert.equal(JSON.parse(saved.body).text, 'Kolos');
  // Sprzątamy po sobie — magazyn notatek nie może zostać z wpisem testowym.
  const cleared = await post(known, '');
  assert.equal(cleared.status, 200);
  assert.equal(JSON.parse(cleared.body).text, '');

  // Usunięcie starej notatki musi działać także wtedy, gdy zajęć nie ma już
  // w planie (uczelnia przesunęła/odwołała zajęcia) — inaczej plakietka
  // zostaje na zawsze i nie da się jej zdjąć z aplikacji.
  const stale = await post('2026-11-23|08:00|09:30|74858|Cw|Infor. 1st 1sem Ćw2N', '');
  assert.equal(stale.status, 200, 'pusta treść usuwa notatkę bez sprawdzania planu');
});

(async () => {
  for (const t of asyncTests) {
    try {
      await t.fn();
      passed += 1;
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failures.push({ name: t.name, err });
      console.log(`  ✗ ${t.name}\n      ${err.message}`);
    }
  }

  // Serwery testowe trzymają pętlę zdarzeń — bez tego proces nie kończy pracy.
  for (const { child } of httpServers) {
    if (child.exitCode === null) child.kill('SIGKILL');
  }

  console.log(`\n${passed} przeszło, ${failures.length} nie przeszło`);
  if (failures.length) {
    failures.forEach((f) => console.error(`\n${f.name}\n${f.err.stack}`));
    process.exit(1);
  }
})();
