#!/usr/bin/env node
'use strict';
/**
 * Kontrola jakości wymiarów: czy wybór grupy w pickerze prowadzi do właściwego
 * planu. Nie porównujemy naszych danych z naszymi danymi — bierzemy to, co
 * uczelnia sama pisze w kolumnie „Tok studiów” planu (np.
 * „Informatyka N lic. 3.50 2025/2026 Zima”) i sprawdzamy, czy zgadza się to
 * z rokiem akademickim (`ay`), sezonem (semestr parzysty/nieparzysty)
 * i trybem wyprowadzonymi w `server/dimensions.js`.
 *
 *   node scripts/check-dimensions.js                    # 20 grup z całego katalogu
 *   node scripts/check-dimensions.js --groups=40        # więcej próbek
 *   node scripts/check-dimensions.js --base=http://127.0.0.1:3111
 *
 * Kod wyjścia 1 = znaleziono rozjazd (nadaje się do CI / ręcznej kontroli po
 * zmianie parsera katalogu).
 */

const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '').split('=')[1]
  || process.env.BASE_URL
  || 'https://ideis.mati-it.pl';
const WANTED = Number((process.argv.find((a) => a.startsWith('--groups=')) || '').split('=')[1] || 20);

/** „Informatyka N lic. 3.50 2025/2026 Zima” → { year: 2025, season: 'Zima', mode: 'N' } */
function parseTok(tok) {
  const text = String(tok || '').replace(/\u00a0/g, ' ').trim();
  if (!text) return null;
  const year = /(\d{4})\s*\/\s*(\d{4})/.exec(text);
  const season = /(Zima|Lato)\b/.exec(text);
  const mode = /(?:^|\s)([NS])(?=\s)/.exec(text);
  if (!year) return null;
  return {
    year: Number(year[1]),
    season: season ? season[1] : null,
    mode: mode ? mode[1] : null,
  };
}

/**
 * Plan grupy może mieć kilka toków naraz (kolumna „Tok studiów” to lista
 * oddzielona przecinkami) — np. Erasmus+ zbiera zajęcia z kilku kierunków
 * i lat. Dlatego dopasowujemy się do dowolnego toku, nie tylko pierwszego.
 */
function parseToks(tok) {
  return String(tok || '')
    .split(/\s*,\s*/)
    .map(parseTok)
    .filter(Boolean);
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${path}`);
  return res.json();
}

function seasonOf(semester) {
  if (!Number.isInteger(semester) || semester < 1) return null;
  return semester % 2 === 1 ? 'Zima' : 'Lato';
}

async function main() {
  const catalog = await getJson('/api/groups');
  const groups = catalog.groups || [];
  if (!groups.length) throw new Error('Pusty katalog grup');

  const step = Math.max(1, Math.floor(groups.length / WANTED));
  const sample = [];
  for (let i = 0; i < groups.length && sample.length < WANTED; i += step) sample.push(groups[i]);
  // Znane przypadki brzegowe: 1. rok bez specjalności, 2. rok, grupa bez toków.
  const pinned = ['21188', '20735', '20437', '20679', '22413'];
  for (const id of pinned) {
    const found = groups.find((g) => String(g.id) === id);
    if (found && !sample.some((g) => String(g.id) === id)) sample.push(found);
  }

  let checked = 0;
  let skipped = 0;
  const stale = [];
  const problems = [];

  for (const group of sample) {
    if (!group.b || !group.b.length) {
      skipped += 1;
      continue;
    }
    const year = Number(group.y) || 1;
    // Od najnowszego naboru w dół: najpierw ten, który uczelnia ma jeszcze
    // opublikowany (starsze roczniki bywają puste, wtedy nie ma czego sprawdzić).
    const nabory = [...group.b].sort((a, b) => b - a);
    let verified = false;

    for (const nabor of nabory) {
      if (verified) break;
      const ay = Number(nabor) + (year - 1);
      let plan;
      try {
        plan = await getJson(`/api/plan?group=${group.id}&ay=${ay}`);
      } catch (err) {
        problems.push(`${group.id} ay=${ay}: ${err.message}`);
        continue;
      }
      if (!plan.classes || !plan.classes.length) continue;
      const toks = parseToks(plan.meta && plan.meta.tok);
      if (!toks.length) continue;
      verified = true;
      checked += 1;
      // Rok akademicki musi się znaleźć w którymś toku planu — inaczej `ay`
      // wskazałby plan innego rocznika. Uwaga: uczelnia nie odświeża toków
      // od razu, więc plan na bieżący rok może mieć jeszcze tok sprzed roku
      // (albo sprzed dwóch). Taki wpis trafia do „uwag”, nie do błędów —
      // błędem jest tylko tok z przyszłości (plan udający nowszy rok).
      const sameYear = toks.filter((tok) => tok.year === ay);
      if (!sameYear.length) {
        const newest = Math.max(...toks.map((tok) => tok.year));
        if (newest > ay) {
          problems.push(`${group.id} (${group.n}) ay=${ay}: tok mówi ${toks.map((t) => t.year).join(', ')}`);
        } else {
          stale.push(`${group.id} (${group.n}) ay=${ay}: tok mówi ${toks.map((t) => t.year).join(', ')}`);
        }
        continue;
      }
      // Sezon semestru: Zima = semestr nieparzysty, Lato = parzysty.
      const expectedSeason = seasonOf(group.sem);
      if (expectedSeason) {
        const seasons = sameYear.map((tok) => tok.season).filter(Boolean);
        if (seasons.length && !seasons.includes(expectedSeason)) {
          problems.push(
            `${group.id} (${group.n}) sem=${group.sem}: tok mówi ${seasons.join(', ')}, oczekiwano ${expectedSeason}`,
          );
        }
      }
      if (group.m) {
        const modes = sameYear.map((tok) => tok.mode).filter(Boolean);
        if (modes.length && !modes.includes(group.m)) {
          problems.push(`${group.id} (${group.n}): tryb ${group.m}, tok mówi ${modes.join(', ')}`);
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(`Sprawdzono ${checked} planów (${sample.length} grup, pominięto ${skipped} bez toków).`);
  if (stale.length) {
    console.log(`\nUwagi — uczelnia nie odświeżyła toku na bieżący rok (${stale.length}):`);
    for (const line of stale) console.log(`  · ${line}`);
  }
  if (problems.length) {
    console.log(`\nRozjazdy (${problems.length}):`);
    for (const line of problems) console.log(`  ✗ ${line}`);
    process.exitCode = 1;
  } else {
    console.log('✓ rok akademicki, sezon semestru i tryb zgadzają się z tokami uczelni');
  }
}

main().catch((err) => {
  console.error('Błąd kontroli:', err.message);
  process.exit(1);
});
