'use strict';
/**
 * Załączniki do zajęć: notatki, PDF, prezentacje, arkusze, obrazy.
 *
 * Każde zajęcia (grupa + id zajęć) ma własny katalog na dysku. Pliki są
 * dostępne publicznie — tak jak plan — więc nie ma logowania: każdy może
 * dodać i pobrać materiał. Chronimy tylko serwer przed przypadkowym lub
 * złośliwym zapełnieniem dysku: limity rozmiaru, liczby plików i typów.
 *
 * Nazwy plików nigdy nie trafiają do ścieżki. Na dysku leży losowy
 * identyfikator, a oryginalna nazwa jest tylko w metadanych i w nagłówku
 * Content-Disposition. Dzięki temu nazwa typu "../../index.js" nic nie zmieni.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const ALLOWED = new Map([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.doc', 'application/msword'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['.ppt', 'application/vnd.ms-powerpoint'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.odt', 'application/vnd.oasis.opendocument.text'],
  ['.ods', 'application/vnd.oasis.opendocument.spreadsheet'],
  ['.odp', 'application/vnd.oasis.opendocument.presentation'],
  ['.rtf', 'application/rtf'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.zip', 'application/zip'],
]);

const ALLOWED_LABEL = 'PDF, DOCX/DOC, PPTX/PPT, XLSX/XLS, ODT/ODS/ODP, RTF, CSV, TXT, MD, PNG/JPG/WEBP/GIF, ZIP';

/** Formaty oparte na ZIP (OOXML, OpenDocument) i stare formaty OLE (DOC/PPT/XLS). */
const ZIP_FORMATS = new Set(['.docx', '.pptx', '.xlsx', '.odt', '.ods', '.odp', '.zip']);
const OLE_FORMATS = new Set(['.doc', '.ppt', '.xls']);
const TEXT_FORMATS = new Set(['.txt', '.md', '.csv']);

/** Jak długo indeks „które zajęcia mają materiały” może być trzymany w pamięci. */
const INDEX_TTL_MS = 15 * 1000;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Bezpieczna nazwa do wyświetlenia i do nagłówka pobierania.
 * Usuwa sterowanie, separatory ścieżek i znaki niedozwolone w Windows.
 */
function sanitizeFileName(input) {
  let name = String(input ?? '').normalize('NFC');
  name = name.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '');
  name = name.split(/[\\/]/).pop() || '';
  name = name.replace(/[<>:"|?*]/g, '-').replace(/\s+/g, ' ').trim();
  name = name.replace(/^\.+|\.+$/g, '').trim();
  if (!name) name = 'zalacznik';

  const ext = path.extname(name).toLowerCase();
  let base = ext ? name.slice(0, -ext.length) : name;
  if (!base) base = 'zalacznik';
  if (base.length > 90) base = base.slice(0, 90).trim();
  name = `${base}${ext}`;
  if (name.length > 120) name = `${name.slice(0, 120 - ext.length).trim()}${ext}`;
  return name;
}

/** Sprawdza sygnaturę pliku — sama końcówka ".pdf" nie wystarczy. */
function assertFileSignature(data, ext) {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw httpError(400, 'Plik jest pusty.');
  }

  if (ext === '.pdf') {
    if (!data.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
      throw httpError(415, 'To nie jest prawidłowy plik PDF.');
    }
    return;
  }

  if (ZIP_FORMATS.has(ext)) {
    if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b || data[2] !== 0x03 || data[3] !== 0x04) {
      throw httpError(415, `To nie jest prawidłowy plik ${ext.slice(1).toUpperCase()}.`);
    }
    return;
  }

  if (OLE_FORMATS.has(ext)) {
    if (data.length < 8 || data.readUInt32BE(0) !== 0xd0cf11e0) {
      throw httpError(415, `To nie jest prawidłowy plik ${ext.slice(1).toUpperCase()}.`);
    }
    return;
  }

  if (ext === '.rtf') {
    if (data.subarray(0, 5).toString('latin1') !== '{\\rtf') {
      throw httpError(415, 'To nie jest prawidłowy plik RTF.');
    }
    return;
  }

  if (TEXT_FORMATS.has(ext)) {
    if (data.includes(0)) {
      throw httpError(415, `Plik ${ext.slice(1).toUpperCase()} musi być plikiem tekstowym.`);
    }
    return;
  }

  if (ext === '.png') {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (data.length < png.length || png.some((byte, i) => data[i] !== byte)) {
      throw httpError(415, 'To nie jest prawidłowy plik PNG.');
    }
    return;
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    if (data.length < 3 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
      throw httpError(415, 'To nie jest prawidłowy plik JPEG.');
    }
    return;
  }

  if (ext === '.gif') {
    const header = data.subarray(0, 6).toString('latin1');
    if (header !== 'GIF87a' && header !== 'GIF89a') {
      throw httpError(415, 'To nie jest prawidłowy plik GIF.');
    }
    return;
  }

  if (ext === '.webp') {
    if (data.length < 12
      || data.subarray(0, 4).toString('latin1') !== 'RIFF'
      || data.subarray(8, 12).toString('latin1') !== 'WEBP') {
      throw httpError(415, 'To nie jest prawidłowy plik WEBP.');
    }
    return;
  }

  throw httpError(415, `Dozwolone typy: ${ALLOWED_LABEL}.`);
}

function kindOf(ext) {
  if (ext === '.txt' || ext === '.md') return 'note';
  return ext.slice(1);
}

function publicFile(file, groupId, classId) {
  return {
    id: file.id,
    name: file.name,
    ext: file.ext.slice(1),
    kind: file.kind,
    mime: file.mime,
    size: file.size,
    uploadedAt: file.uploadedAt,
    url: `/api/attachments/${file.id}?group=${encodeURIComponent(groupId)}&class=${encodeURIComponent(classId)}`,
  };
}

function publicLink(link) {
  let host = '';
  try { host = new URL(link.url).hostname.replace(/^www\./i, ''); } catch { /* ignore */ }
  return {
    id: link.id,
    url: link.url,
    title: link.title || host || link.url,
    host,
    addedAt: link.addedAt,
  };
}

function publicMeta(meta, groupId, classId) {
  const files = [...(meta?.files || [])].sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  const links = [...(meta?.links || [])].sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
  return {
    attachments: files.map((f) => publicFile(f, groupId, classId)),
    links: links.map(publicLink),
    totalBytes: files.reduce((sum, f) => sum + (f.size || 0), 0),
    createdAt: meta?.createdAt || null,
    updatedAt: meta?.updatedAt || null,
    classInfo: meta?.classInfo || null,
  };
}

/**
 * Scala metadane tej samej sprawy z kilku katalogów grup.
 *
 * Identyfikator zajęć z planu jest wspólny dla wszystkich grup (wykład ma ten
 * sam `classId` w każdej grupie), więc materiały dodane z jednej grupy muszą
 * być widoczne w pozostałych. Każdy katalog zostaje tam, gdzie powstał (zapis
 * nie zmienia historii), a odczyt składa listę z wszystkich pasujących.
 */
function mergeMeta(metas) {
  const lists = metas.filter(Boolean);
  if (!lists.length) return null;
  const files = new Map();
  const links = new Map();
  let createdAt = null;
  let updatedAt = null;
  let classInfo = null;
  for (const meta of lists) {
    for (const file of meta.files || []) if (!files.has(file.id)) files.set(file.id, file);
    for (const link of meta.links || []) if (!links.has(link.id)) links.set(link.id, link);
    if (meta.createdAt && (!createdAt || meta.createdAt < createdAt)) createdAt = meta.createdAt;
    if (meta.updatedAt && (!updatedAt || meta.updatedAt > updatedAt)) updatedAt = meta.updatedAt;
    if (meta.classInfo) classInfo = meta.classInfo;
  }
  return {
    files: [...files.values()],
    links: [...links.values()],
    createdAt,
    updatedAt,
    classInfo,
  };
}

/** Bezpieczny link: tylko http/https, bez danych logowania i znaków kontrolnych. */
function normalizeLinkUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw httpError(400, 'Podaj adres linku.');
  if (raw.length > 2000) throw httpError(400, 'Link jest za długi (maks. 2000 znaków).');
  if (/[\u0000-\u001f\u007f]/.test(raw)) throw httpError(400, 'Link zawiera niedozwolone znaki.');

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw httpError(400, 'Podaj pełny adres linku, np. https://example.com/material.pdf.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw httpError(400, 'Dozwolone są tylko linki http:// i https://.');
  }
  if (parsed.username || parsed.password) {
    throw httpError(400, 'Link nie może zawierać danych logowania.');
  }
  return parsed.toString();
}

function sanitizeLinkTitle(input, fallbackUrl) {
  let title = String(input ?? '')
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title) {
    try { title = new URL(fallbackUrl).hostname.replace(/^www\./i, ''); } catch { title = 'Link'; }
  }
  return title.slice(0, 120);
}

function classInfoOf(cls) {
  if (!cls) return null;
  return {
    subject: String(cls.subject || '').slice(0, 200),
    date: String(cls.date || '').slice(0, 10),
    start: String(cls.start || '').slice(0, 5),
    end: String(cls.end || '').slice(0, 5),
    form: String(cls.form?.code || '').slice(0, 12),
  };
}

class AttachmentStore {
  constructor({
    root,
    maxFileBytes = 25 * 1024 * 1024,
    maxFilesPerClass = 30,
    maxLinksPerClass = 30,
    maxBytesPerClass = 200 * 1024 * 1024,
    maxTotalBytes = 2 * 1024 * 1024 * 1024,
  } = {}) {
    if (!root) throw new Error('AttachmentStore wymaga katalogu root');
    this.root = path.resolve(root);
    this.maxFileBytes = Math.max(1024, maxFileBytes);
    this.maxFilesPerClass = Math.max(1, maxFilesPerClass);
    this.maxLinksPerClass = Math.max(1, maxLinksPerClass);
    this.maxBytesPerClass = Math.max(1024, maxBytesPerClass);
    this.maxTotalBytes = Math.max(1024 * 1024, maxTotalBytes);
    this.totalBytes = null;   // leniwie skanowane przy pierwszym uploadzie
    this.indexCache = null;   // { at, data } — patrz index()
    this.locks = new Map();
  }

  #key(groupId, classId) {
    return `${groupId}/${crypto.createHash('sha256').update(classId).digest('hex').slice(0, 32)}`;
  }

  #dir(groupId, classId) {
    if (!/^\d{2,8}$/.test(String(groupId))) throw httpError(400, 'Nieprawidłowy numer grupy.');
    const id = String(classId || '');
    if (id.length < 3 || id.length > 400 || /[\r\n\0]/.test(id)) {
      throw httpError(400, 'Nieprawidłowy identyfikator zajęć.');
    }
    const key = this.#key(String(groupId), id);
    return { dir: path.join(this.root, String(groupId), key.split('/')[1]), key };
  }

  /** Katalogi grup na dysku — tylko prawidłowe numery. */
  async #groupNames() {
    try {
      const entries = await fs.readdir(this.root, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && /^\d{2,8}$/.test(entry.name))
        .map((entry) => entry.name)
        .sort();
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * Wszystkie katalogi tej samej sprawy: własny (tam trafia zapis) oraz katalogi
   * innych grup o tym samym skrócie identyfikatora zajęć.
   *
   * Dzięki temu **wykład** — który w planie ma ten sam `classId` w każdej grupie
   * — pokazuje materiały dodane z dowolnej grupy. Ćwiczenia mają w `classId`
   * nazwę swojej grupy (`…|Ćw|Infor. 1st 1sem Ćw2N`), więc ich materiały nadal
   * pozostają rozdzielone.
   */
  async #dirsFor(groupId, classId) {
    const own = this.#dir(groupId, classId);
    const hash = own.key.split('/')[1];
    const dirs = [own.dir];
    for (const name of await this.#groupNames()) {
      if (name === String(groupId)) continue;
      const candidate = path.join(this.root, name, hash);
      try {
        await fs.access(path.join(candidate, 'meta.json'));
        dirs.push(candidate);
      } catch { /* ta grupa nie ma materiałów do tych zajęć */ }
    }
    return dirs;
  }

  /** Metadane scalone ze wszystkich katalogów widocznych dla tych zajęć. */
  async #readMerged(dirs) {
    return mergeMeta(await Promise.all(dirs.map((dir) => this.#readMeta(dir))));
  }

  /** Serializuje zmiany metadanych jednych zajęć (dwa uploady naraz nie zgubią wpisu). */
  #withLock(key, fn) {
    const prev = this.locks.get(key) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    this.locks.set(key, run);
    run.finally(() => {
      if (this.locks.get(key) === run) this.locks.delete(key);
    }).catch(() => {});
    return run;
  }

  /** Łączny rozmiar wszystkich załączników — do globalnego limitu dysku. */
  async #scanTotal() {
    let bytes = 0;
    let groups = [];
    try {
      groups = await fs.readdir(this.root, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return 0;
      throw err;
    }
    for (const group of groups) {
      if (!group.isDirectory() || !/^\d{2,8}$/.test(group.name)) continue;
      const groupDir = path.join(this.root, group.name);
      let classes = [];
      try {
        classes = await fs.readdir(groupDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const cls of classes) {
        if (!cls.isDirectory()) continue;
        try {
          const meta = JSON.parse(await fs.readFile(path.join(groupDir, cls.name, 'meta.json'), 'utf8'));
          if (Array.isArray(meta.files)) {
            bytes += meta.files.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
          }
        } catch { /* brak lub uszkodzone metadane — pomijamy */ }
      }
    }
    return bytes;
  }

  async #readMeta(dir) {
    const file = path.join(dir, 'meta.json');
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!parsed || !Array.isArray(parsed.files)) throw new Error('Nieprawidłowy format metadanych.');
      // Starsze wpisy nie miały linków — dokładamy pustą tablicę bez migracji pliku.
      if (!Array.isArray(parsed.links)) parsed.links = [];
      return parsed;
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      if (err instanceof SyntaxError) throw httpError(500, 'Metadane załączników są uszkodzone.');
      throw err;
    }
  }

  async #writeMeta(dir, meta) {
    const file = path.join(dir, 'meta.json');
    const tmp = `${file}.tmp`;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(meta, null, 2), 'utf8');
    await fs.rename(tmp, file);
  }

  /** Usuwa wpisy po plikach skasowanych poza aplikacją (np. ręcznie na VPS). */
  async #prune(dir, meta) {
    if (!meta?.files?.length) return false;
    const checks = await Promise.all(meta.files.map(async (f) => {
      try {
        await fs.access(path.join(dir, `${f.id}${f.ext}`));
        return true;
      } catch {
        return false;
      }
    }));
    if (checks.every(Boolean)) return false;
    meta.files = meta.files.filter((_, i) => checks[i]);
    meta.updatedAt = new Date().toISOString();
    return true;
  }

  /** Lista załączników danych zajęć — ze wszystkich grup, które je mają. */
  async list(groupId, classId) {
    const dirs = await this.#dirsFor(groupId, classId);
    const metas = await Promise.all(dirs.map((dir) => this.#withLock(dir, async () => {
      const meta = await this.#readMeta(dir);
      if (!meta) return null;
      if (await this.#prune(dir, meta)) {
        await this.#writeMeta(dir, meta);
        this.totalBytes = null;
      }
      return meta;
    })));
    return publicMeta(mergeMeta(metas), groupId, classId);
  }

  /**
   * Indeks „które zajęcia mają materiały” — dla aplikacji, która rysuje
   * spinacz przy zajęciach bez pobierania listy dla każdej karty.
   * Zwraca `Map<classId, { files, links }>`; liczniki sumują się między grupami.
   */
  async index() {
    const cached = this.indexCache;
    if (cached && Date.now() - cached.at < INDEX_TTL_MS) return cached.data;

    const data = new Map();
    for (const group of await this.#groupNames()) {
      let entries = [];
      try {
        entries = await fs.readdir(path.join(this.root, group), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const meta = await this.#readMeta(path.join(this.root, group, entry.name)).catch(() => null);
        if (!meta?.classId) continue;
        const files = (meta.files || []).length;
        const links = (meta.links || []).length;
        if (!files && !links) continue;
        const counts = data.get(meta.classId) || { files: 0, links: 0 };
        counts.files += files;
        counts.links += links;
        data.set(meta.classId, counts);
      }
    }
    this.indexCache = { at: Date.now(), data };
    return data;
  }

  /**
   * Dodaje plik. `data` to cała zawartość w pamięci (limit 25 MB),
   * dzięki czemu przed zapisem sprawdzamy sygnaturę.
   */
  async add(groupId, classId, { name, data, classInfo } = {}) {
    const clean = sanitizeFileName(name);
    const ext = path.extname(clean).toLowerCase();
    if (!ALLOWED.has(ext)) {
      throw httpError(415, `Dozwolone typy: ${ALLOWED_LABEL}.`);
    }
    if (!Buffer.isBuffer(data) || data.length === 0) throw httpError(400, 'Plik jest pusty.');
    if (data.length > this.maxFileBytes) {
      throw httpError(413, `Plik jest za duży. Maksimum to ${Math.round(this.maxFileBytes / 1048576)} MB.`);
    }
    assertFileSignature(data, ext);

    const { dir } = this.#dir(groupId, classId);
    return this.#withLock('__total__', async () => {
      if (this.totalBytes === null) this.totalBytes = await this.#scanTotal();
      if (this.totalBytes + data.length > this.maxTotalBytes) {
        throw httpError(507, 'Brak miejsca na nowe materiały. Skontaktuj się z administratorem.');
      }

      const now = new Date().toISOString();
      const dirs = await this.#dirsFor(groupId, classId);
      let meta = await this.#readMeta(dir);
      if (!meta) {
        meta = { version: 1, groupId: String(groupId), classId: String(classId), createdAt: now, updatedAt: now, files: [], links: [] };
      }
      if (await this.#prune(dir, meta)) await this.#writeMeta(dir, meta);

      // Limity liczymy z całej widocznej listy: materiały do wykładu są wspólne
      // dla wszystkich grup, więc nie mogą się mnożyć przez liczbę grup.
      const visible = mergeMeta(await Promise.all(dirs.map((d) => this.#readMeta(d))));
      if ((visible?.files?.length || 0) >= this.maxFilesPerClass) {
        throw httpError(409, `Limit ${this.maxFilesPerClass} plików dla tych zajęć został osiągnięty.`);
      }
      const total = (visible?.files || []).reduce((sum, f) => sum + (f.size || 0), 0);
      if (total + data.length > this.maxBytesPerClass) {
        throw httpError(413, `Limit miejsca dla tych zajęć to ${Math.round(this.maxBytesPerClass / 1048576)} MB.`);
      }

      const id = crypto.randomBytes(12).toString('hex');
      const storedName = `${id}${ext}`;
      const storedPath = path.join(dir, storedName);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(storedPath, data, { flag: 'wx' });

      const file = {
        id,
        name: clean,
        ext,
        kind: kindOf(ext),
        mime: ALLOWED.get(ext),
        size: data.length,
        uploadedAt: now,
      };
      meta.files.push(file);
      meta.updatedAt = now;
      const info = classInfoOf(classInfo);
      if (info) meta.classInfo = info;

      try {
        await this.#writeMeta(dir, meta);
      } catch (err) {
        await fs.unlink(storedPath).catch(() => {});
        throw err;
      }
      this.totalBytes += data.length;
      this.indexCache = null;
      return { attachment: publicFile(file, groupId, classId), ...publicMeta(meta, groupId, classId) };
    });
  }

  /**
   * Usuwa plik i jego metadane. Uprawnienia są publiczne — tak jak dodawanie.
   * Plik może leżeć w katalogu innej grupy (wspólny wykład), więc szukamy po
   * wszystkich katalogach widocznych dla tych zajęć.
   */
  async remove(groupId, classId, id) {
    if (!/^[a-f0-9]{24}$/.test(String(id))) throw httpError(404, 'Nie znaleziono załącznika.');

    return this.#withLock('__total__', async () => {
      const dirs = await this.#dirsFor(groupId, classId);
      for (const dir of dirs) {
        const meta = await this.#readMeta(dir);
        const index = meta?.files?.findIndex((file) => file.id === id) ?? -1;
        if (index < 0) continue;

        const [file] = meta.files.splice(index, 1);
        await fs.unlink(path.join(dir, `${file.id}${file.ext}`)).catch((err) => {
          if (err.code !== 'ENOENT') throw err;
        });
        meta.updatedAt = new Date().toISOString();
        await this.#writeMeta(dir, meta);
        this.totalBytes = null;
        this.indexCache = null;
        const visible = await this.#readMerged(dirs);
        return { deleted: publicFile(file, groupId, classId), ...publicMeta(visible, groupId, classId) };
      }
      throw httpError(404, 'Nie znaleziono załącznika.');
    });
  }

  /**
   * Dodaje bezpośredni link do materiału. Linki nie zajmują miejsca na dysku,
   * mają własny limit na zajęcia i nie zmniejszają limitu plików.
   */
  async addLink(groupId, classId, { url, title, classInfo } = {}) {
    const target = normalizeLinkUrl(url);
    const cleanTitle = sanitizeLinkTitle(title, target);
    const { dir } = this.#dir(groupId, classId);

    // Ten sam globalny zamek co przy plikach — dwa równoległe wpisy nie zgubią metadanych.
    return this.#withLock('__total__', async () => {
      const now = new Date().toISOString();
      const dirs = await this.#dirsFor(groupId, classId);
      let meta = await this.#readMeta(dir);
      if (!meta) {
        meta = { version: 1, groupId: String(groupId), classId: String(classId), createdAt: now, updatedAt: now, files: [], links: [] };
      }

      // Linki do wspólnego wykładu są widoczne w każdej grupie, więc limity
      // i powtórzenia sprawdzamy na scalonej liście.
      const visible = await this.#readMerged(dirs);
      if ((visible?.links?.length || 0) >= this.maxLinksPerClass) {
        throw httpError(409, `Limit ${this.maxLinksPerClass} linków dla tych zajęć został osiągnięty.`);
      }
      if ((visible?.links || []).some((link) => link.url === target)) {
        throw httpError(409, 'Ten link jest już dodany do tych zajęć.');
      }

      const link = {
        id: crypto.randomBytes(12).toString('hex'),
        url: target,
        title: cleanTitle,
        addedAt: now,
      };
      meta.links.push(link);
      meta.updatedAt = now;
      const info = classInfoOf(classInfo);
      if (info) meta.classInfo = info;

      await this.#writeMeta(dir, meta);
      this.indexCache = null;
      const merged = await this.#readMerged(dirs);
      return { link: publicLink(link), ...publicMeta(merged, groupId, classId) };
    });
  }

  /** Usuwa link z materiałów. Linki nie mają pliku na dysku — tylko metadane. */
  async removeLink(groupId, classId, id) {
    if (!/^[a-f0-9]{24}$/.test(String(id))) throw httpError(404, 'Nie znaleziono linku.');

    return this.#withLock('__total__', async () => {
      const dirs = await this.#dirsFor(groupId, classId);
      for (const dir of dirs) {
        const meta = await this.#readMeta(dir);
        const index = meta?.links?.findIndex((link) => link.id === id) ?? -1;
        if (index < 0) continue;

        const [link] = meta.links.splice(index, 1);
        meta.updatedAt = new Date().toISOString();
        await this.#writeMeta(dir, meta);
        this.indexCache = null;
        const visible = await this.#readMerged(dirs);
        return { deleted: publicLink(link), ...publicMeta(visible, groupId, classId) };
      }
      throw httpError(404, 'Nie znaleziono linku.');
    });
  }

  /** Znajduje plik do pobrania. Zwraca też bezpieczną nazwę i MIME z serwera. */
  async open(groupId, classId, id) {
    if (!/^[a-f0-9]{24}$/.test(String(id))) throw httpError(404, 'Nie znaleziono załącznika.');
    const dirs = await this.#dirsFor(groupId, classId);
    for (const dir of dirs) {
      const meta = await this.#readMeta(dir);
      const file = meta?.files?.find((f) => f.id === id);
      if (!file) continue;
      const ext = String(file.ext || '').toLowerCase();
      if (!ALLOWED.has(ext)) throw httpError(404, 'Nie znaleziono załącznika.');

      const storedPath = path.join(dir, `${file.id}${ext}`);
      let stat;
      try {
        stat = await fs.stat(storedPath);
      } catch {
        throw httpError(404, 'Plik został usunięty.');
      }
      if (!stat.isFile()) throw httpError(404, 'Nie znaleziono załącznika.');
      return {
        path: storedPath,
        name: sanitizeFileName(file.name),
        ext,
        mime: ALLOWED.get(ext),
        size: stat.size,
        uploadedAt: file.uploadedAt,
      };
    }
    throw httpError(404, 'Nie znaleziono załącznika.');
  }
}

module.exports = {
  AttachmentStore,
  ALLOWED_EXTENSIONS: [...ALLOWED.keys()],
  ALLOWED_LABEL,
  sanitizeFileName,
  assertFileSignature,
  normalizeLinkUrl,
  sanitizeLinkTitle,
  classInfoOf,
  mergeMeta,
};
