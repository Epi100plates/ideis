'use strict';

/* ============================================================================
   Katalog stylów — dane 1:1 z natywnej aplikacji Android.

   Źródło: android/app/src/main/java/pl/matiit/planzajec/ui/theme/StyleCatalog.kt
   Kolory zapisane jako ARGB w tej samej postaci co w Kotlinie
   (`color(0x08D6ECFF)` → '08D6ECFF'), żeby `node scripts/self-test.js` mógł
   porównać oba katalogi i wykryć rozjazd.

   Plik nie dotyka DOM — ładuje się przed app.js i wystawia `window.PlanStyles`.
   ========================================================================== */

(function (global) {
  /** StyleCatalog.styles — kolejność, podpisy i grupy jak w Compose. */
  const STYLES = [
    { id: 'lg1-dark', label: 'Liquid Glass 1', hint: 'ciemny · czarne, minimalne szkło', group: 'lg' },
    { id: 'lg1-light', label: 'Liquid Glass 1', hint: 'jasny · srebrny, miękki blask', group: 'lg' },
    { id: 'lg2-dark', label: 'Liquid Glass 2', hint: 'ciemny · ultraclear, mocny refleks', group: 'lg' },
    { id: 'lg2-light', label: 'Liquid Glass 2', hint: 'jasny · lodowy, bardzo przejrzysty', group: 'lg' },
    { id: 'lg3-dark', label: 'Liquid Glass 3', hint: 'ciemny · mrożony grafit', group: 'lg' },
    { id: 'lg3-light', label: 'Liquid Glass 3', hint: 'jasny · ciepły, mleczny frost', group: 'lg' },
    { id: 'visionos-dark', label: 'visionOS', hint: 'ciemny · głęboka przestrzeń', group: 'visionos' },
    { id: 'visionos-light', label: 'visionOS', hint: 'jasny · dzienne światło', group: 'visionos' },
    { id: 'visionos-perf-dark', label: 'visionOS Wydajny', hint: 'ciemny · ten sam wygląd, bez rozmywania', group: 'visionos' },
    { id: 'visionos-perf-light', label: 'visionOS Wydajny', hint: 'jasny · ten sam wygląd, bez rozmywania', group: 'visionos' },
    { id: 'apple', label: 'Apple', hint: 'jasny, czysty — jak apple.com/pl/os', group: 'classic' },
    { id: 'auto', label: 'Auto', hint: 'jak system', group: 'classic' },
    { id: 'light', label: 'Jasny', hint: 'klasyczny', group: 'classic' },
    { id: 'dark', label: 'Ciemny', hint: 'na noc', group: 'classic' },
    { id: 'violet-dark', label: 'Fiolet', hint: 'ciemny · aksamitny fiolet', group: 'color' },
    { id: 'violet-light', label: 'Fiolet', hint: 'jasny · lawendowe światło', group: 'color' },
    { id: 'pink-dark', label: 'Róż', hint: 'ciemny · różowa poświata', group: 'color' },
    { id: 'pink-light', label: 'Róż', hint: 'jasny · pudrowy róż', group: 'color' },
    { id: 'mix-dark', label: 'Połączony', hint: 'ciemny · fiolet przechodzący w róż', group: 'color' },
    { id: 'mix-light', label: 'Połączony', hint: 'jasny · fiolet z różem', group: 'color' },
    /*
     * Motyw „Własny” nie ma stałej palety — liczy ją `customPalette` z dwóch
     * kolorów użytkownika (akcent + tło). `dark` opisuje tylko parę domyślną;
     * o tonacji decyduje kolor tła (tak samo jak w `CustomTheme.kt`).
     */
    { id: 'custom', label: 'Własny', hint: 'twoje dwa kolory · akcent i tło', group: 'custom' },
  ];

  const STYLE_GROUPS = [
    { key: 'lg', label: 'Liquid Glass' },
    { key: 'visionos', label: 'visionOS' },
    { key: 'classic', label: 'Klasyczne' },
    { key: 'color', label: 'Kolorowe' },
    { key: 'custom', label: 'Własny' },
  ];

  /**
   * StyleCatalog.paletteFor — każda paleta ma tło strony, gradient bazowy,
   * plamy „aurora”, materiał paneli i promień.
   */
  const PALETTES = {
    'lg1-dark': {
      id: 'lg1-dark',
      label: 'Liquid Glass 1',
      dark: true,
      page: 'FF030303',
      gradient: ['FF10163A', 'FF070A18', 'FF02040C'],
      blobs: [
        { c: 'FF655CFF', a: 0.62, cx: 0.12, cy: 0.02, rx: 0.80, ry: 0.62 },
        { c: 'FFFF5497', a: 0.36, cx: 0.94, cy: 0.08, rx: 0.66, ry: 0.56 },
        { c: 'FF00D0BB', a: 0.38, cx: 0.50, cy: 1.08, rx: 0.74, ry: 0.62 },
        { c: 'FF4884FF', a: 0.24, cx: 0.70, cy: 0.46, rx: 0.44, ry: 0.38 },
      ],
      panel: '08FFFFFF', panelSolid: 'FF111214', edge: '18FFFFFF',
      text: 'FFFFFFFF', textSoft: 'FFD6D6DA',
      accent: 'FFF2F2F4', accentOn: 'FF0A0A0A', accentSoft: '12FFFFFF',
      radius: 22,
    },
    'lg1-light': {
      id: 'lg1-light',
      label: 'Liquid Glass 1',
      dark: false,
      page: 'FFDCE4EE',
      gradient: ['FFEDE8FF', 'FFFFE4D6', 'FFD6EFF8'],
      blobs: [
        { c: 'FFA496FF', a: 0.44, cx: 0.08, cy: 0.00, rx: 0.72, ry: 0.62 },
        { c: 'FFFFB091', a: 0.42, cx: 0.96, cy: 0.04, rx: 0.62, ry: 0.56 },
        { c: 'FF78D2EB', a: 0.34, cx: 0.50, cy: 1.08, rx: 0.66, ry: 0.56 },
      ],
      panel: '5CFFFFFF', panelSolid: 'FFF7F9FC', edge: '1F233448',
      text: 'FF14161C', textSoft: 'FF4A5468',
      accent: 'FF4F46E5', accentOn: 'FFFFFFFF', accentSoft: 'FFEEF0FF',
      radius: 22,
    },
    'lg2-dark': {
      id: 'lg2-dark',
      label: 'Liquid Glass 2',
      dark: true,
      page: 'FF04070C',
      gradient: ['FF031522', 'FF04101A', 'FF01050A'],
      blobs: [
        { c: 'FF00CAFF', a: 0.50, cx: 0.08, cy: -0.02, rx: 0.82, ry: 0.66 },
        { c: 'FF4880FF', a: 0.38, cx: 0.96, cy: 0.06, rx: 0.66, ry: 0.56 },
        { c: 'FF00FFD0', a: 0.24, cx: 0.50, cy: 1.10, rx: 0.76, ry: 0.62 },
        { c: 'FF78F5FF', a: 0.13, cx: 0.58, cy: 0.40, rx: 0.42, ry: 0.36 },
      ],
      panel: '08D6ECFF', panelSolid: 'FF0A1622', edge: '29BEDCFF',
      text: 'FFFFFFFF', textSoft: 'FFC9D8E8',
      accent: 'FFDCECFF', accentOn: 'FF04121E', accentSoft: '1AAAD7FF',
      radius: 28,
    },
    'lg2-light': {
      id: 'lg2-light',
      label: 'Liquid Glass 2',
      dark: false,
      page: 'FFD5E7F7',
      gradient: ['FFF2FCFF', 'FFDCEFFC', 'FFC6DEF2'],
      blobs: [
        { c: 'FF68D8FF', a: 0.48, cx: 0.06, cy: -0.02, rx: 0.74, ry: 0.64 },
        { c: 'FF6094FF', a: 0.36, cx: 0.98, cy: 0.04, rx: 0.64, ry: 0.56 },
        { c: 'FF70FFD8', a: 0.28, cx: 0.50, cy: 1.10, rx: 0.66, ry: 0.58 },
      ],
      panel: '57FFFFFF', panelSolid: 'FFF5FBFF', edge: '211C4669',
      text: 'FF0F1A24', textSoft: 'FF425466',
      accent: 'FF0B63B8', accentOn: 'FFFFFFFF', accentSoft: 'FFDCEFFF',
      radius: 28,
    },
    'lg3-dark': {
      id: 'lg3-dark',
      label: 'Liquid Glass 3',
      dark: true,
      page: 'FF0A0806',
      gradient: ['FF1A120C', 'FF0E0906', 'FF040202'],
      blobs: [
        { c: 'FFFF9E42', a: 0.42, cx: 0.88, cy: -0.02, rx: 0.82, ry: 0.64 },
        { c: 'FFFF5C80', a: 0.24, cx: 0.02, cy: 0.10, rx: 0.70, ry: 0.58 },
        { c: 'FFB8683D', a: 0.22, cx: 0.50, cy: 1.10, rx: 0.80, ry: 0.64 },
        { c: 'FFFFD28C', a: 0.12, cx: 0.34, cy: 0.44, rx: 0.46, ry: 0.40 },
      ],
      panel: '0EFFF6EC', panelSolid: 'FF1A1512', edge: '29FFEBD7',
      text: 'FFFFFFFF', textSoft: 'FFE3D5C4',
      accent: 'FFFFE3BD', accentOn: 'FF241706', accentSoft: '24FFE3BD',
      radius: 22,
    },
    'lg3-light': {
      id: 'lg3-light',
      label: 'Liquid Glass 3',
      dark: false,
      page: 'FFE8DECF',
      gradient: ['FFFCF7EF', 'FFF0E5D6', 'FFE1D2BD'],
      blobs: [
        { c: 'FFFFB870', a: 0.46, cx: 0.90, cy: -0.02, rx: 0.74, ry: 0.62 },
        { c: 'FFFF849A', a: 0.30, cx: 0.02, cy: 0.08, rx: 0.64, ry: 0.56 },
        { c: 'FF9ABA88', a: 0.26, cx: 0.50, cy: 1.10, rx: 0.66, ry: 0.58 },
      ],
      panel: '8AFFFCF7', panelSolid: 'FFFBF6EE', edge: '2158442C',
      text: 'FF241B10', textSoft: 'FF5B4A37',
      accent: 'FF9A5B21', accentOn: 'FFFFFFFF', accentSoft: 'FFFFEBD5',
      radius: 22,
    },
    'visionos-dark': {
      id: 'visionos-dark',
      label: 'visionOS',
      dark: true,
      page: 'FF05070D',
      gradient: ['FF0A0E22', 'FF060814', 'FF02030A'],
      blobs: [
        { c: 'FF5C78FF', a: 0.56, cx: 0.12, cy: -0.02, rx: 0.82, ry: 0.66 },
        { c: 'FFBE52FF', a: 0.38, cx: 0.96, cy: 0.04, rx: 0.66, ry: 0.56 },
        { c: 'FFFFB262', a: 0.34, cx: 0.92, cy: 0.88, rx: 0.58, ry: 0.50 },
        { c: 'FF00D8C6', a: 0.26, cx: 0.18, cy: 1.10, rx: 0.74, ry: 0.60 },
      ],
      panel: '0DDCEAFF', panelSolid: 'FF0C1220', edge: '33FFE2BE',
      text: 'FFFFFFFF', textSoft: 'FFD8E2F0',
      accent: 'FFFFE2BE', accentOn: 'FF231505', accentSoft: '24FFE2BE',
      radius: 26,
    },
    'visionos-light': {
      id: 'visionos-light',
      label: 'visionOS',
      dark: false,
      page: 'FFE5DBCD',
      gradient: ['FFFCF7EF', 'FFEEE3D4', 'FFDDE4EE'],
      blobs: [
        { c: 'FFFFCC8E', a: 0.60, cx: 0.10, cy: -0.02, rx: 0.74, ry: 0.64 },
        { c: 'FFBE9CFF', a: 0.34, cx: 0.94, cy: 0.06, rx: 0.64, ry: 0.58 },
        { c: 'FF7CB8E6', a: 0.34, cx: 0.50, cy: 1.10, rx: 0.66, ry: 0.58 },
      ],
      panel: '75FFFDF9', panelSolid: 'FFFBF7F1', edge: '1F553C23',
      text: 'FF231A10', textSoft: 'FF5B4A37',
      accent: 'FF8A5B22', accentOn: 'FFFFFFFF', accentSoft: 'FFFFEBD5',
      radius: 26,
    },
    'visionos-perf-dark': {
      id: 'visionos-perf-dark',
      label: 'visionOS Wydajny',
      dark: true,
      page: 'FF05070D',
      gradient: ['FF0B1122', 'FF05070D', 'FF020309'],
      blobs: [],
      panel: 'FF10182B', panelSolid: 'FF0F1728', edge: '33FFE2BE',
      text: 'FFFFFFFF', textSoft: 'FFD8E2F0',
      accent: 'FFFFE2BE', accentOn: 'FF231505', accentSoft: 'FF262134',
      radius: 26,
    },
    'visionos-perf-light': {
      id: 'visionos-perf-light',
      label: 'visionOS Wydajny',
      dark: false,
      page: 'FFE5DBCD',
      gradient: ['FFFCF7EF', 'FFF0E7DA', 'FFE5DBCD'],
      blobs: [],
      panel: 'FFFFFBF5', panelSolid: 'FFFFFDF9', edge: '1F553C23',
      text: 'FF231A10', textSoft: 'FF5B4A37',
      accent: 'FF8A5B22', accentOn: 'FFFFFFFF', accentSoft: 'FFFFEBD5',
      radius: 26,
    },
    apple: {
      id: 'apple',
      label: 'Apple',
      dark: false,
      page: 'FFF5F5F7',
      gradient: ['FFFFFFFF', 'FFF5F5F7'],
      blobs: [],
      panel: 'F2FFFFFF', panelSolid: 'FFFFFFFF', edge: '14000000',
      text: 'FF1D1D1F', textSoft: 'FF424245',
      accent: 'FF0071E3', accentOn: 'FFFFFFFF', accentSoft: 'FFE8F2FF',
      radius: 18,
    },
    dark: {
      id: 'dark',
      label: 'Ciemny',
      dark: true,
      page: 'FF0B0E13',
      gradient: ['FF0F141C', 'FF0B0E13'],
      blobs: [],
      panel: 'FF1A1F2A', panelSolid: 'FF151A23', edge: '2EFFFFFF',
      text: 'FFE8ECF4', textSoft: 'FFB3BCCC',
      accent: 'FF8B8BFF', accentOn: 'FF14142B', accentSoft: 'FF1E1F3D',
      radius: 20,
    },
    light: {
      id: 'light',
      label: 'Jasny',
      dark: false,
      page: 'FFF4F6FB',
      gradient: ['FFF4F6FB', 'FFEDF1F8'],
      blobs: [],
      panel: 'CCFFFFFF', panelSolid: 'FFFFFFFF', edge: '1F1B2430',
      text: 'FF14161C', textSoft: 'FF4A5468',
      accent: 'FF4F46E5', accentOn: 'FFFFFFFF', accentSoft: 'FFEEF0FF',
      radius: 20,
    },
    'violet-dark': {
      id: 'violet-dark',
      label: 'Fiolet',
      dark: true,
      page: 'FF07040F',
      gradient: ['FF170B32', 'FF0B0518', 'FF04020A'],
      blobs: [
        { c: 'FF7C3AED', a: 0.56, cx: 0.10, cy: -0.02, rx: 0.82, ry: 0.66 },
        { c: 'FFC026D3', a: 0.30, cx: 0.96, cy: 0.06, rx: 0.66, ry: 0.56 },
        { c: 'FF4F46E5', a: 0.34, cx: 0.50, cy: 1.10, rx: 0.76, ry: 0.62 },
      ],
      panel: '0DE4D9FF', panelSolid: 'FF120A24', edge: '33D9CCFF',
      text: 'FFF3EEFF', textSoft: 'FFCFC4E8',
      accent: 'FFC4B5FD', accentOn: 'FF1B0F3A', accentSoft: '24C4B5FD',
      radius: 26,
    },
    'violet-light': {
      id: 'violet-light',
      label: 'Fiolet',
      dark: false,
      page: 'FFF2EEFF',
      gradient: ['FFFBF8FF', 'FFF0E9FF', 'FFE4DAFF'],
      blobs: [
        { c: 'FFA78BFA', a: 0.42, cx: 0.08, cy: -0.02, rx: 0.74, ry: 0.64 },
        { c: 'FFC084FC', a: 0.30, cx: 0.96, cy: 0.06, rx: 0.64, ry: 0.56 },
        { c: 'FF9AB6FF', a: 0.26, cx: 0.50, cy: 1.10, rx: 0.66, ry: 0.58 },
      ],
      panel: '75FFFFFF', panelSolid: 'FFFDFBFF', edge: '21301E63',
      text: 'FF1B1030', textSoft: 'FF4E3F6B',
      accent: 'FF6D28D9', accentOn: 'FFFFFFFF', accentSoft: 'FFEDE4FF',
      radius: 26,
    },
    'pink-dark': {
      id: 'pink-dark',
      label: 'Róż',
      dark: true,
      page: 'FF0D040A',
      gradient: ['FF2C0A1F', 'FF140510', 'FF07020A'],
      blobs: [
        { c: 'FFFF4D96', a: 0.52, cx: 0.10, cy: -0.02, rx: 0.82, ry: 0.66 },
        { c: 'FFB01E63', a: 0.34, cx: 0.96, cy: 0.06, rx: 0.66, ry: 0.56 },
        { c: 'FFFF8AB7', a: 0.22, cx: 0.50, cy: 1.10, rx: 0.76, ry: 0.62 },
      ],
      panel: '0DFFE4F0', panelSolid: 'FF1E0A16', edge: '33FFD1E3',
      text: 'FFFFF0F6', textSoft: 'FFE8C4D6',
      accent: 'FFFFB3CE', accentOn: 'FF3A0A1F', accentSoft: '24FFB3CE',
      radius: 24,
    },
    'pink-light': {
      id: 'pink-light',
      label: 'Róż',
      dark: false,
      page: 'FFFFEFF5',
      gradient: ['FFFFF8FB', 'FFFFECF3', 'FFFBD9E6'],
      blobs: [
        { c: 'FFFF9EC4', a: 0.44, cx: 0.92, cy: -0.02, rx: 0.74, ry: 0.62 },
        { c: 'FFFFC2D6', a: 0.30, cx: 0.04, cy: 0.08, rx: 0.64, ry: 0.56 },
        { c: 'FFF0A6C8', a: 0.24, cx: 0.50, cy: 1.10, rx: 0.66, ry: 0.58 },
      ],
      panel: '75FFFFFF', panelSolid: 'FFFFFBFD', edge: '21A03D63',
      text: 'FF2C0F1D', textSoft: 'FF6B4657',
      accent: 'FFBE1E63', accentOn: 'FFFFFFFF', accentSoft: 'FFFFE3EE',
      radius: 24,
    },
    'mix-dark': {
      id: 'mix-dark',
      label: 'Połączony',
      dark: true,
      page: 'FF08040D',
      gradient: ['FF23103A', 'FF120818', 'FF05020A'],
      blobs: [
        { c: 'FF8B5CF6', a: 0.50, cx: 0.06, cy: -0.02, rx: 0.80, ry: 0.64 },
        { c: 'FFFF5C9A', a: 0.40, cx: 0.94, cy: 0.10, rx: 0.66, ry: 0.58 },
        { c: 'FF4F46E5', a: 0.28, cx: 0.50, cy: 1.10, rx: 0.74, ry: 0.60 },
      ],
      panel: '0DEBD9FF', panelSolid: 'FF170C22', edge: '33E6D2FF',
      text: 'FFF6F0FF', textSoft: 'FFD9C8E8',
      accent: 'FFE9B8FF', accentOn: 'FF26073A', accentSoft: '24E9B8FF',
      radius: 26,
    },
    'mix-light': {
      id: 'mix-light',
      label: 'Połączony',
      dark: false,
      page: 'FFF6EEFB',
      gradient: ['FFFDF7FF', 'FFF4E9FB', 'FFEBDCF5'],
      blobs: [
        { c: 'FFB794F6', a: 0.40, cx: 0.06, cy: -0.02, rx: 0.76, ry: 0.62 },
        { c: 'FFFFB0CE', a: 0.34, cx: 0.94, cy: 0.08, rx: 0.64, ry: 0.58 },
        { c: 'FF8FB8FF', a: 0.24, cx: 0.50, cy: 1.10, rx: 0.66, ry: 0.58 },
      ],
      panel: '75FFFFFF', panelSolid: 'FFFEFCFF', edge: '212E1B45',
      text: 'FF1E1030', textSoft: 'FF584268',
      accent: 'FFA21CAF', accentOn: 'FFFFFFFF', accentSoft: 'FFF6E3FA',
      radius: 26,
    },
  };

  const DEFAULT_STYLE = 'lg2-dark';

  /* ==========================================================================
     Motyw „Własny” — te same reguły co `android/…/ui/theme/CustomTheme.kt`.

     Użytkownik wybiera dwa kolory (akcent i tło), a reszta palety jest z nich
     wyliczana: tekst, panele, obramowania, gradient i plamy tła. Tonacja wynika
     z jasności tła, więc jasne tło nie dostanie białego tekstu. Akcent jest
     dociągany do czytelnego kontrastu (pętla jak w Kotlinie) — inaczej jasny
     akcent na jasnym tle dawałby nieczytelną plakietkę notatki.

     Kolory zapisujemy jako `#RRGGBB`; stałe niżej MUSZĄ być równe stałym
     z `CustomTheme.kt` — pilnuje tego `scripts/self-test.js`.
     ========================================================================== */

  const CUSTOM_DEFAULT = { primary: '#7C5CFF', background: '#0C0A18' };
  /* Te stałe MUSZĄ być równe stałym z `CustomTheme.kt`. */
  const CUSTOM_DARK_LUMINANCE = 0.179;
  const CUSTOM_ACCENT_CONTRAST_TARGET = 4.0;
  const CUSTOM_ACCENT_STEP = 0.14;
  const CUSTOM_MAX_ACCENT_STEPS = 10;
  const CUSTOM_TEXT_ON_DARK = 'F2F5FF';
  const CUSTOM_TEXT_ON_LIGHT = '12141B';
  const CUSTOM_ACCENT_ON_DARK = '10131A';
  const CUSTOM_ACCENT_ON_LIGHT = 'FFFFFF';
  const CUSTOM_RADIUS = 26;

  /** `#RRGGBB` (albo bez `#`, albo 3 znaki) → wielkie litery; `null` gdy śmieci. */
  function normalizeCustomHex(value) {
    const raw = String(value == null ? '' : value).trim().replace(/^#/, '').toUpperCase();
    if (!/^([0-9A-F]{3}|[0-9A-F]{6})$/.test(raw)) return null;
    const six = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
    return `#${six}`;
  }

  /** Para kolorów z ustawień; brakujące/niepoprawne zastępuje para domyślna. */
  function normalizeCustom(primary, background) {
    return {
      primary: normalizeCustomHex(primary) || CUSTOM_DEFAULT.primary,
      background: normalizeCustomHex(background) || CUSTOM_DEFAULT.background,
    };
  }

  function hexToRgb(hex) {
    const clean = normalizeCustomHex(hex);
    if (!clean) return null;
    const value = parseInt(clean.slice(1), 16);
    return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
  }

  /** „F2F5FF” z kanałów — zapis palet (`RRGGBB` bez kanału alfa). */
  const rgbHex = (c) => `${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`.toUpperCase();

  /** Mieszanie kanałów: 0 = a, 1 = b (jak `mix` w Kotlinie). */
  const mixRgb = (a, b, t) => ({
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  });

  /**
   * Luminancja względna wg WCAG (0–1) — linearyzacja z wykładnikiem 2,4.
   * Bez niej środek skali wypada za jasno: `#7F6AFF` wychodził „ciemny”
   * i dostawał biały tekst o kontraście 3,7:1 zamiast ciemnego o 5:1.
   */
  function relativeLuminance(c) {
    const channel = (value) => {
      const srgb = value / 255;
      return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  }

  /** Kontrast WCAG dwóch kolorów (1–21). */
  const contrast = (a, b) => {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  /**
   * Kolor tekstu na akcencie: **biały**, gdy ma co najmniej
   * `CUSTOM_ACCENT_CONTRAST_TARGET` kontrastu (jak przycisk Material 3),
   * inaczej ciemny — np. na żółtym akcencie.
   */
  function accentTextOn(accent) {
    const light = hexToRgb(`#${CUSTOM_ACCENT_ON_LIGHT}`);
    return contrast(light, accent) >= CUSTOM_ACCENT_CONTRAST_TARGET
      ? light
      : hexToRgb(`#${CUSTOM_ACCENT_ON_DARK}`);
  }

  /** Akcent dociągnięty do czytelnego kontrastu na tle (jak `readableAccent`). */
  function readableAccent(primary, background, dark) {
    let accent = primary;
    const towards = dark ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    for (let i = 0; i < CUSTOM_MAX_ACCENT_STEPS; i += 1) {
      if (contrast(accent, background) >= CUSTOM_ACCENT_CONTRAST_TARGET) return accent;
      accent = mixRgb(accent, towards, CUSTOM_ACCENT_STEP);
    }
    return accent;
  }

  /** Paleta motywu „Własny” — ten sam kształt co wpisy w `PALETTES`. */
  function customPalette(primary, background) {
    const colors = normalizeCustom(primary, background);
    const bg = hexToRgb(colors.background);
    const base = hexToRgb(colors.primary);
    const dark = relativeLuminance(bg) < CUSTOM_DARK_LUMINANCE;
    const text = hexToRgb(dark ? CUSTOM_TEXT_ON_DARK : CUSTOM_TEXT_ON_LIGHT);
    const accent = readableAccent(base, bg, dark);
    const accentOn = accentTextOn(accent);
    const end = dark ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
    const accentHex = rgbHex(accent);

    return {
      id: 'custom',
      label: 'Własny',
      dark,
      page: `FF${rgbHex(bg)}`,
      gradient: [
        `FF${rgbHex(mixRgb(bg, accent, 0.16))}`,
        `FF${rgbHex(mixRgb(bg, accent, 0.04))}`,
        `FF${rgbHex(mixRgb(bg, end, 0.25))}`,
      ],
      blobs: [
        { c: `FF${rgbHex(mixRgb(accent, { r: 255, g: 255, b: 255 }, 0.12))}`, a: 0.42, cx: 0.10, cy: -0.02, rx: 0.82, ry: 0.66 },
        { c: `FF${accentHex}`, a: 0.26, cx: 0.92, cy: 0.08, rx: 0.66, ry: 0.56 },
      ],
      panel: `1A${accentHex}`,
      panelSolid: `FF${rgbHex(mixRgb(bg, accent, 0.10))}`,
      edge: `33${rgbHex(text)}`,
      text: `FF${rgbHex(text)}`,
      textSoft: `FF${rgbHex(mixRgb(text, bg, 0.35))}`,
      accent: `FF${accentHex}`,
      accentOn: `FF${rgbHex(accentOn)}`,
      accentSoft: `26${accentHex}`,
      radius: CUSTOM_RADIUS,
    };
  }

  /** Stare identyfikatory z wersji web — migracja bez błędu. */
  const ALIASES = {
    glass: 'lg2-dark',
    'lg2-fast': 'visionos-perf-dark',
    'visionos-fast': 'visionos-perf-dark',
  };

  global.PlanStyles = {
    STYLES,
    STYLE_GROUPS,
    PALETTES,
    DEFAULT_STYLE,
    ALIASES,
    CUSTOM_DEFAULT,
    normalizeCustom,
    normalizeCustomHex,
    customPalette,
  };
}(typeof window !== 'undefined' ? window : globalThis));
