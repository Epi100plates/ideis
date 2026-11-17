'use strict';
/**
 * Propozycje nowych funkcji i zgłoszenia błędów.
 *
 * Zgłoszenia są publiczne i anonimowe: nie ma kont, logowania ani adresu e-mail.
 * Chronimy tylko serwer przed zalaniem pliku (limit na IP w `index.js`) i przed
 * śmieciami w treści (długość, znaki kontrolne, dozwolone rodzaje zgłoszenia).
 *
 * Zapis to dopisywanie jednej linii JSON (`feedback.jsonl`) — odporne na
 * przerwanie zapisu i proste do przejrzenia także `grep`em na VPS. Odczyt
 * toleruje urwaną ostatnią linię (np. po zabiciu procesu w trakcie zapisu).
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const KINDS = new Set(['idea', 'bug']);
const MAX_MESSAGE = 2000;
const MIN_MESSAGE = 3;
const MAX_ITEMS = 1000;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Usuwa znaki sterujące i nadmiarowe spacje; zostawia polskie znaki. */
function cleanText(input, max) {
  return String(input ?? '')
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Sprawdza i normalizuje zgłoszenie. `kind` jest wymagany (idea/bug), treść
 * musi mieć od 3 do 2000 znaków. Wersja i platforma są opcjonalne — pomagają
 * odtworzyć problem („1.11 (13), android”).
 */
function normalizeFeedback(input) {
  const kind = cleanText(input?.kind, 16).toLowerCase();
  if (!KINDS.has(kind)) throw httpError(400, 'Rodzaj zgłoszenia musi być „idea” albo „bug”.');

  // Treść może być wielolinijkowa (opis błędu), ale bez znaków kontrolnych
  // i bez ciągów spacji — po jednym znormalizowanym wierszu.
  const message = String(input?.message ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (message.length < MIN_MESSAGE) throw httpError(400, 'Napisz kilka słów — treść jest za krótka.');
  if (message.length > MAX_MESSAGE) {
    throw httpError(413, `Treść jest za długa (maks. ${MAX_MESSAGE} znaków).`);
  }

  const version = cleanText(input?.version, 32);
  const platform = cleanText(input?.platform, 16).toLowerCase() || 'app';
  const versionCode = Number(input?.versionCode);
  return {
    kind,
    message,
    version: version || null,
    versionCode: Number.isInteger(versionCode) && versionCode > 0 && versionCode < 10_000_000
      ? versionCode
      : null,
    platform,
  };
}

class FeedbackStore {
  constructor({ dir, maxItems = MAX_ITEMS } = {}) {
    if (!dir) throw new Error('FeedbackStore wymaga katalogu dir');
    this.dir = path.resolve(dir);
    this.maxItems = Math.max(10, maxItems);
    this.queue = Promise.resolve();
  }

  get file() {
    return path.join(this.dir, 'feedback.jsonl');
  }

  /** Dopisuje zgłoszenie i zwraca gotowy wpis (z identyfikatorem i czasem). */
  async add(input) {
    const clean = normalizeFeedback(input);
    const item = {
      id: crypto.randomBytes(8).toString('hex'),
      ...clean,
      createdAt: new Date().toISOString(),
    };
    // Kolejka: dwa równoległe zgłoszenia nie mogą przeplatać linii w pliku.
    this.queue = this.queue.catch(() => {}).then(async () => {
      await fs.mkdir(this.dir, { recursive: true });
      await fs.appendFile(this.file, `${JSON.stringify(item)}\n`, 'utf8');
      await this.#trim();
    });
    await this.queue;
    return item;
  }

  /** Lista od najnowszych. `limit` chroni stronę przed ogromnym renderem. */
  async list({ limit = 200 } = {}) {
    const items = await this.#readAll();
    return items.slice(-Math.max(1, limit)).reverse();
  }

  async count() {
    return (await this.#readAll()).length;
  }

  /** Usuwanie wpisu (moderacja) — zwraca `true`, gdy coś zniknęło. */
  async remove(id) {
    if (!/^[a-f0-9]{16}$/.test(String(id))) return false;
    this.queue = this.queue.catch(() => {}).then(async () => {
      const items = await this.#readAll();
      const kept = items.filter((item) => item.id !== id);
      if (kept.length === items.length) return false;
      await this.#rewrite(kept);
      return true;
    });
    return this.queue;
  }

  async #readAll() {
    let raw = '';
    try {
      raw = await fs.readFile(this.file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    const items = [];
    for (const line of raw.split('\n')) {
      const text = line.trim();
      if (!text) continue;
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed.id === 'string' && KINDS.has(parsed.kind)) items.push(parsed);
      } catch { /* urwana linia po zabiciu procesu — pomijamy */ }
    }
    return items;
  }

  async #rewrite(items) {
    const tmp = `${this.file}.tmp`;
    await fs.mkdir(this.dir, { recursive: true });
    const body = items.map((item) => `${JSON.stringify(item)}\n`).join('');
    await fs.writeFile(tmp, body, 'utf8');
    await fs.rename(tmp, this.file);
  }

  /** Po dopisaniu pilnuje górnego limitu — stare wpisy wypadają, plik nie rośnie w nieskończoność. */
  async #trim() {
    const items = await this.#readAll();
    if (items.length <= this.maxItems) return;
    await this.#rewrite(items.slice(-this.maxItems));
  }
}

module.exports = {
  FeedbackStore,
  normalizeFeedback,
  KINDS,
  MAX_MESSAGE,
  MIN_MESSAGE,
  MAX_ITEMS,
};
