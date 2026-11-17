'use strict';
/**
 * Walidacja numeru grupy w jednym miejscu.
 *
 * Numer grupy trafia do nazwy pliku cache i do zapytania do uczelni, więc
 * musi być wyłącznie ciągiem 2–8 cyfr. Dzięki temu `?group=../../etc` nigdy
 * nie wyjdzie poza katalog cache.
 */

function groupIdFromValue(raw, fallback = '21188') {
  const value = String(raw ?? '').trim() || String(fallback);
  if (!/^\d{2,8}$/.test(value)) {
    throw Object.assign(new Error('Nieprawidłowy numer grupy'), { status: 400 });
  }
  return value;
}

module.exports = { groupIdFromValue };
