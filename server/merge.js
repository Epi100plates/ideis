'use strict';
/**
 * Plan z kilku grup naraz: wykłady (wspólne dla całego roku) + własna grupa
 * ćwiczeniowa + laboratoria (i ewentualnie lektorat/warsztat).
 *
 * Dlaczego nie wystarczy pokazać planu jednej grupy: strona uczelni dla grupy
 * ćwiczeniowej pokazuje też **podgrupy** („Ćw1” zawiera Lab1A i Lab1B), a dla
 * grupy wykładowej — wszystkie grupy roku. Dla studenta to za dużo i za mało
 * zarazem: są w tym cudze laboratoria, a brakuje wybranej podgrupy innego
 * przedmiotu. Dlatego bierzemy kilka planów i zostawiamy z nich tylko zajęcia
 * przypisane **do wybranych grup** — numer grupy jest w komórce „Grupy” linkiem
 * (`/Plany/PlanyGrup/20736`), więc `parser` zapisuje go jako `groupIds`.
 *
 * Deduplikacja po `class.id` (data + godziny + „Id uruch.” + forma + grupa) —
 * ta sama lekcja pobrana z planu wykładu i z planu ćwiczeń liczy się raz.
 */

const crypto = require('node:crypto');
const { summarize } = require('./parser');

/** Zbiór numerów grup w formie stringów (numer grupy bywa liczbą w JSON-ie). */
function idSet(groupIds) {
  return new Set((groupIds || []).map((id) => String(id).trim()).filter(Boolean));
}

function belongsToAny(cls, ids) {
  const list = Array.isArray(cls?.groupIds) ? cls.groupIds : [];
  return list.some((id) => ids.has(String(id)));
}

/** Czy plan pochodzi z parsera, który zapisuje `groupIds` (stare wpisy cache — nie). */
function hasGroupIds(plan) {
  return Boolean(plan?.classes?.length)
    && plan.classes.every((cls) => Array.isArray(cls.groupIds));
}

/**
 * Scala plany wybranych grup.
 *
 * @param {object[]} plans plany poszczególnych grup (wynik `getPlan().plan`)
 * @param {string[]} groupIds wybrane numery grup (pierwszy = plan bazowy)
 * @returns {object} plan w tym samym kształcie co plan jednej grupy
 */
function mergePlans(plans, groupIds) {
  const ids = idSet(groupIds);
  const base = plans.find(Boolean);
  const filtered = plans.some((plan) => plan && hasGroupIds(plan));

  const seen = new Set();
  const classes = [];
  let dropped = 0;
  for (const plan of plans) {
    if (!plan || !Array.isArray(plan.classes)) continue;
    for (const cls of plan.classes) {
      if (filtered && !belongsToAny(cls, ids)) {
        dropped += 1;
        continue;
      }
      if (seen.has(cls.id)) continue;
      seen.add(cls.id);
      classes.push(cls);
    }
  }
  classes.sort((a, b) => (a.startISO < b.startISO ? -1 : a.startISO > b.startISO ? 1 : a.start.localeCompare(b.start)));

  const merged = summarize(classes, {
    ...(base?.meta || {}),
    source: null,
    groupId: (groupIds || [])[0] ? String(groupIds[0]) : null,
    groupIds: [...ids],
    groupName: null,
    // Stary cache (bez `groupIds`) nie pozwala odfiltrować cudzych grup —
    // wtedy oddajemy sumę planów i mówimy o tym wprost, zamiast zgadywać.
    unfiltered: !filtered,
    droppedClasses: dropped,
    fetchedAt: new Date().toISOString(),
    sources: plans.map((plan) => ({
      groupId: plan?.meta?.groupId || null,
      groupName: plan?.meta?.groupName || null,
      fetchedAt: plan?.meta?.fetchedAt || null,
      classes: plan?.meta?.classes || 0,
    })),
  });
  merged.meta.groupName = merged.meta.sources
    .map((source) => source.groupName)
    .filter(Boolean)
    .join(' + ') || null;
  return merged;
}

/**
 * Odcisk scalonego planu — odciski treści poszczególnych grup.
 *
 * Nie da się użyć numerów wersji: są licznikami w pamięci procesu i po restarcie
 * serwera wracają do #1, więc klient nigdy nie zauważyłby zmiany. Odcisk zmienia
 * się dokładnie wtedy, gdy zmieni się treść którejkolwiek grupy.
 */
function mergedFingerprint(stamps = []) {
  const key = (stamps || []).map(String).sort().join('|');
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

/**
 * Identyfikator wersji scalonego planu — stabilny dla (grupy, rok akademicki),
 * ale zmienia się, gdy zmieni się treść którejkolwiek grupy (`stamps` to odciski
 * treści planów). Dzięki temu odświeżanie w tle nie pobiera planu w kółko,
 * a po zmianie u uczelni klient od razu widzi nowy.
 */
function mergedVersionId(groupIds, ay, stamps = []) {
  const key = [
    [...idSet(groupIds)].sort().join(','),
    `@${ay ?? 'current'}`,
    `#${(stamps || []).map(String).sort().join('|')}`,
  ].join('');
  // Numer, nie hex: pole `version.id` w API (i w aplikacji Android) jest liczbą.
  // 48 bitów mieści się w `Long` i w bezpiecznej liczbie całkowitej JS.
  return Number.parseInt(crypto.createHash('sha1').update(key).digest('hex').slice(0, 12), 16);
}

module.exports = {
  belongsToAny,
  hasGroupIds,
  idSet,
  mergePlans,
  mergedFingerprint,
  mergedVersionId,
};
