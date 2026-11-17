'use strict';
/**
 * Kreator wyboru planu — kroki jak w wyszukiwarce planów uczelni:
 *
 *   rocznik → kierunek → specjalność („Pomiń specjalność”) → tryb studiów
 *
 * Rocznik jest pierwszy, bo zawęża listę kierunków do tych, które naprawdę
 * mają grupy w tym roku. Kierunków są dziesiątki, więc szukanie po kilku
 * literach jest częścią kroku „kierunek” (`rankKierunki`).
 *
 * Dopiero po wybraniu wszystkich kroków wiadomo, który plan bazowy wczytać
 * (grupa wykładowa z bieżącego semestru), a potem można dodać własne grupy
 * ćwiczeniowe i laboratoria. Ten plik zawiera **czystą logikę** kroków —
 * liczenie semestru z naboru i daty, roczniki i kierunki rocznika, szukanie
 * po literach, wybór grup bazowych i grup do dodania. Rysowanie arkuszy
 * zostaje w `app.js`, a testy (`scripts/self-test.js`) sprawdzają te funkcje.
 *
 * Ładowany jak `selection.js`: w przeglądarce jako `window.PlanWizard`,
 * w Node przez `require('../public/wizard.js')`.
 */

(function initWizard(root, factory) {
  const api = factory(root && root.PlanSelection);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.PlanWizard = api;
}(typeof self !== 'undefined' ? self : this, function buildWizard(PS) {
  const selection = PS || (typeof require === 'function' ? require('./selection') : null);

  /**
   * Semestr roku akademickiego z daty: październik–luty to semestr zimowy
   * (nieparzysty), marzec–wrzesień — letni (parzysty). Wrzesień bywa jeszcze
   * sesją poprawkową poprzedniego roku, ale plan i tak pokazuje to, co jest.
   */
  function seasonOf(date) {
    const month = (date instanceof Date ? date : new Date(date)).getMonth() + 1;
    return month >= 10 || month <= 2 ? 'winter' : 'summer';
  }

  /**
   * Rok studiów i semestr dla naboru w danym roku akademickim.
   *   nabór 2024, rok akademicki 2026/2027, zima → 3. rok, semestr 5
   * @returns {{year:number, sem:number, season:string}|null}
   */
  function semesterFor(academicYearStart, nabor, date = new Date()) {
    const ay = Number(academicYearStart);
    const start = Number(nabor);
    if (!Number.isFinite(ay) || ay < 2000) return null;
    if (!Number.isFinite(start) || start < 2000) return null;
    const year = ay - start + 1;
    if (year < 1 || year > 9) return null;
    const season = seasonOf(date);
    const sem = season === 'winter' ? (2 * year) - 1 : 2 * year;
    return { year, sem, season };
  }

  /** Wybór z uzupełnionym rokiem i semestrem (semestr jest filtrem, nie polem). */
  function withSemester(candidate, academicYearStart, date = new Date()) {
    const info = semesterFor(academicYearStart, candidate && candidate.nabor, date);
    if (!info) return { ...candidate, year: '', sem: '' };
    return { ...candidate, year: String(info.year), sem: String(info.sem) };
  }

  // ------------------------------------------- rocznik i kierunek rocznika
  //
  // Serwer liczy `nabory` per kierunek według reguły „rok studiów się zgadza,
  // a tok nie jest starszy niż rocznik” (`server/ideis-options.js`). Tutaj
  // tylko składamy z tego dwie listy: roczniki całego wydziału i kierunki
  // wybranego rocznika. Dzięki temu po pobraniu listy kierunków wszystkie
  // kolejne filtry działają lokalnie, bez żądań do serwera.

  /** Litery z ogonkami → bez ogonków (wpisane „inzynier” ma trafić w „Inżynier”). */
  const FOLD = {
    ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  };

  /** Tekst do porównania: małe litery i bez ogonków. */
  function foldText(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/[ąćęłńóśźż]/g, (char) => FOLD[char]);
  }

  /**
   * Jak dobrze tekst pasuje do wpisanych liter:
   * 3 = od początku, 2 = początek słowa, 1 = w środku, 0 = brak trafienia.
   */
  function searchScore(text, query) {
    const needle = foldText(query).trim();
    if (!needle) return 1;
    const hay = foldText(text);
    if (hay.startsWith(needle)) return 3;
    const at = hay.indexOf(needle);
    if (at < 0) return 0;
    return /[^a-z0-9]/.test(hay[at - 1]) ? 2 : 1;
  }

  /**
   * Kierunki pasujące do wpisanych kilku liter — najlepsze dopasowania
   * najpierw, a w obrębie tej samej oceny alfabetycznie. Porównujemy też nazwę
   * pola z katalogu, bo bywa inna niż oficjalna nazwa z formularza uczelni.
   *
   * @param {object[]} items pozycje z `/api/ideis/kierunki`
   * @param {string} query wpisane litery ('' = bez filtra)
   */
  function rankKierunki(items, query) {
    return (items || [])
      .map((item) => ({
        item,
        score: searchScore(`${item.label || ''} ${item.field || ''}`, query),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score
        || String(a.item.label || '').localeCompare(String(b.item.label || ''), 'pl', { sensitivity: 'base' }))
      .map((row) => row.item);
  }

  /**
   * Roczniki całego katalogu — suma list `nabory` po kierunkach, od najnowszego.
   * `fields` to liczba kierunków w roczniku, `groups` — liczba grup.
   *
   * @param {object[]} kierunki pozycje z `/api/ideis/kierunki`
   * @returns {{value:string, fields:number, groups:number}[]}
   */
  function cohortIndex(kierunki) {
    const found = new Map();
    for (const item of kierunki || []) {
      for (const entry of item.nabory || []) {
        if (!entry || entry.value === null || entry.value === undefined || entry.value === '') continue;
        const value = String(entry.value);
        const row = found.get(value) || { value, fields: 0, groups: 0 };
        row.fields += 1;
        row.groups += Number(entry.groups) || 0;
        found.set(value, row);
      }
    }
    return [...found.values()].sort((a, b) => Number(b.value) - Number(a.value));
  }

  /**
   * Kierunki z grupami w danym roczniku — alfabetycznie, z licznikiem grup
   * **z tego rocznika** (nie z całego katalogu).
   */
  function kierunkiInCohort(kierunki, nabor) {
    const wanted = String(nabor == null ? '' : nabor);
    if (!wanted) return [];
    const out = [];
    for (const item of kierunki || []) {
      const entry = (item.nabory || []).find((row) => row && String(row.value) === wanted);
      if (!entry) continue;
      out.push({ ...item, groups: Number(entry.groups) || 0 });
    }
    return out.sort((a, b) => String(a.label || '')
      .localeCompare(String(b.label || ''), 'pl', { sensitivity: 'base' }));
  }

  /**
   * Kroki, które w danym wyborze już mają sens — z tego ekran wyboru wie,
   * które wiersze pokazać. Kolejny krok pojawia się dopiero po wybraniu
   * poprzedniego, więc na starcie jest tylko rocznik.
   */
  function stepsFor(selection) {
    const sel = selection || {};
    const steps = ['nabor'];
    if (sel.nabor) steps.push('kierunek');
    if (sel.field) steps.push('spec', 'tryb');
    if (sel.mode) steps.push('plan');
    return steps;
  }

  function matching(groups, candidate) {
    return selection ? selection.filter(groups, candidate) : [];
  }

  /**
   * Plany bazowe (grupy wykładowe) dla wyboru. Wykład jest wspólny dla całego
   * roku, więc to on jest punktem wyjścia; gdy kierunek nie ma grupy
   * wykładowej w tym semestrze, pokazujemy pierwsze pasujące grupy, żeby dało
   * się w ogóle wejść w plan.
   */
  function baseCandidates(groups, candidate) {
    const pool = matching(groups, candidate);
    const lectures = pool.filter((group) => group.k === 'Wyk');
    if (lectures.length) return { groups: lectures, relaxed: false };
    const firstSemester = pool.filter((group) => !candidate.sem || String(group.sem) === String(candidate.sem));
    if (pool.length) return { groups: firstSemester.length ? firstSemester : pool, relaxed: true };
    return { groups: [], relaxed: false };
  }

  /**
   * Grupy, które można dodać do planu: wszystko **poza wykładami** (są takie
   * same dla wszystkich) i poza grupami już dodanymi.
   *
   * @param {object[]} groups katalog
   * @param {object} candidate wybór (kierunek/specjalność/nabór/tryb/semestr)
   * @param {string[]} planGroups numery grup już w planie
   */
  function addableGroups(groups, candidate, planGroups = []) {
    const used = new Set((planGroups || []).map(String));
    return matching(groups, candidate)
      .filter((group) => group.k !== 'Wyk' && !used.has(String(group.id)))
      .sort((a, b) => {
        const kind = String(a.k || '').localeCompare(String(b.k || ''), 'pl');
        if (kind) return kind;
        return String(a.num || '').localeCompare(String(b.num || ''), 'pl', { numeric: true });
      });
  }

  const KIND_LABELS = {
    'Ćw': 'Ćwiczenia',
    Lab: 'Laboratorium',
    Sem: 'Seminarium',
    Lekt: 'Lektorat',
    Warszt: 'Warsztat',
    Proj: 'Projekt',
    Prak: 'Praktyka',
    Inf: 'Informatyka',
    Egz: 'Egzamin',
    eLear: 'e-learning',
    KURS: 'Kurs',
  };

  function kindLabel(kind) {
    return KIND_LABELS[kind] || kind || 'Zajęcia';
  }

  return {
    KIND_LABELS,
    addableGroups,
    baseCandidates,
    cohortIndex,
    foldText,
    kierunkiInCohort,
    kindLabel,
    matching,
    rankKierunki,
    searchScore,
    seasonOf,
    semesterFor,
    stepsFor,
    withSemester,
  };
}));
