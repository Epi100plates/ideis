// Ustawia styl i tło przed pierwszym malowaniem (zinmy start PWA nie mignie
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
  var picked = 'lg2-dark';
  try {
    var prefs = JSON.parse(localStorage.getItem('plan-zajec:v2') || '{}');
    if (prefs.styleId) picked = prefs.styleId;
    else if (prefs.theme && prefs.theme !== 'auto') picked = prefs.theme;
  } catch (e) { /* tryb prywatny — zostają domyślne */ }
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
})();
