'use strict';
/**
 * Dostępność pól kreatora: roczniki kierunku, specjalności rocznika i tryby.
 *
 * Kolejność kroków jest jak w formularzu uczelni, a każda lista pokazuje tylko
 * to, co naprawdę ma grupy w katalogu:
 *
 *   kierunek → rocznik (nabór) → specjalność (albo „bez specjalności”) → tryb
 *
 * Rocznik to rok, w którym zaczynałeś studia. Z rocznika i z bieżącego roku
 * akademickiego wynika rok studiów (`rok = ay − rocznik + 1`), a z roku studiów
 * i daty — semestr (`public/wizard.js`). Dlatego grupa należy do rocznika tylko
 * wtedy, gdy **oba** warunki się zgadzają: ma ten rocznik na liście naborów
 * i jej rok studiów to dokładnie ten wyliczony.
 *
 * Bez tego warunku lista roczników pokazywała całą historię katalogu (2017,
 * 2018, …), bo każda grupa dostaje dopisany bieżący rok akademicki
 * (`server/dimensions.js`), a wybór nieaktualnego rocznika prowadził w pustkę.
 *
 * Semestr nie jest osobnym filtrem tych list: specjalność uruchomiona tylko
 * w semestrze letnim musi być widoczna także zimą, inaczej nie dałoby się jej
 * wybrać. Semestr zawęża dopiero listę planów do wyboru (`PlanWizard`).
 */

const { academicYearStart, currentAcademicYearStart } = require('./dimensions');
const { groupsOfField, specjalnosciFor } = require('./ideis-selection');
const { NONE, ANY } = require('../public/selection');

/** Lista naborów grupy jako liczby (grupa bez toków ma pustą listę). */
function cohortsOf(group) {
  return Array.isArray(group && group.nabory) ? group.nabory.map(Number).filter(Number.isFinite) : [];
}

/**
 * Najnowszy tok grupy — **bez** dopisanego bieżącego roku akademickiego.
 * `null` dla grup bez toków (np. Erasmus+), które nie mają jak się zestarzeć.
 */
function newestTok(group) {
  const years = (Array.isArray(group && group.tokiYears) ? group.tokiYears : [])
    .map((label) => academicYearStart(label))
    .filter((year) => Number.isFinite(year));
  return years.length ? Math.max(...years) : null;
}

/** Bieżący rok akademicki — domyślny, gdy endpoint nie dostanie `ay`. */
function academicYearOf(ay, now) {
  const value = Number(ay);
  return Number.isFinite(value) && value >= 2000 ? value : currentAcademicYearStart(now || new Date());
}

/**
 * Czy grupa obsługuje jeszcze ten rocznik? Grupa z tokiem starszym niż rocznik
 * pochodzi z zakończonego cyklu — jej plan ma daty sprzed lat, więc nie
 * proponujemy jej w wyborze. Tolerancja w drugą stronę (tok nowszy niż rocznik)
 * jest w porządku: uczelnia publikuje nowy tok zanim dopisze go wszystkim grupom.
 */
function servesCohort(group, cohort) {
  const newest = newestTok(group);
  return newest === null || newest >= cohort;
}

/** Czy grupa należy do rocznika w danym roku akademickim (rok studiów musi się zgadzać). */
function inCohort(group, nabor, ay) {
  if (nabor === ANY || nabor === null || nabor === undefined) return true;
  const list = cohortsOf(group);
  if (nabor === NONE) return list.length === 0;
  const wanted = Number(nabor);
  if (!Number.isFinite(wanted) || !list.includes(wanted)) return false;
  const year = Number(group.year);
  if (!Number.isFinite(year)) return false;
  return year === academicYearOf(ay) - wanted + 1 && servesCohort(group, wanted);
}

/** Grupy kierunku w danym roczniku (bez filtra semestru — patrz nagłówek). */
function cohortPool(groups, field, nabor, { ay } = {}) {
  return groupsOfField(groups, field).filter((group) => inCohort(group, nabor, ay));
}

/**
 * Roczniki, które mają grupy na kierunku — od najnowszego.
 * @param {object[]} groups katalog
 * @param {string} field pole „Kierunek”
 * @param {{ay?:number|string}} [opts] rok akademicki wyboru
 * @returns {{value:string, groups:number}[]}
 */
function cohorts(groups, field, { ay } = {}) {
  const academicYear = academicYearOf(ay);
  const counts = new Map();
  for (const group of groupsOfField(groups, field)) {
    const year = Number(group.year);
    for (const value of cohortsOf(group)) {
      const expected = academicYear - value + 1;
      if (!Number.isFinite(expected) || expected < 1 || expected > 9) continue;
      if (!Number.isFinite(year) || year !== expected) continue;
      if (!servesCohort(group, value)) continue;
      counts.set(String(value), (counts.get(String(value)) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, groups: count }))
    .sort((a, b) => Number(b.value) - Number(a.value));
}

/**
 * Specjalności dostępne w roczniku: oferta z formularza uczelni przetłumaczona
 * na wartości katalogu + starsze nazwy, które są tylko w planach.
 *
 * Liczniki `groups` są **zawężone do kierunku i rocznika**, więc widać, która
 * specjalność naprawdę ma zajęcia w tym wyborze. Pozycje z zerem zostają
 * w odpowiedzi, ale klient ich nie pokazuje — wie dzięki temu, ile pominął.
 *
 * @param {object[]} groups katalog
 * @param {string} field pole „Kierunek”
 * @param {string} nabor rocznik ('' = dowolny)
 * @param {object[]} siteItems pozycje z formularza uczelni [{id,label}]
 * @param {{ay?:number|string}} [opts]
 */
function specsFor(groups, field, nabor, siteItems, { ay } = {}) {
  const pool = cohortPool(groups, field, nabor, { ay });
  const items = specjalnosciFor(pool, field, siteItems);
  return {
    items,
    /** Ile grup w tym roczniku nie ma specjalności (1. rok zwykle wszystkie). */
    noSpecGroups: pool.filter((group) => !group.specialty).length,
    groups: pool.length,
  };
}

/**
 * Tryby studiów dostępne dla wyboru — tylko te, które mają grupy.
 * @returns {{value:string, groups:number}[]}
 */
function modesFor(groups, field, nabor, spec, { ay } = {}) {
  const pool = cohortPool(groups, field, nabor, { ay })
    .filter((group) => (!spec || spec === ANY ? true : group.specialty === spec));
  const counts = new Map();
  for (const group of pool) {
    if (!group.mode) continue;
    counts.set(group.mode, (counts.get(group.mode) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, groups: count }))
    .sort((a, b) => String(a.value).localeCompare(String(b.value), 'pl'));
}

module.exports = {
  academicYearOf,
  cohortPool,
  cohorts,
  cohortsOf,
  inCohort,
  modesFor,
  specsFor,
};
