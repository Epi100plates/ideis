#!/usr/bin/env node
'use strict';
/**
 * Sonda: które zmiany u uczelni tworzą nową wersję planu.
 *
 * Dla każdego pola podmienia **tylko jedną rzecz** i sprawdza, czy serwer
 * zgłosił `newVersion`. Pole, które zmienia treść planu, ale nie odcisk wersji
 * (`server/versions.js` → `fingerprint`), wypada jako ✗ — wersja zostaje ta
 * sama, więc aplikacja nigdy nie powie użytkownikowi o zmianie.
 *
 *   node scripts/probe-fields.js --base=http://127.0.0.1:3122 \
 *        --fixtures=%TEMP%\aprfix --group=21188 --ay=2026
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

const setSpec = (spec) => fs.writeFileSync(STATE, JSON.stringify({ [GROUP]: spec }, null, 1), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function refresh() {
  const res = await fetch(`${BASE}/api/refresh?group=${GROUP}&ay=${AY}`, {
    method: 'POST', headers: { 'user-agent': 'PlanZajecTest/1.0' },
  });
  return res.json();
}

async function plan() {
  const res = await fetch(`${BASE}/api/plan?group=${GROUP}&ay=${AY}`, {
    headers: { 'user-agent': 'PlanZajecTest/1.0' },
  });
  return res.json();
}

/** Reset do stanu bazowego: bez mutacji. */
async function reset() {
  setSpec({});
  await refresh();
  await sleep(150);
  return plan();
}

/**
 * Jedna zmiana naraz: najpierw wracamy do stanu bazowego (bez mutacji), potem
 * dopiero wprowadzamy pojedynczą podmianę. Bez resetu każda kolejna sonda
 * cofałaby poprzednią mutację i „nowa wersja” brałaby się z cofnięcia.
 */
async function probe(label, spec, verify) {
  await reset();
  const before = await plan();
  setSpec(spec);
  const after = await refresh();
  const changedInPlan = verify ? verify(after) : null;
  const verdict = after.newVersion ? '✓ nowa wersja' : '✗ BEZ nowej wersji';
  console.log(`${verdict.padEnd(20)} ${label.padEnd(34)} `
    + `#${before.version?.id} → #${after.version?.id}`
    + (verify ? `  pole w planie zmienione: ${changedInPlan ? 'tak' : 'NIE'}` : ''));
  return { label, newVersion: Boolean(after.newVersion), planChanged: changedInPlan };
}

async function main() {
  console.log(`Aplikacja: ${BASE}, grupa ${GROUP}, atrapa: ${FIXTURES}\n`);
  const base = await reset();
  const cls = base.classes || [];
  const room = cls.map((c) => c.roomRaw).find((r) => r && /^[A-Za-z]\d+\s/.test(r));
  const lecturer = cls.map((c) => c.lecturer).find(Boolean);
  const passForm = cls.map((c) => c.passForm).find(Boolean);
  const subject = cls.map((c) => c.subject).find(Boolean);
  const notesRow = cls.find((c) => c.notes);
  console.log(`baza: ${cls.length} zajęć; sala „${room}”, prowadzący „${lecturer}”, forma „${passForm}”\n`);

  const out = [];
  out.push(await probe('sala', { replace: [[room, 'Z99 999']] },
    (d) => (d.classes || []).some((c) => c.roomRaw === 'Z99 999')));
  out.push(await probe('prowadzący', { replace: [[lecturer, `${lecturer} (zmiana)`]] },
    (d) => (d.classes || []).some((c) => c.lecturer === `${lecturer} (zmiana)`)));
  out.push(await probe('forma zaliczenia', { replace: [[passForm, `${passForm} (zmiana)`]] },
    (d) => (d.classes || []).some((c) => c.passForm === `${passForm} (zmiana)`)));
  out.push(await probe('nazwa przedmiotu', { replace: [[subject, `${subject} (zmiana)`]] },
    (d) => (d.classes || []).some((c) => c.subject === `${subject} (zmiana)`)));
  out.push(await probe('uwagi', { replace: [['>Brak<', '>Uwaga testowa<']] },
    (d) => (d.classes || []).some((c) => c.notes === 'Uwaga testowa')));
  out.push(await probe('godzina', { replace: [['>9:00<', '>9:15<']] },
    (d) => (d.classes || []).some((c) => c.start === '9:15')));

  // Przypisanie do grup (`groupIds`) steruje scalonym planem — jeśli uczelnia
  // przepnie zajęcia do innej grupy, a wersja tego nie widzi, plan scalony
  // pokaże nieaktualny zestaw zajęć bez żadnej informacji o zmianie.
  const gid = (cls.flatMap((c) => c.groupIds || [])).find(Boolean);
  if (gid) {
    out.push(await probe('przypisanie do grupy', { replace: [[`/Plany/PlanyGrup/${gid}`, '/Plany/PlanyGrup/29999']] },
      (d) => (d.classes || []).some((c) => (c.groupIds || []).includes('29999'))));
  }

  await reset();
  const bad = out.filter((r) => r.planChanged && !r.newVersion);
  console.log(`\n${out.length - bad.length}/${out.length} pól wykrytych jako zmiana wersji.`);
  if (bad.length) {
    console.log('Zmiany widoczne w planie, ale NIEWIDOCZNE dla wersji:');
    for (const b of bad) console.log(` - ${b.label}`);
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
