'use strict';
/**
 * Historia wersji planu trzymana w pamięci procesu.
 *
 * Zasady:
 *  - nowa wersja powstaje TYLKO wtedy, gdy zmieniła się treść planu (odcisk SHA-1),
 *  - samo sprawdzenie bez zmian aktualizuje tylko „ostatnio sprawdzono”,
 *  - w pamięci trzymanych jest maksymalnie MAX_VERSIONS wersji (najstarsze wypadają).
 */

const crypto = require('node:crypto');
const { diffPlans, describeChange } = require('./diff');

const MAX_DIFF_ITEMS = 40;

/**
 * Odcisk treści planu — **tożsamość wersji**, nie licznik.
 *
 * Numer `version.id` żyje tylko w pamięci procesu, więc po restarcie serwera
 * zaczyna się od nowa (`seed()` z pliku daje znowu #1). Klient porównuje odcisk,
 * bo on zależy wyłącznie od treści planu: ta sama treść = ten sam odcisk,
 * a każda zmiana u uczelni go zmienia.
 *
 * Musi obejmować **wszystko**, co widać w planie i po czym filtrujemy scalony
 * plan — inaczej uczelnia zmieni pole, a aplikacja nigdy o tym nie powie.
 */
function classKey(c) {
  return [
    c.id,
    c.subject,
    c.start,
    c.end,
    c.roomRaw || '',
    c.lecturer,
    c.notes,
    c.form?.raw,
    c.passForm,                                                 // forma zaliczenia
    Array.isArray(c.groupIds) ? [...c.groupIds].sort().join(',') : '', // przypisanie do grup
  ].join('~');
}

function fingerprint(plan) {
  const payload = plan.classes.map(classKey).join('|');
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

function emptyDiff() {
  return { counts: { added: 0, removed: 0, changed: 0 }, items: [] };
}

class VersionStore {
  constructor({ max = 200, groupId = null } = {}) {
    this.max = Math.max(1, max);
    this.groupId = groupId;
    this.versions = [];
    this.nextId = 1;
    this.checkedAt = null;      // ostatnie sprawdzenie u uczelni
    this.checks = 0;            // ile razy pytaliśmy uczelnię
    this.missed = 0;            // ile sprawdzeń bez zmian
  }

  /** Wczytanie planu z dysku przy starcie — jako pierwsza wersja, bez diffu. */
  seed(plan) {
    if (!plan || !plan.classes) return null;
    const version = this.#build(plan, emptyDiff());
    this.versions.push(version);
    // To nie jest świeże sprawdzenie, tylko odczyt cache — nie kłam w /health.
    this.checkedAt = plan.meta?.fetchedAt || new Date().toISOString();
    return version;
  }

  /**
   * Dodaje wynik sprawdzenia planu.
   * @returns {{version: object, created: boolean, previous: object|null}}
   */
  add(plan, checkedAt = new Date()) {
    this.checks += 1;
    this.checkedAt = checkedAt.toISOString();

    const print = fingerprint(plan);
    const current = this.current();

    if (current && current.fingerprint === print) {
      this.missed += 1;
      current.lastSeenAt = this.checkedAt;
      current.checks += 1;
      return { version: current, created: false, previous: null };
    }

    const diff = diffPlans(current ? current.plan : null, plan);
    const version = this.#build(plan, this.#summarize(diff, current));

    this.versions.push(version);
    while (this.versions.length > this.max) this.versions.shift();

    return { version, created: true, previous: current };
  }

  #build(plan, diff) {
    return {
      id: this.nextId++,
      fingerprint: fingerprint(plan),
      fetchedAt: plan.meta?.fetchedAt || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      checks: 1,
      classes: plan.classes.length,
      days: plan.days.length,
      stats: plan.meta?.stats || null,
      semesterFrom: plan.meta?.semesterFrom || null,
      semesterTo: plan.meta?.semesterTo || null,
      diff,
      plan,
    };
  }

  #summarize(diff, previous) {
    const items = [];

    for (const c of diff.added.slice(0, MAX_DIFF_ITEMS)) {
      items.push({
        type: 'added',
        date: c.date,
        subject: c.subject,
        start: c.start,
        end: c.end,
        room: c.mode === 'zdalne' ? 'zdalnie' : (c.room?.label || ''),
        text: 'dodane zajęcia',
      });
    }
    for (const c of diff.removed.slice(0, MAX_DIFF_ITEMS)) {
      items.push({
        type: 'removed',
        date: c.date,
        subject: c.subject,
        start: c.start,
        end: c.end,
        room: c.mode === 'zdalne' ? 'zdalnie' : (c.room?.label || ''),
        text: 'odwołane / usunięte zajęcia',
      });
    }
    for (const pair of diff.changed.slice(0, MAX_DIFF_ITEMS)) {
      items.push({
        type: 'changed',
        date: pair.after.date,
        subject: pair.after.subject,
        start: pair.after.start,
        end: pair.after.end,
        room: pair.after.mode === 'zdalne' ? 'zdalnie' : (pair.after.room?.label || ''),
        text: describeChange(pair),
      });
    }

    return {
      counts: diff.counts,
      items: items.slice(0, MAX_DIFF_ITEMS),
      truncated: items.length > MAX_DIFF_ITEMS,
      fromVersion: previous ? previous.id : null,
      fromFetchedAt: previous ? previous.fetchedAt : null,
    };
  }

  current() {
    return this.versions.length ? this.versions[this.versions.length - 1] : null;
  }

  get(id) {
    return this.versions.find((v) => v.id === Number(id)) || null;
  }

  /** Lista bez pełnych planów — do interfejsu. */
  list() {
    return [...this.versions].reverse().map((v) => ({
      id: v.id,
      fetchedAt: v.fetchedAt,
      createdAt: v.createdAt,
      lastSeenAt: v.lastSeenAt,
      checks: v.checks,
      classes: v.classes,
      days: v.days,
      stats: v.stats,
      semesterFrom: v.semesterFrom,
      semesterTo: v.semesterTo,
      diff: v.diff,
      isCurrent: v === this.current(),
    }));
  }

  summary() {
    const current = this.current();
    return {
      groupId: this.groupId,
      maxVersions: this.max,
      stored: this.versions.length,
      checks: this.checks,
      missed: this.missed,
      checkedAt: this.checkedAt,
      currentId: current ? current.id : null,
      currentFingerprint: current ? current.fingerprint : null,
      currentFetchedAt: current ? current.fetchedAt : null,
      versionIds: this.versions.map((v) => v.id),
    };
  }
}

module.exports = { VersionStore, fingerprint };
