'use strict';
/**
 * Porównywanie dwóch wersji planu — co się zmieniło między pobraniami.
 */

/** Pola, których zmiana oznacza „te same zajęcia, ale inne szczegóły”. */
function detailsSignature(c) {
  return JSON.stringify([
    c.start,
    c.end,
    c.mode,
    c.roomRaw || (c.room && c.room.raw) || '',
    c.lecturer || '',
    c.notes || '',
    c.passForm || '',
    c.subject || '',
    (c.form && c.form.raw) || '',
  ]);
}

/**
 * @returns {{
 *   added: object[], removed: object[], changed: {before: object, after: object}[],
 *   counts: {added: number, removed: number, changed: number}
 * }}
 */
function diffPlans(prev, next) {
  if (!prev) return { added: [], removed: [], changed: [], counts: { added: 0, removed: 0, changed: 0 } };

  const prevById = new Map(prev.classes.map((c) => [c.id, c]));
  const nextById = new Map(next.classes.map((c) => [c.id, c]));

  const changed = [];

  // 1) Te same zajęcia (identyfikator bez zmian), ale inna godzina, sala, prowadzący…
  for (const [id, before] of prevById) {
    const after = nextById.get(id);
    if (!after) continue;
    if (detailsSignature(before) !== detailsSignature(after)) {
      changed.push({ before, after });
    }
  }

  // 2) Zniknęły / pojawiły się
  let added = next.classes.filter((c) => !prevById.has(c.id));
  let removed = prev.classes.filter((c) => !nextById.has(c.id));

  // 3) Przesunięcie w czasie zmienia identyfikator — spróbujmy sparować
  //    „usunięte” z „dodanymi” (ten sam dzień, przedmiot, grupa i uruchomienie).
  const usedAdded = new Set();
  const usedRemoved = new Set();

  for (const before of removed) {
    const match = added.find((after) => !usedAdded.has(after.id)
      && after.date === before.date
      && after.runId === before.runId
      && after.group === before.group
      && after.subject === before.subject);

    if (match) {
      usedAdded.add(match.id);
      usedRemoved.add(before.id);
      changed.push({ before, after: match });
    }
  }

  added = added.filter((c) => !usedAdded.has(c.id));
  removed = removed.filter((c) => !usedRemoved.has(c.id));

  return {
    added,
    removed,
    changed,
    counts: { added: added.length, removed: removed.length, changed: changed.length },
  };
}

/** Krótki opis zmiany do wyświetlenia w interfejsie. */
function describeChange(entry) {
  const { before, after } = entry;
  const bits = [];
  if (before.start !== after.start || before.end !== after.end) {
    bits.push(`${before.start}–${before.end} → ${after.start}–${after.end}`);
  }
  const beforeRoom = before.mode === 'zdalne' ? 'zdalnie' : (before.room?.label || '—');
  const afterRoom = after.mode === 'zdalne' ? 'zdalnie' : (after.room?.label || '—');
  if (beforeRoom !== afterRoom) bits.push(`sala ${beforeRoom} → ${afterRoom}`);
  if (before.lecturer !== after.lecturer) bits.push(`prowadzący ${before.lecturer} → ${after.lecturer}`);
  return bits.join(' · ') || 'szczegóły zajęć';
}

module.exports = { diffPlans, describeChange };
