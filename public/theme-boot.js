// Ustawia styl i tło przed pierwszym malowaniem (zimny start PWA nie mignie
// jasnym tłem). Osobny plik, bo CSP nie pozwala na inline <script>.

(function () {
  var colors = {
    'lg1-dark': '#030303', 'lg1-light': '#dce4ee',
    'lg2-dark': '#04070c', 'lg2-light': '#d5e7f7',
    'lg3-dark': '#0a0806', 'lg3-light': '#e8decf',
    'visionos-dark': '#05070d', 'visionos-light': '#e5dbcd',
    'visionos-perf-dark': '#05070d', 'visionos-perf-light': '#e5dbcd',
    'apple': '#f5f5f7', 'light': '#f4f6fb', 'dark': '#0b0e13',
    'violet-dark': '#07040f', 'violet-light': '#f2eeff',
    'pink-dark': '#0d040a', 'pink-light': '#ffeff5',
    'mix-dark': '#08040d', 'mix-light': '#f6eefb'
  };
  var dark = {
    'lg1-light': false, 'lg2-light': false, 'lg3-light': false,
    'visionos-light': false, 'visionos-perf-light': false, 'apple': false, 'light': false,
    'violet-light': false, 'pink-light': false, 'mix-light': false
  };

  // Luminancja względna wg WCAG (0–1) i próg 0.179 — ten sam co w
  // `CustomTheme.kt` i `styles.js`: poniżej progu motyw jest ciemny.
  function luminance(hex) {
    var v = parseInt(hex.slice(1), 16);
    var channel = function (value) {
      var srgb = value / 255;
      return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel((v >> 16) & 255)
      + 0.7152 * channel((v >> 8) & 255)
      + 0.0722 * channel(v & 255);
  }

  var prefs = {};
  try {
    prefs = JSON.parse(localStorage.getItem('plan-zajec:v2') || '{}') || {};
  } catch (e) { /* tryb prywatny — zostają domyślne */ }

  // Motyw „Własny”: tło wybiera użytkownik, więc bez odczytu zapisu zimny start
  // mignąłby domyślnym granatem. Tonacja też wynika z tego koloru.
  var customBg = '#0c0a18';
  var rawBg = String(prefs.customBackground || '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(rawBg)) customBg = rawBg;
  colors.custom = customBg;
  dark.custom = luminance(customBg) < 0.179;

  var picked = 'lg2-dark';
  if (prefs.styleId) picked = prefs.styleId;
  else if (prefs.theme && prefs.theme !== 'auto') picked = prefs.theme;
  if (picked === 'glass') picked = 'lg2-dark';
  if (picked === 'lg2-fast' || picked === 'visionos-fast') picked = 'visionos-perf-dark';
  if (picked === 'auto') picked = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  if (!colors[picked]) picked = 'lg2-dark';
  var root = document.documentElement;
  root.dataset.style = picked;
  root.dataset.tone = dark[picked] === false ? 'light' : 'dark';
  root.style.backgroundColor = colors[picked];
  root.style.colorScheme = dark[picked] === false ? 'light' : 'dark';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', colors[picked]);
}());
