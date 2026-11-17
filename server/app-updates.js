'use strict';
/**
 * Wydania aplikacji Android — manifest i pliki APK.
 *
 * Aplikacja nie trafia do żadnego sklepu, więc sama pyta ten serwer:
 *
 *   GET /api/app/latest?versionCode=2     → najnowsze wydanie (JSON)
 *   GET /api/app/download/<plik>.apk      → plik instalacyjny
 *
 * Wydanie publikuje się przez wgranie dwóch plików do katalogu wydań
 * (`APP_RELEASE_DIR`, domyślnie `CACHE_DIR/releases`, czyli w Dockerze
 * `./data/releases`):
 *
 *   latest.json                 — opis najnowszej wersji
 *   planzajec-ideis-1.0-1.apk   — plik instalacyjny
 *
 * Publikacja nie wymaga przebudowania kontenera — katalog leży na wolumenie.
 * Robi to `scripts/publish-apk.ps1`.
 *
 * Moduł nie zna HTTP: zajmuje się wyłącznie odczytem i walidacją manifestu,
 * żeby dało się go przetestować bez serwera (patrz `scripts/self-test.js`).
 */

const fs = require('node:fs/promises');
const path = require('node:path');

/** Nazwa pliku APK: bez ścieżek, bez cudzysłowów, z rozszerzeniem `.apk`. */
const APK_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.apk$/;

/** SHA-256 w zapisie szesnastkowym (małe litery). */
const SHA256 = /^[a-f0-9]{64}$/;

/** Identyfikator aplikacji w stylu Androida: pl.matiit.planzajec.ideis. */
const APP_ID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/**
 * Identyfikator forkowanej aplikacji. Wydania z `plany.mati-it.pl` mają inny
 * identyfikator (`pl.matiit.planzajec`), więc oba kanały się nie mieszają:
 * manifest opisujący obcą aplikację jest odrzucany, a nie po cichu serwowany.
 */
const DEFAULT_APP_ID = 'pl.matiit.planzajec.ideis';

const MAX_NOTES = 4000;

function manifestError(message) {
  const err = new Error(`Manifest wydania jest nieprawidłowy: ${message}`);
  // 503, bo to błąd publikacji po stronie serwera, a nie żądania klienta.
  err.status = 503;
  return err;
}

/**
 * Sprowadza `latest.json` do postaci, której mogą zaufać klient i serwer.
 * Rzuca wyjątek przy każdym odejściu od kontraktu — lepiej nie ogłosić
 * wydania niż podać link do pliku, którego nie ma.
 */
function normalizeRelease(input, { appId, urlPrefix = '/api/app/download/' } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw manifestError('oczekiwano obiektu JSON');
  }

  const app = String(input.app || appId || '').trim();
  if (app && appId && app !== appId) {
    throw manifestError(`wydanie dotyczy innej aplikacji (${app}, oczekiwano ${appId})`);
  }
  if (app && !APP_ID.test(app)) {
    throw manifestError('nieprawidłowy identyfikator aplikacji');
  }

  const versionCode = Number(input.versionCode);
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw manifestError('versionCode musi być liczbą całkowitą ≥ 1');
  }

  const versionName = String(input.versionName || '').trim();
  if (!versionName || versionName.length > 40) {
    throw manifestError('versionName musi mieć 1–40 znaków');
  }

  const apkFile = String(input.apkFile || '').trim();
  if (!APK_NAME.test(apkFile)) {
    throw manifestError('apkFile musi być nazwą pliku .apk bez katalogów');
  }

  // Domyślnie link budujemy sami; jawny adres przyjmujemy tylko jako
  // http(s) albo ścieżkę zaczynającą się od „/” — nigdy „javascript:”.
  const explicitUrl = String(input.apkUrl || '').trim();
  let apkUrl;
  if (explicitUrl) {
    if (!/^(https?:\/\/|\/)/i.test(explicitUrl)) {
      throw manifestError('apkUrl musi być adresem http(s) albo ścieżką od „/”');
    }
    apkUrl = explicitUrl;
  } else {
    apkUrl = urlPrefix + encodeURIComponent(apkFile);
  }

  const sha256 = String(input.sha256 || '').trim().toLowerCase();
  if (!SHA256.test(sha256)) {
    throw manifestError('sha256 musi mieć 64 znaki szesnastkowe');
  }

  const sizeBytes = Number(input.sizeBytes);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1) {
    throw manifestError('sizeBytes musi być liczbą całkowitą ≥ 1');
  }

  const minSupported = input.minSupportedVersionCode === undefined
    || input.minSupportedVersionCode === null
    ? 0
    : Number(input.minSupportedVersionCode);
  if (!Number.isInteger(minSupported) || minSupported < 0) {
    throw manifestError('minSupportedVersionCode musi być liczbą całkowitą ≥ 0');
  }

  const notes = input.notes === undefined || input.notes === null
    ? null
    : String(input.notes).trim().slice(0, MAX_NOTES) || null;

  const publishedAt = input.publishedAt ? String(input.publishedAt) : null;
  if (publishedAt && Number.isNaN(Date.parse(publishedAt))) {
    throw manifestError('publishedAt musi być datą ISO 8601');
  }

  return {
    app: app || null,
    versionCode,
    versionName,
    apkFile,
    apkUrl,
    sha256,
    sizeBytes,
    minSupportedVersionCode: minSupported,
    notes,
    publishedAt,
  };
}

/**
 * Nagłówek `Range` → przedział bajtów do wysłania.
 *
 * Zwraca `null`, gdy klient nie prosił o zakres (wyślij całość),
 * `'invalid'`, gdy zakres jest niemożliwy (416), albo `{ start, end }`.
 * DownloadManager Androida wznawia pobieranie właśnie w ten sposób.
 */
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;
  if (!Number.isInteger(size) || size <= 0) return 'invalid';

  let start;
  let end;
  if (!rawStart) {
    // „bytes=-500” — ostatnie 500 bajtów.
    const suffix = Number(rawEnd);
    if (!Number.isInteger(suffix) || suffix <= 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= size) {
    return 'invalid';
  }
  return { start, end };
}

/** Katalog wydań: manifest i pliki APK. Bez zależności i bez stanu w pamięci. */
class ReleaseStore {
  constructor({ dir, appId = DEFAULT_APP_ID } = {}) {
    if (!dir) throw new Error('ReleaseStore wymaga katalogu wydań');
    this.dir = path.resolve(dir);
    this.appId = appId;
  }

  get manifestFile() {
    return path.join(this.dir, 'latest.json');
  }

  /** Najnowsze wydanie albo `null`, gdy nic jeszcze nie opublikowano. */
  async latest() {
    let raw;
    try {
      raw = await fs.readFile(this.manifestFile, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw manifestError('to nie jest poprawny JSON');
    }
    return normalizeRelease(parsed, { appId: this.appId });
  }

  /** Metadane pliku APK albo `null`, gdy nazwa jest niebezpieczna lub pliku nie ma. */
  async apk(fileName) {
    if (typeof fileName !== 'string' || !APK_NAME.test(fileName)) return null;
    const target = path.join(this.dir, fileName);
    if (!target.startsWith(this.dir + path.sep)) return null;

    try {
      const stat = await fs.stat(target);
      if (!stat.isFile()) return null;
      return {
        name: fileName,
        path: target,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }
}

module.exports = {
  DEFAULT_APP_ID,
  ReleaseStore,
  normalizeRelease,
  parseRange,
  APK_NAME,
  SHA256,
  manifestError,
};
