'use strict';
/**
 * Wymiary katalogu grup: kierunek, specjalność, rok studiów, nabór, typ studiów.
 *
 * Uczelnia (harmonogramy.ideis.pl) nie publikuje tych wymiarów osobno — wynikają
 * z kodu/nazwy grupy oraz z kolumny „Toki nauki”:
 *
 *   code:  „Infor. 1st 3sem Lab1A”
 *   name:  „Informatyka, 1st 3sem Lab (gr. 1A) N”
 *   toki:  „Informatyka N lic. 3.00 2025/2026 Zima, …”
 *
 * Zasady (sprawdzone na pełnym katalogu, ~2100 grup):
 *
 *   Rok studiów  = ceil(semestr / 2)  — 1sem+2sem to 1. rok, 3sem+4sem to 2. rok.
 *   Nabór        = rok akademicki toku − (rok studiów − 1). Grupa z 3. semestru
 *                  w roku 2025/2026 to nabór 2024/2025.
 *   Specjalność  = człon nazwy przed stopniem, o ile różni się od kierunku
 *                  („Prawo w biznesie i administracji, 1st 3sem …” w kierunku
 *                  „Administracja”). Na pierwszym roku specjalności nie ma i
 *                  wtedy zostaje `null` — wybór specjalności jest opcjonalny.
 *   Typ studiów  = stopień (1st/2st/Jmgr/Podypl./…) z nazwy grupy.
 *   Tryb         = ostatnia litera nazwy: N (niestacjonarne) / S (stacjonarne).
 *
 * Polskie litery nie są znakami `\w` w JavaScripcie, dlatego `\b` przy „Inż”
 * złapałby „Inżynier” — stąd jawne klasy znaków zamiast granic słowa.
 */

const PL_LETTERS = 'a-ząćęłńóśźż';
const NOT_LETTER = `(?![${PL_LETTERS}])`;
// „P” to studia podyplomowe w nazwach typu „Arteterapia P 1sem Cw2 N” — uczelnia
// nie dopisuje tam pełnego „Podypl.”, a mimo to jest to ten sam typ studiów.
const DEGREE_RE = new RegExp(
  `(?:^|[\\s,])(Podypl\\.?|Jmgr|Mgr|Inż|Inz|Lic|Dr|P|[1-4](?:st|nd|rd|th))${NOT_LETTER}`,
  'i',
);
const SEMESTER_RE = new RegExp(`(?:^|[\\s,])(\\d{1,2})\\s*sem${NOT_LETTER}`, 'i');
// Część grup nie ma semestru, tylko znacznik roku i semestru roku akademickiego
// w nazwie („… Across Borders, 25/26z Wyk”). Tniemy na nim, żeby nie zrobić
// z nazwy kierunku fałszywej specjalności.
const TERM_RE = new RegExp(`(?:^|[\\s,])(\\d{2}\\/\\d{2}[a-z]?)${NOT_LETTER}`, 'i');
const PARENT_RE = /\s*\(([^()]{2,10})\)$/;
/**
 * Tryb to ostatnia samodzielna litera N/S w nazwie — ale nie zawsze na końcu:
 * część grup ma po niej jeszcze dopisek w nawiasie („… (gr. 2) N (K)”).
 */
const MODE_TOKEN_RE = /(?:^|[\s,])([NS])(?=[\s,]|$|\()/g;

/** Rok akademicki, w którym zaczyna się bieżący nabór (1 września = nowy rok). */
function currentAcademicYearStart(now = new Date()) {
  const year = now.getFullYear();
  return now.getMonth() + 1 >= 9 ? year : year - 1;
}

/** „2026” → „2026/2027”. */
function academicYearLabel(startYear) {
  const value = Number(startYear);
  if (!Number.isFinite(value)) return null;
  return `${value}/${value + 1}`;
}

/** „2026/2027” → 2026 (albo null, gdy zapis jest inny). */
function academicYearStart(label) {
  const m = /^(\d{4})\s*\/\s*(\d{4})$/.exec(String(label || '').trim());
  if (!m) return null;
  return Number(m[1]);
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDegree(raw) {
  const value = String(raw || '').replace(/\.$/, '').toLowerCase();
  if (!value) return null;
  if (/^[1-4]st$/.test(value)) return value;
  if (value === 'inz') return 'inż';
  // „P” w nazwie grupy to studia podyplomowe (ten sam kod co „Podypl.”).
  if (value === 'p') return 'podypl';
  return value;
}

/** Odległość Levenshteina z wczesnym wyjściem — nazwy mają po kilkanaście znaków. */
function withinEditDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  const previous = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let lastDiagonal = previous[0];
    previous[0] = i;
    let rowMin = previous[0];
    for (let j = 1; j <= b.length; j += 1) {
      const temp = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        lastDiagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      lastDiagonal = temp;
      rowMin = Math.min(rowMin, previous[j]);
    }
    if (rowMin > max) return false;
  }
  return previous[b.length] <= max;
}

/**
 * Czy „specjalność” to w rzeczywistości ten sam kierunek?
 *
 * Uczelnia zapisuje kierunek w polu „Kierunek”, a w nazwie grupy bywa skrót
 * („Infor.”) albo literówka („Inforamtyka”). Takich wpisów nie pokazujemy jako
 * osobnej specjalności. Jednocześnie prawdziwa specjalność, która zaczyna się
 * od nazwy kierunku („Psychologia kliniczna i zdrowia” w kierunku
 * „Psychologia”), MUSI nią zostać — dlatego dłuższy tekst z prefiksem
 * kierunku nigdy nie jest traktowany jako ten sam kierunek.
 */
function isSameProgram(subject, field) {
  const x = normalizeText(subject);
  const y = normalizeText(field);
  if (!x || !y) return true;
  if (x === y) return true;
  if (x.length > y.length && x.startsWith(y)) return false;
  if (x.length >= 4 && x.length < y.length && y.startsWith(x)) return true;
  return withinEditDistance(x, y, 2);
}

/** Indeks początku dopasowania (regex zjada separator przed tokenem). */
function tokenStart(match) {
  return match ? match.index + match[0].indexOf(match[1]) : -1;
}

/** Tryb z nazwy: ostatnia samodzielna litera N/S (także przed „(K)”). */
function modeFromName(text) {
  const source = String(text || '').trim();
  let mode = null;
  MODE_TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = MODE_TOKEN_RE.exec(source))) mode = match[1].toUpperCase();
  return mode;
}

/**
 * Rozbija nazwę grupy na „człon przed stopniem” oraz stopień i semestr.
 * @param {string} name np. „Prawo w biznesie i administracji, 1st 3sem Wyk N”
 */
function splitName(name) {
  const text = String(name || '');
  const degreeMatch = DEGREE_RE.exec(text);
  const semesterMatch = SEMESTER_RE.exec(text);
  const termMatch = TERM_RE.exec(text);

  const cuts = [tokenStart(degreeMatch), tokenStart(semesterMatch), tokenStart(termMatch)]
    .filter((i) => i >= 0);
  const cut = cuts.length ? Math.min(...cuts) : text.length;

  const subject = text.slice(0, cut).replace(/[,\s]+$/, '').trim();
  const semester = semesterMatch ? Number(semesterMatch[1]) : null;
  const degree = normalizeDegree(degreeMatch?.[1] || null);

  return {
    subject,
    semester: Number.isInteger(semester) && semester > 0 ? semester : null,
    degree,
    mode: modeFromName(text),
  };
}

/**
 * Dzieli człon przed stopniem na specjalność i skrót kierunku macierzystego.
 *   „KzK (BW)”                          → { specialty: 'KzK', parent: 'BW' }
 *   „Administracja, …”                  → { specialty: null, parent: null }
 */
function splitSpecialty(subject, field) {
  const text = String(subject || '').trim();
  const parentMatch = PARENT_RE.exec(text);
  const bare = parentMatch ? text.slice(0, parentMatch.index).trim() : text;
  const parent = parentMatch ? parentMatch[1].trim() : null;
  const normalized = normalizeText(bare);

  // Bez nazwy (albo z jedno-/dwuliterowym śmieciem) nie ma czego wybierać.
  if (normalized.length < 3) return { specialty: null, parent };
  // Ten sam kierunek zapisany skrótem lub z literówką — to nie specjalność.
  if (isSameProgram(bare, field)) return { specialty: null, parent };
  return { specialty: bare, parent };
}

/** Rok studiów z numeru semestru: 1sem+2sem → 1, 3sem+4sem → 2, … */
function yearOfStudy(semester) {
  if (!Number.isInteger(semester) || semester < 1) return null;
  return Math.ceil(semester / 2);
}

/**
 * Tryb z kolumny „Toki nauki”: „Informatyka N lic. 3.00 2025/2026 Zima” → N.
 *
 * Część grup nie ma litery trybu w nazwie (np. „Administracja samorządowa
 * 2st 3sem Wyk”), ale tok zawsze ją podaje. Gdy toki są sprzeczne (ta sama
 * grupa w obu trybach), zostaje `null` — nie zgadujemy.
 */
function modeFromToki(text) {
  const letters = new Set();
  const re = /(?:^|[\s,])([NS])(?=[\s,])/g;
  let match;
  while ((match = re.exec(String(text || '')))) letters.add(match[1]);
  return letters.size === 1 ? [...letters][0] : null;
}

/**
 * Stopień z toków, w tym samym słowniku co z nazwy grupy:
 * lic./inż. → 1st, mgr → 2st, jmgr → jmgr, Podypl. → podypl.
 *
 * Uczelnia pisze w toku skrót rodzaju dyplomu („lic.”, „mgr”), a w nazwie
 * grupy poziom („1st”, „2st”) — dla użytkownika to ten sam podział, więc
 * trzymamy jeden kod, inaczej „I stopnia” i „licencjackie” byłyby dwiema
 * osobnymi wartościami w jednym polu.
 */
function degreeFromToki(text) {
  const found = new Set();
  const re = /(?:^|[\s,])(Podypl\.?|Jmgr|Lic|Inż|Inz|Mgr|Dr)(?![a-ząćęłńóśźż0-9])/gi;
  let match;
  while ((match = re.exec(String(text || '')))) {
    found.add(normalizeDegree(match[1]));
  }
  if (found.size !== 1) return null;
  const value = [...found][0];
  if (value === 'lic' || value === 'inż') return '1st';
  if (value === 'mgr') return '2st';
  return value;
}

/** Nabór (rok rozpoczęcia studiów) dla toku z roku akademickiego i roku studiów. */
function naborFromAcademicYear(ayStart, year) {
  const start = Number(ayStart);
  if (!Number.isFinite(start)) return null;
  const offset = Math.max(1, Number(year) || 1) - 1;
  return start - offset;
}

/** Rok akademicki planu dla wybranego naboru i roku studiów. */
function academicYearFromNabor(naborStart, year) {
  const start = Number(naborStart);
  if (!Number.isFinite(start)) return null;
  return start + (Math.max(1, Number(year) || 1) - 1);
}

/**
 * Dokłada wymiary do wpisu katalogu (wynik `normalizeEntry` z groups.js).
 * @param {{id:string, name:string, field:string, academicYears?:string[]}} entry
 * @param {{now?:Date}} [opts]
 */
function deriveDimensions(entry, { now = new Date() } = {}) {
  const name = String(entry?.name || entry?.code || '');
  const field = String(entry?.field || '').trim() || null;
  const { subject, semester, degree, mode } = splitName(name);
  const { specialty, parent } = splitSpecialty(subject, field);
  const year = yearOfStudy(semester);

  // Część grup nie ma trybu ani stopnia w nazwie — wtedy bierzemy je z toków.
  // Nazwa ma pierwszeństwo, bo to ona decyduje o numerze semestru.
  const toki = String(entry?.toki || '');

  // Lata akademickie z kolumny „Toki nauki”. Gdy ich brak (np. grupy Erasmus+,
  // które nie mają toków), przyjmujemy bieżący rok — inaczej grupa byłaby
  // nieosiągalna przez wybór naboru.
  //
  // Bieżący rok akademicki dokładamy zawsze: uczelnia nie dopisuje toku na
  // nowy rok od razu, a grupa jest w katalogu (czyli nadal obowiązuje). Bez
  // tego student 2. roku nie mógłby wybrać naboru na bieżący rok — lista
  // kończyła się na tokach sprzed roku (sprawdzone na 3sem/5sem informatyki).
  const currentLabel = academicYearLabel(currentAcademicYearStart(now));
  const years = [...new Set([...(Array.isArray(entry?.academicYears) ? entry.academicYears : []), currentLabel])];

  const nabory = [...new Set(years
    .map((label) => naborFromAcademicYear(academicYearStart(label), year))
    .filter((value) => value !== null))]
    .sort((a, b) => a - b);

  return {
    specialty,
    parent,
    degree: degree || degreeFromToki(toki),
    mode: mode || modeFromToki(toki),
    semester,
    year,
    nabory,
    academicYears: years,
  };
}

module.exports = {
  DEGREE_RE,
  SEMESTER_RE,
  academicYearFromNabor,
  academicYearLabel,
  academicYearStart,
  currentAcademicYearStart,
  degreeFromToki,
  deriveDimensions,
  isSameProgram,
  modeFromToki,
  naborFromAcademicYear,
  normalizeDegree,
  normalizeText,
  splitName,
  splitSpecialty,
  withinEditDistance,
  yearOfStudy,
};
