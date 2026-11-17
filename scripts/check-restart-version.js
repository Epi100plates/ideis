#!/usr/bin/env node
'use strict';
/**
 * Test tożsamości wersji planu przez restart serwera.
 *
 * Klient (`public/app.js`, funkcja `load`) pomija ponowne pobieranie planu, gdy
 * uzna swój cache za aktualny. Numer `version.id` jest jednak licznikiem
 * **w obrębie procesu** (`server/versions.js` → `nextId`), a po restarcie
 * `seed()` z pliku cache znowu daje wersję #1 — porównywanie numerów zostawiało
 * klienta ze starym planem na zawsze. Dlatego porównujemy **odcisk treści**
 * (`version.fingerprint`), którego wartość zależy tylko od planu.
 *
 * Scenariusz:
 *   1. świeży cache, plan P1 → wersja #1 (taką wersję zapisuje sobie klient),
 *   2. zmiana planu u uczelni (atrapa) → refresh → wersja #2, plan P2 na dysku,
 *   3. restart serwera → `seed()` z dysku → znowu wersja #1, ale plan P2,
 *   4. klient porównuje swoją tożsamość wersji z `/api/version`:
 *      różny odcisk → pobiera plan ponownie (tak jak `samePlanVersion`).
 *
 * Kod wyjścia 1 = kolizja tożsamości wersji (klient nigdy nie zobaczy zmiany).
 *
 *   node scripts/check-restart-version.js --fixtures=%TEMP%\aprfix
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const FIXTURES = opt('fixtures', path.join(process.env.TEMP || '.', 'aprfix'));
const PORT = Number(opt('port', '3124'));
const BASE = `http://127.0.0.1:${PORT}`;
const GROUP = opt('group', '21188');
const AY = opt('ay', '2026');
const CACHE = path.join(process.env.TEMP || '.', `plany-restart-${Date.now()}`);
const STATE = path.join(FIXTURES, 'state.json');
const SERVER = path.join(__dirname, '..', 'server', 'index.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const setSpec = (spec) => fs.writeFileSync(STATE, JSON.stringify({ [GROUP]: spec }, null, 1));

let child = null;

async function startServer() {
  child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      CACHE_DIR: CACHE,
      APR_BASE_URL: 'http://127.0.0.1:3150',
      REFRESH_MIN_GAP_S: '0',
      REFRESH_WEEKDAY_MIN: '100000',
      REFRESH_WEEKEND_MIN: '100000',
      DEFAULT_GROUP: GROUP,
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i += 1) {
    await sleep(500);
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* jeszcze nie wstał */ }
  }
  throw new Error('serwer nie wstał');
}

async function stopServer() {
  if (!child) return;
  const done = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([done, sleep(5000)]);
  child = null;
  await sleep(500);
}

async function getJson(url) {
  const res = await fetch(`${BASE}${url}`, { headers: { 'user-agent': 'PlanZajecTest/1.0' } });
  return res.json();
}

/**
 * Ta sama reguła co `samePlanVersion()` w `public/app.js`: odcisk treści,
 * potem czas pobrania, a numer wersji tylko jako ostatnia deska ratunku
 * (starszy serwer bez odcisku).
 */
function samePlanVersion(known, server) {
  if (!server || !known) return false;
  const serverPrint = server.currentFingerprint || server.fingerprint;
  if (serverPrint && known.fingerprint) return serverPrint === known.fingerprint;
  const serverFetchedAt = server.currentFetchedAt || server.fetchedAt;
  if (serverFetchedAt && known.fetchedAt) return serverFetchedAt === known.fetchedAt;
  const serverId = server.currentId != null ? server.currentId : server.id;
  return serverId != null && known.id === serverId;
}

async function main() {
  if (!fs.existsSync(path.join(FIXTURES, 'grid-21188.html'))) {
    throw new Error(`brak fixtur w ${FIXTURES} — uruchom najpierw scripts/capture-grid.js`);
  }
  fs.rmSync(CACHE, { recursive: true, force: true });
  fs.mkdirSync(CACHE, { recursive: true });
  setSpec({});
  console.log(`Aplikacja: ${BASE}, cache: ${CACHE}\n`);

  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`);
  };

  await startServer();

  // 1) plan wyjściowy — to zapisuje sobie klient
  const p1 = await getJson(`/api/plan?group=${GROUP}&ay=${AY}`);
  const clientVersionId = p1.version?.id;
  const clientClasses = p1.classes?.length;
  console.log(`krok 1: plan P1 — ${clientClasses} zajęć, wersja #${clientVersionId}`);
  check('plan wyjściowy to wersja #1', clientVersionId === 1, `#${clientVersionId}`);

  // 2) zmiana u uczelni → nowa wersja
  setSpec({ dropRow: 3 });
  const refreshed = await fetch(`${BASE}/api/refresh?group=${GROUP}&ay=${AY}`, { method: 'POST' }).then((r) => r.json());
  const newVersionId = refreshed.version?.id;
  const newClasses = refreshed.classes?.length;
  console.log(`krok 2: po zmianie u uczelni — ${newClasses} zajęć, wersja #${newVersionId}`);
  check('zmiana planu dała nową wersję', Boolean(refreshed.newVersion) && newClasses === clientClasses - 1,
    `#${clientVersionId} → #${newVersionId}, ${clientClasses} → ${newClasses} zajęć`);

  // 3) restart serwera — cache na dysku zostaje
  await stopServer();
  await startServer();
  const afterRestart = await getJson(`/api/plan?group=${GROUP}&ay=${AY}`);
  const restartVersionId = afterRestart.version?.id;
  const restartClasses = afterRestart.classes?.length;
  console.log(`krok 3: po restarcie — ${restartClasses} zajęć, wersja #${restartVersionId}`);
  check('serwer po restarcie ma nowy plan', restartClasses === newClasses, `${restartClasses} zajęć (oczekiwano ${newClasses})`);

  // 4) klient: czy rozpozna, że ma stary plan?
  const status = await getJson(`/api/version?group=${GROUP}&ay=${AY}`);
  const clientWouldRefetch = !samePlanVersion(p1.version, status);
  const clientSeesStale = !clientWouldRefetch && clientClasses !== restartClasses;
  console.log(`krok 4: klient ma wersję #${clientVersionId} (odcisk ${p1.version && p1.version.fingerprint}, `
    + `${clientClasses} zajęć), serwer podaje #${status.currentId} `
    + `(odcisk ${status.currentFingerprint}, ${restartClasses} zajęć)`);
  console.log(`        → klient ${clientWouldRefetch ? 'pobrałby plan ponownie' : 'uznałby swój cache za aktualny'}`);
  check('tożsamość wersji pozwala rozpoznać zmianę po restarcie', !clientSeesStale,
    clientSeesStale
      ? `kolizja: #${clientVersionId} == #${status.currentId}, klient zostaje przy ${clientClasses} zajęciach mimo ${restartClasses} u uczelni`
      : 'odcisk treści inny — klient dociąga nowy plan');
  check('serwer podaje odcisk treści w /api/version',
    typeof status.currentFingerprint === 'string' && status.currentFingerprint.length === 16,
    String(status.currentFingerprint));

  await stopServer();
  fs.rmSync(CACHE, { recursive: true, force: true });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} sprawdzeń przeszło.`);
  if (failed.length) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await stopServer().catch(() => {});
  process.exit(1);
});
