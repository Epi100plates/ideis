'use strict';
/**
 * Dopasowanie grup do wyboru użytkownika — wspólne dla przeglądarki i serwera.
 *
 * Ten plik jest ładowany dwa razy:
 *   - w przeglądarce jako <script src="/selection.js"> → window.PlanSelection,
 *   - w Node przez require('../public/selection.js') (serwer i testy).
 *
 * Dzięki temu reguła „czy grupa pasuje do wyboru” ma jedno miejsce. Serwer
 * pozostaje właścicielem wyprowadzania wymiarów (server/dimensions.js), a tutaj
 * jest tylko porównywanie gotowych, policzonych już pól.
 *
 * Wybór (selection) to obiekt z wartościami z pól <select> — zawsze stringi:
 *   { nabor: '2026', field: 'Informatyka', spec: '—', year: '1', degree: '1st', mode: 'N' }
 *
 *   ''   — dowolna wartość (pole „— dowolny —”, brak filtra)
 *   '—'  — grupy bez tego wymiaru (np. Erasmus+ bez stopnia, 1. rok bez specjalności)
 *   inne — konkretna wartość
 *
 * Grupa (po skróceniu kluczy przez serwer):
 *   { id, c: kod, n: nazwa, f: kierunek, s: specjalność|null, d: stopień|null,
 *     m: tryb|null, y: rok studiów|null, b: [nabory], sem: semestr|null }
 */

(function initSelection(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.PlanSelection = api;
}(typeof self !== 'undefined' ? self : this, function buildSelection() {
  /** Pole „dowolny/-a” — bez filtrowania. */
  const ANY = '';
  /** Wartość oznaczająca „grupy bez tego wymiaru”. */
  const NONE = '—';

  const DIMENSIONS = ['nabor', 'field', 'spec', 'year', 'degree', 'mode'];

  /**
   * Rok i nabór to jedna informacja o roczniku: rok akademicki = nabór +
   * (rok studiów − 1). Gdyby liczyć ich opcje osobno, wybór „nabór 2026”
   * zablokowałby rok 2 (dla tego naboru istnieje tylko 1. rok) i picker
   * stałby się ślepą uliczką. Dlatego te dwa wymiary luzujemy razem.
   */
  const COUPLED = { nabor: ['year'], year: ['nabor'] };

  /**
   * Kierunek jest nawigacją po całym katalogu, więc jego lista nigdy nie jest
   * zawężana przez pozostałe pola — inaczej przy „I stopnia, niestacjonarne”
   * nie dałoby się przejść na kierunek, który ma tylko jednolite magisterskie.
   */
  const ALWAYS_WIDE = ['field'];

  /**
   * Pełny wpis katalogu (z server/groups.js) → forma porównawcza.
   * Krótkie klucze, bo katalog to ~2100 grup i leci do przeglądarki.
   * Funkcja jest idempotentna: wpis już skrócony przechodzi bez zmian.
   */
  function toWire(group) {
    const source = group || {};
    return {
      id: String(source.id),
      c: source.code ?? source.c ?? '',
      n: source.name ?? source.n ?? '',
      f: source.field ?? source.f ?? null,
      s: source.specialty ?? source.s ?? null,
      d: source.degree ?? source.d ?? null,
      m: source.mode ?? source.m ?? null,
      y: source.year ?? source.y ?? null,
      b: source.nabory ?? source.b ?? [],
      sem: source.semester ?? source.sem ?? null,
      k: source.kind ?? source.k ?? null,
      num: source.number ?? source.num ?? null,
    };
  }

  function matchText(value, wanted) {
    if (wanted === ANY || wanted === undefined || wanted === null) return true;
    if (wanted === NONE) return value === null || value === undefined || value === '';
    return String(value) === String(wanted);
  }

  function matchNumber(value, wanted) {
    if (wanted === ANY || wanted === undefined || wanted === null) return true;
    if (wanted === NONE) return value === null || value === undefined;
    return Number(value) === Number(wanted);
  }

  function matchNabor(nabory, wanted) {
    if (wanted === ANY || wanted === undefined || wanted === null) return true;
    const list = Array.isArray(nabory) ? nabory : [];
    if (wanted === NONE) return list.length === 0;
    return list.map(Number).includes(Number(wanted));
  }

  /** Czy grupa pasuje do wyboru (wszystkie wymiary naraz). */
  function matches(group, selection) {
    if (!group) return false;
    if (!selection) return true;
    if (!matchNabor(group.b, selection.nabor)) return false;
    if (!matchText(group.f, selection.field)) return false;
    if (!matchText(group.s, selection.spec)) return false;
    if (!matchNumber(group.y, selection.year)) return false;
    if (!matchText(group.d, selection.degree)) return false;
    if (!matchText(group.m, selection.mode)) return false;
    // Semestr nie jest polem pickera — wylicza go kreator z naboru i daty
    // (`wizard.js`). Gdy go nie ma, filtr go nie zawęża (stare linki).
    if (!matchNumber(group.sem, selection.sem)) return false;
    return true;
  }

  /** Grupy pasujące do wyboru — kolejność z katalogu (posortowana po stronie serwera). */
  function filter(groups, selection) {
    return (groups || []).filter((group) => matches(group, selection));
  }

  function pushUnique(list, value) {
    const seen = list.some((item) => (item === null ? value === null : String(item) === String(value)));
    if (!seen) list.push(value);
  }

  function sortValues(key, values) {
    const nonNull = values.filter((value) => value !== null && value !== undefined);
    const sorted = key === 'nabor' || key === 'year'
      ? nonNull.sort((a, b) => Number(b) - Number(a))
      : nonNull.sort((a, b) => String(a).localeCompare(String(b), 'pl', { sensitivity: 'base' }));
    return values.some((value) => value === null) ? [null, ...sorted] : sorted;
  }

  /**
   * Wartości dostępne w każdym wymiarze dla bieżącego wyboru.
   * Wymiar jest przy liczeniu swoich opcji „poluzowany”, więc lista nie zubaża
   * się o wartość, którą użytkownik właśnie wybrał.
   */
  function facets(groups, selection) {
    const result = {};
    for (const key of DIMENSIONS) {
      const relaxed = { ...(selection || {}), [key]: ANY };
      for (const other of COUPLED[key] || []) relaxed[other] = ANY;
      if (ALWAYS_WIDE.includes(key)) {
        for (const other of DIMENSIONS) relaxed[other] = ANY;
      }
      const pool = filter(groups, relaxed);
      const values = [];
      for (const group of pool) {
        if (key === 'nabor') {
          const list = Array.isArray(group.b) ? group.b : [];
          if (!list.length) pushUnique(values, null);
          for (const value of list) pushUnique(values, Number(value));
        } else if (key === 'field') {
          pushUnique(values, group.f || null);
        } else if (key === 'spec') {
          pushUnique(values, group.s || null);
        } else if (key === 'year') {
          pushUnique(values, group.y === null || group.y === undefined ? null : Number(group.y));
        } else if (key === 'degree') {
          pushUnique(values, group.d || null);
        } else if (key === 'mode') {
          pushUnique(values, group.m || null);
        }
      }
      result[key] = sortValues(key, values);
    }
    return result;
  }

  /** Ludzki opis wyboru — używany w podtytule pickera i w tytule strony. */
  function describe(selection, labels = {}) {
    const parts = [];
    const nabor = selection?.nabor;
    if (nabor && nabor !== NONE) {
      const start = Number(nabor);
      parts.push(Number.isFinite(start) ? `nabór ${start}/${start + 1}` : `nabór ${nabor}`);
    }
    if (selection?.field) parts.push(selection.field);
    if (selection?.spec && selection.spec !== NONE) parts.push(selection.spec);
    if (selection?.spec === NONE) parts.push('bez specjalności');
    if (selection?.year && selection.year !== NONE) parts.push(`${selection.year}. rok`);
    if (selection?.degree && selection.degree !== NONE) {
      parts.push(labels.degree?.[selection.degree] || selection.degree);
    }
    if (selection?.mode && selection.mode !== NONE) {
      parts.push(labels.mode?.[selection.mode] || selection.mode);
    }
    return parts.join(' · ');
  }

  return {
    ANY,
    NONE,
    DIMENSIONS,
    describe,
    facets,
    filter,
    matches,
    toWire,
  };
}));
