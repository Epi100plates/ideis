#!/usr/bin/env node
'use strict';
/**
 * Jednorazowe pobranie planu i zapis do plików (JSON / ICS / CSV).
 * Przydatne do sprawdzenia, czy scraper działa, oraz do eksportu offline.
 *
 *   node scripts/dump.js                 # do katalogu ./out
 *   node scripts/dump.js --group 21189   # inna grupa
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { fetchPlan } = require('../server/scraper');
const { toICS, toCSV } = require('../server/export');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

(async () => {
  const group = String(arg('group', process.env.GROUP_ID || '21188'));
  const outDir = path.resolve(arg('out', 'out'));

  console.log(`Pobieram plan grupy ${group}…`);
  const plan = await fetchPlan(group);

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, `plan-${group}.json`), JSON.stringify(plan, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, `plan-${group}.ics`), toICS(plan), 'utf8');
  await fs.writeFile(path.join(outDir, `plan-${group}.csv`), toCSV(plan), 'utf8');

  const m = plan.meta;
  console.log(`OK — ${m.classes} zajęć w ${m.days} dniach`);
  console.log(`   grupa:   ${m.groupName} (${m.groupCode})`);
  console.log(`   semestr: ${m.semesterFrom} → ${m.semesterTo}`);
  console.log(`   tryb:    ${m.stats.byMode.stacjonarne} stacjonarnych / ${m.stats.byMode.zdalne} zdalnych`);
  console.log(`   pliki:   ${outDir}`);
})().catch((err) => {
  console.error('BŁĄD:', err.message);
  process.exit(1);
});
