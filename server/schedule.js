'use strict';
/**
 * Harmonogram odświeżania planu.
 *
 * Wymaganie: w dni robocze raz na dobę, w weekendy raz na godzinę.
 * Liczymy to od ostatniego rzeczywistego sprawdzenia (lastCheckAt), a nie od
 * północy — dzięki temu po restarcie nie trzeba czekać do kolejnego okna.
 */

function isWeekend(date = new Date()) {
  const day = date.getDay(); // 0 = niedziela, 6 = sobota
  return day === 0 || day === 6;
}

function gapMinutes(date = new Date(), { weekdayMin = 1440, weekendMin = 60 } = {}) {
  return Math.max(1, isWeekend(date) ? weekendMin : weekdayMin);
}

module.exports = { isWeekend, gapMinutes };
