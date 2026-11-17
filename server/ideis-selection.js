'use strict';
/**
 * Wybór „jak na stronie uczelni”: kierunek → specjalność, ale w słowniku katalogu.
 *
 * Formularz ideis podaje nazwy oficjalne (np. „Inżynier aplikacji i systemów
 * chmurowych”), a katalog grup wyprowadza specjalność z nazwy grupy, więc bywa
 * skrótem („IAiSC”) albo ma dopisek w nawiasie („Kryminologia z kryminalistyką
 * (BW)”). Tutaj tłumaczymy jedno na drugie — **tylko po to, by ustawić wartość
 * filtra**; nazwę na ekranie bierzemy z listy uczelni.
 *
 * Kolejność ma znaczenie: najpierw porównujemy po usunięciu końcowego nawiasu
 * (uczelnia dopisuje w nim skrót kierunku), potem po skrótowcu (IAiSC), a na
 * końcu po początku nazwy (Erasmus+ Creative Media ⊂ Erasmus+ Creative Media Wyk S).
 * Pokrycie na pełnym katalogu sprawdza `scripts/check-ideis-selection.js`.
 */

const { normalizeText } = require('./dimensions');

/** Końcowy nawias z kodem kierunku: „… (BW)”, „… (FiR)”. */
function stripParenthetical(value) {
  return String(value || '').replace(/\s*\([^()]{1,24}\)\s*$/, '').trim();
}

/** Skrótowiec z pierwszych liter wyrazów („Inżynier aplikacji i systemów chmurowych” → IAiSC). */
function acronym(value) {
  return normalizeText(stripParenthetical(value))
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('');
}

/**
 * Czy dwie nazwy opisują tę samą specjalność?
 * @param {string} left nazwa z formularza uczelni
 * @param {string} right wartość z katalogu grup
 */
function sameName(left, right) {
  const a = normalizeText(stripParenthetical(left));
  const b = normalizeText(stripParenthetical(right));
  if (!a || !b) return false;
  if (a === b) return true;
  // Skrótowiec po jednej stronie: „IAiSC” ↔ „Inżynier aplikacji i systemów
  // chmurowych”, „KzK” ↔ „Kryminologia z kryminalistyką (BW)”.
  const acronymA = acronym(left);
  const acronymB = acronym(right);
  if (acronymA === b || acronymB === a) return true;
  if (acronymA.length >= 2 && acronymA === acronymB) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter >= 8 && (a.startsWith(b) || b.startsWith(a))) return true;
  return false;
}

/** Wartości unikalne w kolejności wystąpienia. */
function unique(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const key = value === null || value === undefined ? '' : String(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(String(value));
  }
  return out;
}

/**
 * Dopasowuje nazwę z formularza do wartości w katalogu.
 * @param {string} label
 * @param {string[]} values
 * @returns {string|null}
 */
function matchValue(label, values) {
  const exact = values.find((value) => normalizeText(stripParenthetical(value)) === normalizeText(stripParenthetical(label)));
  if (exact) return exact;
  const acronymMatch = values.find((value) => sameName(value, label));
  return acronymMatch || null;
}

/** Grupy katalogu należące do kierunku (porównanie po nazwie pola „Kierunek”). */
function groupsOfField(groups, field) {
  return (groups || []).filter((group) => group && group.field === field);
}

/**
 * Kierunki do wyboru: lista z formularza uczelni przetłumaczona na pole
 * „Kierunek” katalogu. Kierunki, których nie ma w katalogu, zostają z nazwą
 * z formularza i zerem grup (picker pokaże, że nie ma tam planu).
 *
 * @param {object[]} groups wpisy katalogu (pełne, z server/groups.js)
 * @param {object[]} siteItems pozycje z formularza [{id,label}]
 */
function kierunkiFor(groups, siteItems) {
  const fields = unique((groups || []).map((group) => group.field));
  const used = new Set();
  const items = [];
  for (const site of siteItems || []) {
    const field = fields.find((value) => normalizeText(value) === normalizeText(site.label));
    if (field) used.add(field);
    items.push({
      id: site.id,
      label: site.label,
      field: field || site.label,
      missing: !field,
      groups: field ? groupsOfField(groups, field).length : 0,
    });
  }
  // Kierunki, których formularz nie wymienia (np. studia podyplomowe), zostają
  // poza listą — aplikacja obsługuje tylko wydział wskazany w FACULTY.
  return items;
}

/**
 * Specjalności kierunku: najpierw aktualna oferta z formularza (z tłumaczeniem
 * na wartość filtra), potem wartości z katalogu, których formularz nie wymienia
 * (starsze roczniki bywają w planach pod dawnymi nazwami).
 *
 * @param {object[]} groups wpisy katalogu
 * @param {string} field pole „Kierunek” wybranego kierunku
 * @param {object[]} siteItems pozycje z formularza [{id,label}]
 */
function specjalnosciFor(groups, field, siteItems) {
  const pool = groupsOfField(groups, field);
  const values = unique(pool.map((group) => group.specialty));
  const used = new Set();
  const items = [];
  for (const site of siteItems || []) {
    const value = matchValue(site.label, values);
    if (value) used.add(value);
    items.push({
      id: site.id,
      label: site.label,
      value: value || null,
      source: 'site',
      groups: value ? pool.filter((group) => group.specialty === value).length : 0,
    });
  }
  for (const value of values) {
    if (used.has(value)) continue;
    items.push({
      id: `katalog:${value}`,
      label: value,
      value,
      source: 'catalog',
      groups: pool.filter((group) => group.specialty === value).length,
    });
  }
  return items;
}

module.exports = {
  acronym,
  groupsOfField,
  kierunkiFor,
  matchValue,
  sameName,
  specjalnosciFor,
  stripParenthetical,
  unique,
};
