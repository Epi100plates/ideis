'use strict';
/**
 * Kontrola list z formularza uczelni: czy każdy kierunek i specjalność da się
 * przetłumaczyć na wartość katalogu grup, po której filtruje picker.
 *
 *   node scripts/check-ideis-selection.js
 *
 * Sprawdza na żywo (nie z fixture'a):
 *   - kierunki: każdy z formularza ma pole „Kierunek” w katalogu,
 *   - specjalności: każda ma wartość w katalogu (dokładną, skrótowiec, prefiks),
 *   - ile grup przypada na specjalność (0 = pozycja bez planu, np. „Syracuse”).
 *
 * Kod wyjścia 1, gdy pokrycie spadnie poniżej 90% — to sygnał, że uczelnia
 * zmieniła nazwy i trzeba poprawić `server/ideis-selection.js`.
 */

const { fetchCatalog } = require('../server/groups');
const combos = require('../server/ideis-combos');
const { kierunkiFor, specjalnosciFor } = require('../server/ideis-selection');

(async () => {
  const groups = await fetchCatalog();
  const site = await combos.kierunki({ force: true });
  const kierunki = kierunkiFor(groups, site.items);
  const missingFields = kierunki.filter((item) => item.missing);

  let specs = 0;
  let mapped = 0;
  const withoutGroups = [];
  for (const kierunek of kierunki) {
    if (!kierunek.groups) continue;
    const list = await combos.specjalnosci(kierunek.id, { force: true }).catch(() => ({ items: [] }));
    const items = specjalnosciFor(groups, kierunek.field, list.items)
      .filter((item) => item.source === 'site');
    for (const item of items) {
      specs += 1;
      if (item.value) mapped += 1;
      if (!item.value || item.groups === 0) {
        withoutGroups.push(`${kierunek.label} / „${item.label}”`);
      }
    }
  }

  const coverage = specs ? (mapped / specs) * 100 : 0;
  console.log(`kierunki: ${kierunki.length} (bez pola w katalogu: ${missingFields.length})`);
  if (missingFields.length) {
    for (const item of missingFields) console.log(`  BRAK KIERUNKU: ${item.label}`);
  }
  console.log(`specjalności z formularza: ${specs}, przetłumaczone na katalog: ${mapped} (${coverage.toFixed(1)}%)`);
  if (withoutGroups.length) {
    console.log(`specjalności bez grup (${withoutGroups.length}):`);
    for (const line of withoutGroups.slice(0, 25)) console.log(`  - ${line}`);
  }
  if (coverage < 90) {
    console.error('Pokrycie poniżej 90% — sprawdź nazwy w formularzu uczelni.');
    process.exitCode = 1;
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
