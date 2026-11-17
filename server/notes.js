'use strict';
/**
 * Notatki na kafelkach zajęć — krótkie etykiety w rodzaju „Kolos”, „Egzamin”.
 *
 * Notatka należy do **konkretnych zajęć** (identyfikator z planu zawiera datę,
 * godzinę i grupę), a nie do przedmiotu: kolokwium jest jednego dnia, więc
 * nie może świecić na wszystkich tygodniach. Ponieważ identyfikator zajęć jest
 * ten sam u wszystkich, notatka dopisana przez jedną osobę jest od razu widoczna
 * dla pozostałych — i każdy może ją zmienić lub usunąć.
 *
 * Stan trzymamy w jednym pliku JSON w katalogu cache (w Dockerze na wolumenie
 * ./data), więc notatki przeżywają restart i przebudowę kontenera. Zapis jest
 * atomowy (plik tymczasowy + rename) i serializowany — równoległe edycje nie
 * mogą uszkodzić pliku.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

/** Tyle znaków mieści się na kafelku — dłuższa notatka i tak byłaby nieczytelna. */
const MAX_LENGTH = 15;
/** Sufit pliku: chroni wolumen przed zalaniem losowymi identyfikatorami zajęć. */
const MAX_NOTES = 5000;
/** Notatki do zajęć starszych niż tyle dni są usuwane przy zapisie. */
const KEEP_DAYS = 60;
const FILE_VERSION = 1;

/** Identyfikator zajęć: `data|start|end|prowadzący|forma|grupa` (`server/parser.js`). */
const CLASS_ID = /^\d{4}-\d{2}-\d{2}\|[^|\r\n\0]{1,80}\|[^|\r\n\0]{1,80}\|/;

/** Okno, w którym notatka ma sens — od `keepDays` wstecz do roku w przód. */
const MAX_AHEAD_DAYS = 400;

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Tani test formatu — bez niego walidacja „czy takie zajęcia istnieją” startuje dla śmieci. */
function isValidClassId(classId) {
  if (typeof classId !== 'string') return false;
  if (classId.length < 12 || classId.length > 400) return false;
  if (/[\r\n\0]/.test(classId)) return false;
  return CLASS_ID.test(classId);
}

/** Data zajęć z identyfikatora (`2026-11-16`) — po niej przycinamy stare wpisy. */
function dayOf(classId) {
  const day = String(classId || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * Czy data zajęć mieści się w oknie, w którym notatki mają sens.
 *
 * Bez tego `2099-01-01|…` przechodziło walidację i nigdy nie znikało z pliku
 * (prune kasuje tylko stare), więc limit 5000 wpisów zapełniał się na zawsze.
 */
function dayInRange(classId, now = new Date(), keepDays = KEEP_DAYS, aheadDays = MAX_AHEAD_DAYS) {
  const day = dayOf(classId);
  if (!day) return false;
  const from = new Date(now.getTime());
  from.setUTCDate(from.getUTCDate() - keepDays);
  const to = new Date(now.getTime());
  to.setUTCDate(to.getUTCDate() + aheadDays);
  return day >= from.toISOString().slice(0, 10) && day <= to.toISOString().slice(0, 10);
}

/**
 * Notatka w postaci, w jakiej trafia na kafelek: jedna linia, bez podwójnych
 * spacji i znaków sterujących. Zwraca `''` dla pustej treści (czyli „usuń”).
 */
function normalizeNote(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Długość w znakach, nie w jednostkach UTF-16 — emoji też jest jednym znakiem. */
function noteLength(text) {
  return Array.from(text).length;
}

class NoteStore {
  constructor({ file, maxLength = MAX_LENGTH, maxNotes = MAX_NOTES, keepDays = KEEP_DAYS } = {}) {
    if (!file) throw new Error('NoteStore wymaga ścieżki pliku.');
    this.file = path.resolve(file);
    this.maxLength = Math.max(1, maxLength);
    this.maxNotes = Math.max(1, maxNotes);
    this.keepDays = Math.max(1, keepDays);
    /** `Map<identyfikator zajęć, tekst>` — kolejność wpisów zachowuje plik. */
    this.notes = new Map();
    this.writeChain = Promise.resolve();
  }

  /** Wczytuje stan z dysku. Brak pliku i uszkodzony JSON nie wywalają serwera. */
  async load() {
    let raw;
    try {
      raw = await fs.readFile(this.file, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('[notes] odczyt:', err.message);
      return this.snapshot();
    }

    try {
      const parsed = JSON.parse(raw);
      const source = parsed && typeof parsed.notes === 'object' && parsed.notes ? parsed.notes : {};
      for (const [classId, value] of Object.entries(source)) {
        if (!this.#validClassId(classId)) continue;
        const text = normalizeNote(value).slice(0, this.maxLength);
        if (text) this.notes.set(classId, text);
      }
      this.prune();
    } catch (err) {
      console.warn('[notes] uszkodzony plik — notatki startują puste:', err.message);
      this.notes.clear();
    }
    return this.snapshot();
  }

  #validClassId(classId) {
    return isValidClassId(classId);
  }

  /** Data zajęć z identyfikatora (`2026-11-16`) — po niej przycinamy stare wpisy. */
  static dayOf(classId) {
    return dayOf(classId);
  }

  /** Usuwa notatki do zajęć starszych niż `keepDays` — plik nie rośnie w nieskończoność. */
  prune(now = new Date()) {
    const cutoff = new Date(now.getTime());
    cutoff.setUTCDate(cutoff.getUTCDate() - this.keepDays);
    const limit = cutoff.toISOString().slice(0, 10);
    for (const classId of [...this.notes.keys()]) {
      const day = NoteStore.dayOf(classId);
      if (day && day < limit) this.notes.delete(classId);
    }
  }

  /**
   * Zapisuje notatkę (albo usuwa ją, gdy treść jest pusta).
   * Zwraca `{ classId, text }` — `text` puste oznacza „notatki nie ma”.
   *
   * Błąd zapisu na dysk **nie** jest połykany: notatka wraca do poprzedniej
   * wartości, a klient dostaje 503. Wcześniej `#persist` łapał błąd i rozwiązywał
   * obietnicę, więc przy pełnym dysku odpowiedź brzmiała „Zapisano”, a notatka
   * przepadała po restarcie.
   */
  async set(classId, rawText, at = new Date()) {
    if (!this.#validClassId(classId)) {
      throw fail(400, 'Nieprawidłowy identyfikator zajęć.');
    }
    const text = normalizeNote(rawText);
    if (noteLength(text) > this.maxLength) {
      throw fail(400, `Notatka może mieć maksymalnie ${this.maxLength} znaków.`);
    }

    const had = this.notes.has(classId);
    const previous = had ? this.notes.get(classId) : undefined;
    if (!text && !had) return { classId, text: '' };

    if (text && !had) {
      // Nowy wpis: najpierw porządki, potem sufit — inaczej plik rósłby w nieskończoność.
      this.prune(at instanceof Date ? at : new Date());
      if (this.notes.size >= this.maxNotes) {
        throw fail(429, 'Na serwerze jest już za dużo notatek — spróbuj później.');
      }
    }

    // Zapis bez zmian nie tworzy ruchu na dysku (np. dwa razy „Kolos”).
    if (previous === text) return { classId, text };

    if (text) this.notes.set(classId, text);
    else this.notes.delete(classId);

    try {
      await this.#persist();
    } catch (err) {
      // Stan w pamięci musi zgadzać się z dyskiem — cofamy zmianę.
      if (had) this.notes.set(classId, previous);
      else this.notes.delete(classId);
      throw fail(503, 'Nie udało się zapisać notatki — spróbuj ponownie za chwilę.');
    }
    return { classId, text };
  }

  /** Mapa `identyfikator → tekst` dla klienta (kopia, nie referencja do stanu). */
  snapshot() {
    return Object.fromEntries(this.notes);
  }

  /**
   * Kolejka zapisów: dwa równoległe `set` nie mogą zamazać sobie pliku.
   * Błąd wraca do wołającego, ale łańcuch zostaje zdrowy — kolejny zapis
   * nie odziedziczy odrzucenia poprzedniego.
   */
  #persist() {
    const run = this.writeChain.then(() => this.save());
    this.writeChain = run.catch(() => {});
    return run;
  }

  async save() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const body = JSON.stringify({
      version: FILE_VERSION,
      updatedAt: new Date().toISOString(),
      notes: Object.fromEntries(this.notes),
    });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${body}\n`, 'utf8');
    await fs.rename(tmp, this.file);
  }
}

module.exports = {
  NoteStore,
  normalizeNote,
  noteLength,
  isValidClassId,
  dayOf,
  dayInRange,
  MAX_LENGTH,
  MAX_NOTES,
  KEEP_DAYS,
  MAX_AHEAD_DAYS,
};
