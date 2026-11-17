#!/usr/bin/env node
'use strict';
/**
 * Test zmiany planu „w trakcie działania aplikacji”.
 *
 * Wymaga: `scripts/mock-apr.js` (atrapa uczelni) i serwera aplikacji
 * wskazującego na atrapę (`APR_BASE_URL`).
 *
 *   node scripts/check-plan-change.js --base=http://127.0.0.1:3122 \
 *        --fixtures=%TEMP%\aprfix --group=21188 --ay=2026
 *
 * Scenariusz:
 *   1. plan wyjściowy (wersja #1),
 *   2. odwołanie jednych zajęć u uczelni → refresh → nowa wersja + diff `removed`,
 *   3. nowe zajęcia u uczelni → refresh → kolejna wersja + diff `added`,
 *   4. zmiana sali → refresh → „te same zajęcia, inne szczegóły” (`changed`),
 *   5. zmiana tylko „Formy zaliczenia” → refresh → **audyt wykrywalności**,
 *   6. historia wersji: stare wersje nadal dostępne pod `?version=`,
 *   7. brak zmian → refresh nie tworzy nowej wersji (`newVersion:false`).
 */

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const BASE = (opt('base', 'http://127.0.0.1:3122')).replace(/\/$/, '');
const FIXTURES = opt('fixtures', path.join(process.env.TEMP || '.', 'aprfix'));
const GROUP = opt('group', '21188');
const AY = opt('ay', '2026');
const STATE = path.join(FIXTURES, 'state.json');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function setSpec(spec) {
  fs.writeFileSync(STATE, JSON.stringify({ [GROUP]: spec }, null, 1), 'utf8');
}

async function getJson(url) {
  const res = await fetch(`${BASE}${url}`, { headers: { 'user-agent': 'PlanZajecTest/1.0' } });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* nie JSON */ }
  return { status: res.status, data, text };
}

async function postJson(url) {
  const res = await fetch(`${BASE}${url}`, { method: 'POST', headers: { 'user-agent': 'PlanZajecTest/1.0' } });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const planUrl = `/api/plan?group=${GROUP}&ay=${AY}`;
const refreshUrl = `/api/refresh?group=${GROUP}&ay=${AY}`;

async function main() {
  console.log(`Aplikacja: ${BASE}, grupa ${GROUP}, rok ${AY}, atrapa: ${FIXTURES}\n`);

  setSpec({});
  const v1 = await getJson(planUrl);
  if (!v1.data || !v1.data.ok) throw new Error(`plan wyjściowy: HTTP ${v1.status}`);
  const id1 = v1.data.version?.id;
  const c1 = v1.data.classes?.length || 0;
  console.log(`start: wersja #${id1}, ${c1} zajęć, fetchedAt ${v1.data.version?.fetchedAt}`);
  check('plan wyjściowy ma zajęcia', c1 > 0, `${c1} zajęć`);

  // --- 2. odwołane zajęcia -------------------------------------------------
  setSpec({ dropRow: 3 });
  const r2 = await postJson(refreshUrl);
  const id2 = r2.data?.version?.id;
  const c2 = r2.data?.classes?.length || 0;
  check('odwołanie zajęć tworzy nową wersję', Boolean(r2.data?.newVersion) && id2 !== id1, `#${id1} → #${id2}`);
  check('plan po odwołaniu ma o 1 zajęcia mniej', c2 === c1 - 1, `${c1} → ${c2}`);
  const removedCount = r2.data?.version?.diff?.removed ?? null;
  check('diff zgłasza 1 usunięte zajęcie', removedCount === 1, `removed=${removedCount}, added=${r2.data?.version?.diff?.added}, changed=${r2.data?.version?.diff?.changed}`);

  // --- 3. nowe zajęcia ----------------------------------------------------
  setSpec({ dropRow: 3, addRow: true });
  const r3 = await postJson(refreshUrl);
  const id3 = r3.data?.version?.id;
  const c3 = r3.data?.classes?.length || 0;
  check('nowe zajęcia tworzą kolejną wersję', Boolean(r3.data?.newVersion) && id3 !== id2, `#${id2} → #${id3}`);
  check('plan po dodaniu ma z powrotem tyle samo zajęć', c3 === c1, `${c2} → ${c3}`);
  check('diff zgłasza 1 dodane zajęcie', (r3.data?.version?.diff?.added ?? null) === 1, `added=${r3.data?.version?.diff?.added}`);

  // --- 4. zmiana sali -----------------------------------------------------
  // Bierzemy salę z pierwszego zajęcia, żeby podmiana trafiła w istniejący wiersz.
  const firstRoom = (r3.data?.classes || []).map((c) => c.roomRaw).find((r) => r && /^[A-Za-z]\d+\s/.test(r));
  setSpec({ dropRow: 3, addRow: true, replace: [[firstRoom, 'Z99 999']] });
  const r4 = await postJson(refreshUrl);
  const id4 = r4.data?.version?.id;
  const hasNewRoom = (r4.data?.classes || []).some((c) => c.roomRaw === 'Z99 999');
  check('zmiana sali tworzy nową wersję', Boolean(r4.data?.newVersion) && id4 !== id3, `#${id3} → #${id4} (sala „${firstRoom}” → „Z99 999”)`);
  check('nowa sala jest w planie', hasNewRoom, hasNewRoom ? 'Z99 999' : 'brak');
  check('diff zgłasza zmianę szczegółów', (r4.data?.version?.diff?.changed ?? 0) >= 1, `changed=${r4.data?.version?.diff?.changed}`);

  // --- 5. zmiana tylko formy zaliczenia -----------------------------------
  // `Forma zaliczenia` jest w `diff.detailsSignature()`, ale nie w odcisku
  // wersji (`versions.fingerprint`) — sprawdzamy, czy aplikacja to zauważy.
  const passForms = (r4.data?.classes || []).map((c) => c.passForm).filter(Boolean);
  const firstPass = passForms[0];
  setSpec({ dropRow: 3, addRow: true, replace: [[firstPass, `${firstPass} (zmienione)`]] });
  const r5 = await postJson(refreshUrl);
  const id5 = r5.data?.version?.id;
  const newPass = (r5.data?.classes || []).some((c) => c.passForm === `${firstPass} (zmienione)`);
  check('nowa forma zaliczenia jest w planie', newPass, newPass ? `${firstPass} → ${firstPass} (zmienione)` : 'brak');
  check('zmiana formy zaliczenia tworzy nową wersję', Boolean(r5.data?.newVersion) && id5 !== id4,
    `#${id4} → #${id5} (newVersion=${r5.data?.newVersion})`);

  // --- 6. historia wersji -------------------------------------------------
  const hist = await getJson(`/api/versions?group=${GROUP}&ay=${AY}`);
  const versions = hist.data?.versions || [];
  check('historia zawiera wszystkie wersje', versions.length >= 4, `${versions.length} wersji: ${versions.map((v) => `#${v.id}(${v.classes})`).join(' ')}`);
  const old = await getJson(`/api/plan?group=${GROUP}&ay=${AY}&version=${id1}`);
  check('stara wersja nadal dostępna', old.status === 200 && (old.data?.classes?.length || 0) === c1,
    `#${id1}: ${old.data?.classes?.length} zajęć`);

  // --- 7. brak zmian ------------------------------------------------------
  const r7 = await postJson(refreshUrl);
  check('bez zmian u uczelni nie ma nowej wersji', r7.data?.newVersion === false, `newVersion=${r7.data?.newVersion}, wersja #${r7.data?.version?.id}`);

  // --- podsumowanie -------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} sprawdzeń przeszło.`);
  if (failed.length) {
    console.log('Niepowodzenia:');
    for (const f of failed) console.log(` - ${f.name} (${f.detail})`);
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
