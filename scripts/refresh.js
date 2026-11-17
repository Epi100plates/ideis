#!/usr/bin/env node
'use strict';
/**
 * Odświeżenie cache planu (nadpisuje plik .cache/plan-<grupa>.json).
 * Nadaje się do crona, np.:
 *   17 * * * *  cd /opt/plan-grupy && /usr/bin/node scripts/refresh.js
 * (Aplikacja ma własny harmonogram: dni robocze 1×/dobę, weekendy 1×/h.)
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { fetchPlan } = require('../server/scraper');

const GROUP_ID = String(process.env.GROUP_ID || '21188');
const CACHE_DIR = process.env.CACHE_DIR || path.join(process.cwd(), '.cache');
const FILE = path.join(CACHE_DIR, `plan-${GROUP_ID}.json`);

(async () => {
  const plan = await fetchPlan(GROUP_ID);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(`${FILE}.tmp`, JSON.stringify({ savedAt: new Date().toISOString(), plan }, null, 0), 'utf8');
  await fs.rename(`${FILE}.tmp`, FILE);

  const m = plan.meta;
  console.log(`[${new Date().toLocaleString('pl-PL')}] cache odświeżony: ${m.classes} zajęć, ${m.days} dni → ${FILE}`);
})().catch((err) => {
  console.error('BŁĄD odświeżania:', err.message);
  process.exit(1);
});
