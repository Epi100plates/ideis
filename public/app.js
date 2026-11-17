'use strict';

/* ============================================================================
   Plan zajęć — interfejs natywnej aplikacji Android.

   Cały wygląd i zachowanie to port źródeł z `android/` tego repozytorium:
     ui/theme/StyleCatalog.kt   → STYLES / PALETTES (te same identyfikatory i kolory)
     ui/theme/Theme.kt          → role kolorów Material 3 (colorSchemeFor)
     ui/ScheduleApp.kt          → TopAppBar, pasek statusu, dolne kafelki, arkusze
     ui/views/*.kt              → Dzień, Tydzień, Miesiąc, Semestr
     domain/Format.kt           → polskie etykiety i odmiana
     domain/ScheduleViews.kt    → siatki, kolumny nakładających się zajęć
     data/PlanRepository.kt     → cache + `/api/version` przed pełnym planem

   Serwer i API są wspólne z wersją web — fork różni się wyłącznie katalogiem
   `public/`. Zero zależności, zero frameworków.
   ========================================================================== */

(function () {

  // ---------------------------------------------------------------- 1. Style

  /* Katalog palet (STYLES / PALETTES / ALIASES) mieszka w /styles.js — ten sam
     plik czyta test zgodności z natywnym StyleCatalog.kt. Tu tylko wygoda. */
  const {
    STYLES,
    STYLE_GROUPS,
    PALETTES,
    DEFAULT_STYLE,
    ALIASES,
    normalizeCustom,
    normalizeCustomHex,
    customPalette,
  } = window.PlanStyles;

  if (!STYLES || !PALETTES) {
    throw new Error('Brak /styles.js — katalog stylów nie został wczytany.');
  }

  function normalizeStyle(id) {
    const raw = String(id || '').trim();
    if (!raw) return DEFAULT_STYLE;
    if (ALIASES[raw]) return ALIASES[raw];
    return STYLES.some((s) => s.id === raw) ? raw : DEFAULT_STYLE;
  }

  function systemDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function resolveStyle(id) {
    const normalized = normalizeStyle(id);
    if (normalized !== 'auto') return normalized;
    return systemDark() ? 'dark' : 'light';
  }

  /**
   * Paleta dla identyfikatora stylu.
   *
   * „auto” rozwiązuje się wcześniej na `dark`/`light`, a „custom” nie ma wpisu
   * w `PALETTES` — liczy się go z dwóch kolorów użytkownika (`customPalette`,
   * te same reguły co `CustomTheme.kt`), więc zmiana koloru działa bez
   * przebudowy katalogu.
   */
  function paletteOf(styleId) {
    const resolved = resolveStyle(styleId);
    if (resolved === 'custom') {
      return customPalette(state.custom.primary, state.custom.background);
    }
    return PALETTES[resolved] || PALETTES[DEFAULT_STYLE];
  }

  // ------------------------------------------------------- 2. Kolory i tło

  function parseArgb(hex) {
    const v = parseInt(hex, 16) >>> 0;
    return {
      a: ((v >>> 24) & 0xff) / 255,
      r: (v >>> 16) & 0xff,
      g: (v >>> 8) & 0xff,
      b: v & 0xff,
    };
  }

  /** Color.compositeOver(dst) — dst jest nieprzezroczysty. */
  function compositeOver(src, dst) {
    const a = src.a + dst.a * (1 - src.a);
    const mix = (s, d) => Math.round((s * src.a + d * dst.a * (1 - src.a)) / (a || 1));
    return { a, r: mix(src.r, dst.r), g: mix(src.g, dst.g), b: mix(src.b, dst.b) };
  }

  const cssRgb = (c) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
  const cssRgba = (c) => `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Number(c.a.toFixed(3))})`;
  const triplet = (c) => `${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}`;

  /**
   * Theme.kt `colorSchemeFor` — te same role Material 3, żeby komponenty
   * (karty, plakietki, arkusze) miały dokładnie te same kolory co w Compose.
   */
  function applyStyle(id) {
    const resolved = resolveStyle(id);
    const pal = paletteOf(id);
    const root = document.documentElement;
    const page = parseArgb(pal.page);
    const panel = parseArgb(pal.panel);
    const panelSolid = parseArgb(pal.panelSolid);
    const panelMixed = compositeOver(panel, page);
    const accentSoft = parseArgb(pal.accentSoft);
    const edge = parseArgb(pal.edge);
    const edgeVariant = { ...edge, a: edge.a * 0.5 };
    const text = parseArgb(pal.text);
    const accent = parseArgb(pal.accent);
    const accentOn = parseArgb(pal.accentOn);
    const textSoft = parseArgb(pal.textSoft);
    const error = pal.dark ? 'FFFFB4AB' : 'FFB3261E';
    const errorContainer = pal.dark ? 'FF93000A' : 'FFF9DEDC';
    const onErrorContainer = pal.dark ? 'FFFFDAD6' : 'FF410E0B';

    const vars = {
      '--page': cssRgb(page),
      '--page-rgb': triplet(page),
      '--text': cssRgb(text),
      '--text-soft': cssRgb(textSoft),
      '--accent': cssRgb(accent),
      '--accent-rgb': triplet(accent),
      '--accent-on': cssRgb(accentOn),
      '--accent-soft': cssRgba(accentSoft),
      '--accent-soft-rgb': triplet(accentSoft),
      '--surface': cssRgb(panelSolid),
      '--surface-rgb': triplet(panelSolid),
      '--surface-variant': cssRgb(panelMixed),
      '--sv-rgb': triplet(panelMixed),
      '--panel-raw': cssRgba(panel),
      '--outline': cssRgba(edge),
      '--outline-rgb': triplet(edge),
      '--outline-variant': cssRgba(edgeVariant),
      '--outline-variant-rgb': triplet(edge),
      '--error': cssRgb(parseArgb(error)),
      '--error-container': cssRgb(parseArgb(errorContainer)),
      '--on-error-container': cssRgb(parseArgb(onErrorContainer)),
      '--tertiary': cssRgb(accent),
      '--radius': `${pal.radius}px`,
    };
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));

    root.dataset.style = normalizeStyle(id) === 'auto' ? 'auto' : resolved;
    root.dataset.tone = pal.dark ? 'dark' : 'light';
    root.style.backgroundColor = cssRgb(page);
    root.style.colorScheme = pal.dark ? 'dark' : 'light';
    const meta = document.getElementById('themeColorMeta');
    // `page` to ARGB, a `theme-color` przyjmuje `#RRGGBB` — bez `#` Chrome
    // ignorował wartość i pasek adresu zostawał w kolorze z `index.html`.
    if (meta) meta.setAttribute('content', `#${pal.page.slice(2)}`);

    paintAurora(pal);
  }

  /** AuroraBackground.kt — gradient bazowy, plamy radialne i przyciemnienie dołu. */
  function paintAurora(pal) {
    const aurora = document.getElementById('aurora');
    if (!aurora) return;
    const W = window.innerWidth || 360;
    const H = window.innerHeight || 640;
    const layers = [];

    layers.push(`linear-gradient(to bottom, rgba(0,0,0,0) 72%, rgba(0,0,0,${pal.dark ? 0.22 : 0.05}) 100%)`);
    for (let i = pal.blobs.length - 1; i >= 0; i -= 1) {
      const blob = pal.blobs[i];
      const color = parseArgb(blob.c);
      const radius = Math.max(W * blob.rx, H * blob.ry) / 2;
      const at = `${(blob.cx * 100).toFixed(2)}% ${(blob.cy * 100).toFixed(2)}%`;
      layers.push(
        `radial-gradient(circle ${radius.toFixed(1)}px at ${at}, rgba(${triplet(color)}, ${blob.a}) 0%, rgba(${triplet(color)}, 0) 100%)`,
      );
    }

    const stops = pal.gradient.map((hex) => cssRgb(parseArgb(hex)));
    const dx = W * 0.35;
    const angle = (Math.atan2(dx, -H) * 180) / Math.PI;
    layers.push(`linear-gradient(${angle.toFixed(2)}deg, ${stops.join(', ')})`);

    aurora.style.backgroundImage = layers.join(', ');
  }

  // ------------------------------------------- 3–4. Format i widoki (moduł)

  /* `Format` i `ScheduleViews` to port domain/Format.kt i ScheduleViews.kt,
     wydzielony do /schedule.js — ten sam plik testuje scripts/self-test.js. */
  const {
    Format,
    ScheduleViews,
    WhatsNew,
    WEEKDAYS,
    pad2,
    parseIso,
    toIso,
    addDays,
    dayOfWeek,
    todayIso,
  } = window.PlanSchedule;

  // ------------------------------------------------------- 5. Narzędzia DOM

  /**
   * Wersja funkcji widoczna w Opcjach → Aktualizacje i w „Co nowego”.
   * Niezależna od `VERSION` w public/sw.js — tamta numeruje cache powłoki,
   * więc podbija się także przy samych poprawkach bez nowości.
   */
  const APP_VERSION = 'v36';

  const $ = (id) => document.getElementById(id);

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

  /** Java String.hashCode — ten sam kolor przedmiotu co w natywnej aplikacji. */
  function javaHash(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
    }
    return hash;
  }

  const SUBJECT_COLORS = [
    '#5B7BFF', '#16A394', '#E08A2B', '#D8567F',
    '#8A63D2', '#2E9BD6', '#6BA84F', '#B0764A',
  ];

  const subjectColor = (subject) => (
    SUBJECT_COLORS[(javaHash(subject) & 0x7fffffff) % SUBJECT_COLORS.length]
  );

  const dot = (subject, size) => (
    `<span class="dot" style="width:${size}px;height:${size}px;background:${subjectColor(subject)}"></span>`
  );

  /**
   * Spinacz „tu są materiały” — ten sam rysunek co `ic_attachment` w APK.
   * Na karcie 16 px, w kompaktowym wierszu miesiąca 14 px. Opis czytnika ekranu
   * jest ukryty wizualnie, bo ikona siedzi w przycisku karty.
   */
  const attachmentMark = (size = 16) => (
    `<svg class="attachment-mark" width="${size}" height="${size}" aria-hidden="true" focusable="false">`
    + '<use href="#i-attachment"/></svg><span class="visually-hidden">Materiały do zajęć</span>'
  );

  // ------------------------------------------------------------ 6. Stan

  const STORE_KEY = 'plan-zajec:v2';
  const PLAN_CACHE_PREFIX = 'plan-android:plan:';
  /**
   * „Epoka” wyglądu: klucz w `localStorage`, który unieważnia styl zapisany
   * przez **starą** wersję aplikacji. Ten sam `STORAGE_KEY` jest wspólny,
   * więc bez tego użytkownik, który kiedyś wybrał inny motyw, zobaczyłby go
   * także po przebudowie — zamiast domyślnego Liquid Glass 2.
   * Podbij, jeśli domyślny wygląd ma się znowu narzucić wszystkim.
   */
  const STYLE_EPOCH = 19;
  const FRESH_MS = 10 * 60 * 1000;
  const GROUPS_TTL_MS = 24 * 60 * 60 * 1000;
  const RESUME_REFRESH_MS = 15 * 60 * 1000;
  /**
   * Sprawdzanie planu w tle (odpowiednik `RefreshWorker` z APK). Pierwsze pyta
   * o wersję po pół minucie od startu — plan z pamięci jest już na ekranie,
   * więc lekkie `GET /api/version` nie może niczego opóźniać.
   */
  const VERSION_POLL_START_MS = 30 * 1000;
  const VERSION_POLL_MS = 5 * 60 * 1000;
  const HOUR_HEIGHT = 60;
  const DAY_WIDTH = 112;
  // Progi gestu w bok — port `PERIOD_SWIPE_*` z APK 1.8. 32 px zamiast 56 px:
  // półtora kafelka wystarcza, a licznik rusza po systemowym „slopie” (~8 px),
  // więc palec realnie jedzie ~40 px. Szybkie pchnięcie (`SWIPE_VELOCITY`,
  // 600 px/s) zmienia okres nawet przy krótkim ruchu, a `SWIPE_MIN` chroni
  // przed drgnięciem palca przy dotknięciu.
  const SWIPE_THRESHOLD = 32;
  const SWIPE_VELOCITY = 600; // px/s
  const SWIPE_MIN = 12;

  const state = {
    groups: [],
    groupsAt: 0,
    group: '21188',
    /**
     * Grupy w planie: pierwsza jest bazowa (wykład), kolejne to własne
     * ćwiczenia/laboratoria/lektorat. Plan jest sumą ich zajęć — tak jak
     * w dzienniku: wykłady wspólne + moje grupy.
     */
    planGroups: [],
    /**
     * Klucz planu, dla którego **naprawdę** wczytaliśmy dane (grupy + rok
     * akademicki). Na ekranie powitalnym `state.planGroups` zmienia się już przy
     * kliknięciu, więc porównywanie z nim dawało „ten sam plan” i brak odświeżenia.
     */
    planKey: null,
    /** Opis wyboru z formularza uczelni (nazwy oficjalne do podpisu). */
    site: { kierunekId: '', kierunekLabel: '', specId: '', specLabel: '', specSkipped: false },
    /** Stan ekranu wyboru: krok otwarty, listy z formularza uczelni, plany. */
    wizard: {
      /** Krok otwarty w całości; `null` = pierwszy brakujący. */
      openStep: null,
      loading: false,
      error: null,
      warning: null,
      kierunki: [],
      kierunkiAt: 0,
      /** Wpisane litery w polu „Szukaj kierunku” (filtr listy kierunków). */
      query: '',
      /** Specjalności rocznika; klucz cache to „kierunek@rocznik”. */
      specs: [],
      specsFor: '',
      specsAt: 0,
      /** Tryby studiów dostępne w wyborze (z `/api/ideis/tryby`). */
      modes: [],
      modesFor: '',
      plans: [],
      /**
       * Wybór, który **naprawdę** opisuje wczytany plan (`{sel, site}`).
       * Kroki pickera zmieniają `state.sel` od razu, a plan zmienia się dopiero
       * po wybraniu grupy — bez tej kopii zamknięcie Opcji zostawiało wybór
       * niezgodny z planem („Informatyka · 2023/2024” przy planie 2. roku).
       */
      applied: null,
    },
    groupName: null,
    /**
     * Wybór w pickerze: nabór, kierunek, specjalność, rok, typ studiów, tryb.
     * Regułę dopasowania trzyma `/selection.js` — ten sam plik ładuje serwer,
     * więc przeglądarka i API filtrują katalog identycznie.
     */
    sel: { nabor: '', field: '', spec: '', year: '', degree: '', mode: '', sem: '' },
    /** Wybór początkowy z serwera (`defaults` w /api/groups). */
    defaults: null,
    /** Bieżący rok akademicki serwera: { start: '2026', label: '2026/2027' }. */
    academicYear: null,
    /** Rok akademicki oglądanego planu (parametr `ay`); null = bieżący. */
    ay: null,
    slots: [],
    dates: [],
    byDate: {},
    savedAt: 0,
    today: todayIso(),
    nowMinute: 0,
    loading: true,
    refreshing: false,
    offline: false,
    error: null,
    needsGroup: false,
    styleId: DEFAULT_STYLE,
    /**
     * Dwa kolory motywu „Własny”: { primary, background } w zapisie `#RRGGBB`.
     * Paletę liczy z nich `customPalette` (styles.js) — tak samo jak APK liczy
     * ją z `CustomTheme.kt`, więc wybór wygląda identycznie na obu platformach.
     */
    custom: { primary: '#7C5CFF', background: '#0C0A18' },
    view: 'day',
    selectedDate: null,
    weekAnchor: null,
    monthKey: null,
    /** Nadchodząca animacja wejścia: { target: 'view'|'agenda', dir: 1|-1 }. */
    enter: null,
    /** Czy podświetlenie kafelków było już ustawione (pierwsze bez animacji). */
    tabsReady: false,
    /** To samo dla paska tygodnia w widoku dnia. */
    stripReady: false,
    /** Poprzedni prostokąt podświetlenia paska tygodnia { x, w } i tydzień. */
    stripHighlight: null,
    stripWeek: null,
    /** Otwarty arkusz: 'settings' | null. */
    sheetKind: null,
    /** Bieżąca strona panelu ustawień: root | plan | look | updates | android | group | feedback. */
    settingsPage: 'root',
    /** Stan aktualizacji PWA (odpowiednik UpdateManager z APK). */
    update: {
      checking: false,
      available: false,
      lastCheck: 0,
      error: null,
      autoCheck: true,
    },
    /**
     * Wydanie natywnej aplikacji z `/api/app/latest` — kafelek „Aplikacja
     * Android” w Opcjach. `null` znaczy „jeszcze nie wiemy”, a nie „nie ma”.
     */
    apk: {
      info: null,
      loading: false,
      error: null,
      /** `false` = serwer potwierdził, że nic jeszcze nie opublikowano. */
      published: null,
    },
    /**
     * Instalacja aplikacji z przeglądarki: zdarzenie `beforeinstallprompt`
     * (tylko Chromium) i instrukcja dla Safari, które takiego zdarzenia nie ma.
     */
    install: {
      /** Zdarzenie przeglądarki albo `null` (Safari, Firefox, już zainstalowana). */
      prompt: null,
      /** Instrukcja czeka na zamknięcie innego arkusza (np. „Co nowego”). */
      guidePending: false,
    },
    lastLoadAt: 0,
    /**
     * Numer ostatniego wczytania planu. Dwa mogą iść naraz (wybór planu
     * i zaraz dodanie grup) — wynik starszego nie może już niczego zmienić
     * (patrz `load`).
     */
    loadSeq: 0,
    /**
     * Wersja treści, którą pokazujemy (`plan.version` z API). Porównujemy ją
     * z `/api/version`, żeby zauważyć zmianę planu u uczelni bez przeładowania
     * strony — patrz `checkPlanVersion()`.
     */
    planVersion: null,
    ongoingKey: '',
    /**
     * Przesunięcie palca (px) w chwili puszczenia — animacja zmiany dnia startuje
     * z tego miejsca, więc treść nie zawraca i nie „przeskakuje”.
     */
    swipeOffset: null,
    /** Czy pierwszy plan z pamięci zdążył się już pokazać (znacznik pomiarowy). */
    planMarked: false,
    /**
     * Zajęcia, do których są materiały (indeks z `/api/attachments/index`) —
     * z tego zbioru rysujemy spinacz na karcie i w wierszu miesiąca, jak
     * `classesWithAttachments` w APK 1.9.
     */
    attachmentIds: new Set(),
    /**
     * Notatki na kafelkach (`/api/notes`): identyfikator zajęć → tekst.
     * Notatka jest wspólna dla wszystkich, więc przychodzi z serwera razem
     * z planem — dzięki temu kafelek nie pyta o nią osobno.
     */
    notes: new Map(),
  };

  function readPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
    } catch (err) {
      return {};
    }
  }

  function writePrefs(patch) {
    const prefs = { ...readPrefs(), ...patch };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
    } catch (err) { /* tryb prywatny — pamięć tylko w tej sesji */ }
    return prefs;
  }

  /**
   * Klucz cache planu: grupy **i** rok akademicki. Ten sam numer grupy ma inny
   * plan w każdym roczniku, więc klucz bez `ay` pokazywałby plan z innego roku.
   */
  function planCacheKey(groups = state.planGroups, ay = state.ay) {
    const list = (groups && groups.length ? groups : [state.group]).map(String);
    return PLAN_CACHE_PREFIX + list.join('+') + (ay ? `@${ay}` : '');
  }

  function readCachedPlan() {
    try {
      const raw = localStorage.getItem(planCacheKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.plan ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function writeCachedPlan(plan, savedAt) {
    try {
      const key = planCacheKey();
      localStorage.setItem(key, JSON.stringify({ plan, savedAt }));
      Object.keys(localStorage)
        .filter((item) => item.startsWith(PLAN_CACHE_PREFIX) && item !== key)
        .forEach((item) => localStorage.removeItem(item));
    } catch (err) { /* brak miejsca — cache jest tylko optymalizacją */ }
  }

  // ------------------------------------------------- 7. Dane z API i plan

  // --- 7a. Wymiary katalogu (nabór, kierunek, specjalność, rok, typ, tryb) ---
  //
  // Katalog uczelni nie ma tych wymiarów osobno — serwer wyprowadza je z nazwy
  // grupy i kolumny „Toki nauki” (`server/dimensions.js`). Tutaj tylko je
  // porównujemy, i to tym samym plikiem co serwer (`/selection.js`), żeby
  // przeglądarka nie miała własnej, rozjeżdżającej się reguły.

  const PS = window.PlanSelection;
  if (!PS) {
    throw new Error('Brak /selection.js — nie da się dopasować grup do wyboru.');
  }
  const PW = window.PlanWizard;
  if (!PW) {
    throw new Error('Brak /wizard.js — nie da się policzyć semestru i grup planu.');
  }

  /** Opis pól pickera — kolejność jak w aplikacji Android. */
  const DIMENSIONS = [
    { key: 'nabor', label: 'Nabór', hint: 'rok, w którym zaczynałeś studia' },
    { key: 'field', label: 'Kierunek', hint: '' },
    { key: 'spec', label: 'Specjalność', hint: 'opcjonalna — na 1. roku zwykle jej nie ma' },
    { key: 'year', label: 'Rok studiów', hint: '' },
    { key: 'degree', label: 'Typ studiów', hint: '' },
    { key: 'mode', label: 'Tryb', hint: '' },
  ];

  const DEGREE_LABELS = {
    '1st': 'I stopnia',
    '2st': 'II stopnia',
    jmgr: 'jednolite magisterskie',
    'inż': 'inżynierskie',
    mgr: 'magisterskie',
    lic: 'licencjackie',
    podypl: 'podyplomowe',
    dr: 'doktoranckie',
  };
  const MODE_LABELS = { N: 'niestacjonarne', S: 'stacjonarne' };

  /** „2026” → „2026/2027”; „—” → etykieta „bez naboru”. */
  function naborLabel(value) {
    if (value === PS.NONE) return 'bez naboru';
    const start = Number(value);
    return Number.isFinite(start) ? `${start}/${start + 1}` : String(value);
  }

  /** Rok akademicki planu: nabór 2024 + 2. rok studiów = 2025/2026. */
  function selectionAcademicYear(sel = state.sel) {
    const start = Number(sel.nabor);
    if (!Number.isFinite(start) || start < 2000) return null;
    const year = Number(sel.year);
    return start + (Number.isFinite(year) && year >= 1 ? year - 1 : 0);
  }

  /** Grupy pasujące do wyboru — to, co widać na liście. */
  function filteredGroups(sel = state.sel) {
    if (!state.groups.length) return [];
    return PS.filter(state.groups, sel);
  }

  function groupById(id) {
    return state.groups.find((group) => String(group.id) === String(id)) || null;
  }

  /**
   * Wybór startowy dla zapisanej grupy — dla starych linków `?group=NNNN`,
   * w których nie ma jeszcze wymiarów. Bierzemy z katalogu to, co tę grupę
   * opisuje: najnowszy nabór, kierunek, rok, typ, tryb (specjalność tylko
   * wtedy, gdy naprawdę istnieje).
   */
  function selectionOfGroup(group, base = state.sel) {
    if (!group) return { ...base };
    const nabory = Array.isArray(group.b) && group.b.length ? group.b : [];
    return {
      nabor: nabory.length ? String(Math.max(...nabory.map(Number))) : '',
      field: group.f || '',
      spec: group.s || '',
      year: group.y ? String(group.y) : '',
      degree: group.d || '',
      mode: group.m || '',
    };
  }

  /**
   * Wspólne doklejanie `?groups=` (albo `?group=` dla starego linku) i `?ay=`
   * do każdego zapytania API — tak samo jak `planPath()` w APK.
   */
  function apiUrl(path) {
    const params = [];
    if (state.planGroups.length) {
      params.push(`groups=${state.planGroups.map(encodeURIComponent).join(',')}`);
    } else {
      params.push(`group=${encodeURIComponent(state.group)}`);
    }
    if (state.ay) params.push(`ay=${encodeURIComponent(state.ay)}`);
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}${params.join('&')}`;
  }

  // ------------------------------- 7b. Ekran wyboru planu -------------------
  //
  // Wybór nie jest arkuszem z listą kroków: wszystkie kroki leżą na jednej
  // stronie (ekran powitalny albo Opcje → Wybór planu). Widać **tylko ten
  // krok, który jest otwarty** — wybrane zwijają się do jednego wiersza
  // („Rocznik · 2024/2025”), a następny pojawia się pod nimi. Na starcie jest
  // więc wyłącznie rocznik, a strona rośnie wraz z wyborem.
  //
  // Kolejność: rocznik → kierunek → specjalność (opcjonalna) → tryb → plan.
  // Rocznik jest pierwszy, bo zawęża listę kierunków do tych, które mają
  // grupy w tym roku (liczy je serwer w `server/ideis-options.js`, klient
  // filtruje gotowe `nabory`). Kroki bez wyboru przechodzą dalej same, a pod
  // listami nie ma opisów — tylko to, co trzeba wybrać.

  const WIZARD_LABELS = {
    nabor: 'Rocznik',
    kierunek: 'Kierunek',
    spec: 'Specjalność',
    tryb: 'Tryb',
    plan: 'Plan',
  };

  /** Od ilu kierunków pokazujemy pole „wpisz kilka liter”. */
  const WIZ_SEARCH_MIN = 8;

  /** Co w ekranie wyboru da się kliknąć (obsługa wspólna dla obu miejsc). */
  const PICK_SELECTOR = '[data-pick-open],[data-wiz-nabor],[data-wiz-kierunek],'
    + '[data-wiz-spec],[data-wiz-skip-spec],[data-wiz-tryb],[data-wiz-plan],'
    + '[data-wiz-reset],[data-wiz-retry],[data-wiz-clear-query]';

  /** Kierunki mające grupy w danym roczniku (lista kroku 2). */
  function kierunkiOfNabor(nabor = state.sel.nabor) {
    return PW.kierunkiInCohort(state.wizard.kierunki, nabor);
  }

  /**
   * Krok otwarty w całości: ten kliknięty w wierszu podsumowania albo pierwszy
   * brakujący. Reszta widocznych kroków to zwinięte wiersze z gotowym wyborem.
   */
  function activeStep() {
    const open = state.wizard.openStep;
    if (open && visibleSteps().includes(open)) return open;
    return firstIncompleteStep();
  }

  /** Kroki, które w tym wyborze już mają sens — kolejne pojawiają się same. */
  function visibleSteps() {
    return PW.stepsFor(state.sel);
  }

  /** Wartość kroku do zwiniętego wiersza ('' = jeszcze nie wybrano). */
  function stepValue(step) {
    if (step === 'nabor') return state.sel.nabor ? naborLabel(state.sel.nabor) : '';
    if (step === 'kierunek') return state.sel.field ? kierunekLabelOf() : '';
    if (step === 'spec') {
      if (state.sel.spec) return specLabelOf();
      return state.site.specSkipped ? 'bez specjalności' : '';
    }
    if (step === 'tryb') return state.sel.mode ? (MODE_LABELS[state.sel.mode] || state.sel.mode) : '';
    return '';
  }

  /** Zwinięty krok: etykieta, wybrana wartość i strzałka (klik otwiera go). */
  function summaryRowHtml(step) {
    return `<button type="button" class="pick-sum" data-pick-open="${step}">
      <span class="pick-sum-label">${esc(WIZARD_LABELS[step])}</span>
      <span class="pick-sum-value">${esc(stepValue(step))}</span>
      <span class="pick-sum-go" aria-hidden="true">›</span>
    </button>`;
  }

  /** Otwarty krok: nagłówek i lista (albo „wczytuję” / błąd z „Ponów”). */
  function openSectionHtml(step) {
    const body = state.wizard.loading
      ? '<p class="pick-hint">Wczytuję…</p>'
      : (state.wizard.error
        ? `<div class="materials-error"><span>${esc(state.wizard.error)}</span>
           <button type="button" class="text-btn" data-wiz-retry>Ponów</button></div>`
        : wizardStepHtml(step));
    return `<section class="pick-section" id="pick-${step}">
      <p class="pick-head">${esc(WIZARD_LABELS[step])}</p>
      ${body}
    </section>`;
  }

  /** Sekcja planu — wynik wyboru, więc pokazuje się dopiero po trybie. */
  function planSectionHtml() {
    return `<section class="pick-section" id="pick-plan">
      <p class="pick-head">${esc(WIZARD_LABELS.plan)}</p>
      ${wizardPlanHtml()}
    </section>`;
  }

  /** Cały ekran wyboru: otwarty krok + zwinięte podsumowania wyżej. */
  function pickerHtml() {
    const active = activeStep();
    const parts = [];
    for (const step of visibleSteps()) {
      if (step === 'plan') {
        if (active === 'plan') parts.push(planSectionHtml());
        continue;
      }
      if (step === active) parts.push(openSectionHtml(step));
      else if (stepValue(step)) parts.push(summaryRowHtml(step));
    }
    const warning = state.wizard.warning && active !== 'plan'
      ? `<p class="picker-note">${esc(state.wizard.warning)}</p>` : '';
    const reset = state.sel.nabor
      ? '<button type="button" class="text-btn pick-reset" data-wiz-reset>Zacznij od nowa</button>' : '';
    return `<div class="pick">${parts.join('')}${warning}${reset}</div>`;
  }

  /** Wstawia HTML wyboru i przywraca fokus w polu szukania, jeśli go miał. */
  function paintPicker(target) {
    if (!target) return;
    // Lista roczników jest potrzebna od razu — inaczej krok „Rocznik” mówi
    // „katalog nie ma roczników” i nie ma jak tego naprawić.
    ensurePickerData();
    const focused = document.activeElement && document.activeElement.id === 'wizSearch';
    const caret = focused ? document.activeElement.selectionStart : 0;
    target.innerHTML = pickerHtml();
    if (!focused) return;
    const again = $('wizSearch');
    if (!again) return;
    again.focus();
    try {
      again.setSelectionRange(caret, caret);
    } catch (err) {
      // Pole type=search bywa bez selekcji — sam fokus wystarczy.
    }
  }

  /**
   * Odświeża ekran wyboru tam, gdzie jest widoczny (ekran powitalny albo
   * Opcje → Wybór planu). `reveal` podsuwa nowo otwarty krok do widoku —
   * razem z wierszem wyboru, który go poprzedza, żeby nie tracić kontekstu.
   */
  function refreshPicker({ reveal = '' } = {}) {
    if ($('welcome') && !$('welcome').hidden) paintPicker($('welcomePicker'));
    else if (state.sheetKind === 'settings' && state.settingsPage === 'group') renderSettings({ keepScroll: true });
    if (!reveal) return;
    const node = document.getElementById(`pick-${reveal}`);
    if (!node) return;
    const before = node.previousElementSibling;
    const anchor = before && before.classList.contains('pick-sum') ? before : node;
    anchor.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /** Obsługa kliknięć w ekranie wyboru — wspólna dla obu miejsc. */
  function pickerClick(target) {
    if (target.dataset.pickOpen) {
      state.wizard.openStep = target.dataset.pickOpen;
      refreshPicker({ reveal: target.dataset.pickOpen });
      return true;
    }
    if (target.hasAttribute('data-wiz-reset')) {
      wizReset();
      return true;
    }
    if (target.hasAttribute('data-wiz-clear-query')) {
      state.wizard.query = '';
      refreshPicker();
      return true;
    }
    if (target.hasAttribute('data-wiz-retry')) {
      pickerRetry();
      return true;
    }
    if (target.dataset.wizNabor) {
      wizChooseNabor(target.dataset.wizNabor);
      return true;
    }
    if (target.dataset.wizKierunek) {
      wizChooseKierunek(target.dataset.wizKierunek);
      return true;
    }
    if (target.hasAttribute('data-wiz-skip-spec')) {
      wizChooseSpec(null);
      return true;
    }
    if (target.dataset.wizSpec) {
      wizChooseSpec(target.dataset.wizSpec);
      return true;
    }
    if (target.dataset.wizTryb) {
      wizChooseTryb(target.dataset.wizTryb);
      return true;
    }
    if (target.dataset.wizPlan) {
      finishWizard(target.dataset.wizPlan);
      return true;
    }
    return false;
  }

  /** Ponowienie pobrania listy dla otwartego kroku. */
  function pickerRetry() {
    const step = activeStep();
    if (step === 'nabor' || step === 'kierunek') wizLoadKierunki(true);
    else if (step === 'spec') wizLoadSpecs(state.site.kierunekId, state.sel.nabor, true);
    else if (step === 'tryb') wizLoadModes(true);
    else {
      state.wizard.error = null;
      refreshPicker();
    }
  }

  /** Nazwa wydziału z formularza uczelni (stały — 5453). */
  function facultyLabel() {
    return state.wizard.faculty || 'Wydział Studiów Stosowanych we Wrocławiu';
  }

  /** Etykieta wybranego kierunku — oficjalna z formularza, gdy znana. */
  function kierunekLabelOf() {
    if (state.site.kierunekLabel) return state.site.kierunekLabel;
    const found = state.wizard.kierunki.find((item) => item.field === state.sel.field);
    return found ? found.label : (state.sel.field || '');
  }

  function specLabelOf() {
    if (!state.sel.spec) return '';
    if (state.site.specLabel) return state.site.specLabel;
    const found = state.wizard.specs.find((item) => item.value === state.sel.spec);
    return found ? found.label : state.sel.spec;
  }

  /** Podpis planu: numer grupy bazowej + liczba dodanych grup. */
  function planLabel() {
    if (!state.planGroups.length) return '';
    const base = groupById(state.planGroups[0]);
    const name = base ? (base.c || base.n) : `grupa ${state.planGroups[0]}`;
    if (state.planGroups.length === 1) return name;
    return `${name} + ${state.planGroups.length - 1} ${state.planGroups.length - 1 === 1 ? 'grupa' : 'grupy'}`;
  }

  /**
   * Plan bazowy z wyboru: grupa wykładowa z bieżącego semestru. Gdy w wyborze
   * jest kilka wykładów (np. różne typy studiów albo specjalności), krok „plan”
   * pozwala wybrać właściwy.
   */
  function computePlanCandidates() {
    const ay = state.ay != null ? Number(state.ay) : Number(state.academicYear && state.academicYear.start);
    const sel = PW.withSemester(state.sel, ay, new Date());
    const result = PW.baseCandidates(state.groups, sel);
    let note = '';
    if (!result.groups.length && sel.sem) {
      // Ten semestr bywa pusty (starszy nabór, specjalność uruchomiona później) —
      // wtedy pokazujemy grupy z całego roku, żeby dało się dojść do planu.
      // Semestr luzujemy też w wyborze: inaczej dodawanie własnych grup
      // filtrowałoby je po semestrze, którego w katalogu nie ma.
      const relaxed = PW.baseCandidates(state.groups, { ...sel, sem: '' });
      if (relaxed.groups.length) {
        note = 'W tym semestrze nie ma grup — pokazuję wszystkie semestry tego wyboru.';
        return { groups: relaxed.groups, note, sel: { ...sel, sem: '' } };
      }
    }
    return { groups: result.groups, note, sel };
  }

  /** Rok akademicki, dla którego liczymy rok studiów i semestr. */
  function currentAcademicYear() {
    return state.ay != null ? Number(state.ay) : Number(state.academicYear && state.academicYear.start);
  }

  /** Polska odmiana liczebnika: 1 grupa, 2 grupy, 5 grup. */
  function countLabel(count, one, few, many) {
    const value = Number(count) || 0;
    if (value === 1) return one;
    const rest = value % 10;
    const tens = Math.floor(value / 10) % 10;
    return rest >= 2 && rest <= 4 && tens !== 1 ? few : many;
  }

  /**
   * Jeden wiersz listy wyboru: kółko (wskaźnik zaznaczenia), tytuł i — gdy
   * trzeba — krótki podpis albo liczba po prawej.
   * Cały wiersz jest przyciskiem — na telefonie trafienie w samo kółko byłoby
   * zbyt trudne — ale zaznaczenie widać **w kółku**, tak jak w formularzu uczelni.
   */
  function choiceRow({ attr, selected, title, sub = '', meta = '', disabled = false }) {
    return `<button type="button" class="radio-row" role="radio" aria-checked="${selected ? 'true' : 'false'}"
        ${attr}${disabled ? ' disabled' : ''}>
      <span class="radio-mark" aria-hidden="true"></span>
      <span class="radio-text">
        <span class="radio-title">${esc(title)}</span>
        ${sub ? `<span class="radio-sub">${esc(sub)}</span>` : ''}
      </span>
      ${meta ? `<span class="radio-meta">${esc(meta)}</span>` : ''}
    </button>`;
  }

  function wizardStepHtml(step) {
    if (step === 'nabor') return wizardNaborHtml();
    if (step === 'kierunek') return wizardKierunekHtml();
    if (step === 'spec') return wizardSpecHtml();
    if (step === 'tryb') return wizardTrybHtml();
    return wizardPlanHtml();
  }

  /**
   * Krok 2: kierunki rocznika. Przy kilku pozycjach wystarczy lista; przy
   * dłuższej nad nią jest pole „wpisz kilka liter”, żeby nie przewijać
   * kilkudziesięciu nazw.
   */
  function wizardKierunekHtml() {
    if (!state.wizard.kierunki.length) {
      return '<p class="materials-hint">Nie mam jeszcze listy kierunków. Spróbuj za chwilę.</p>';
    }
    const all = kierunkiOfNabor();
    if (!all.length) {
      return '<p class="materials-hint">Ten rocznik nie ma kierunków w katalogu.</p>';
    }
    const query = state.wizard.query || '';
    const search = all.length >= WIZ_SEARCH_MIN
      ? `<div class="wiz-search">
          <input type="search" id="wizSearch" value="${esc(query)}" placeholder="Szukaj kierunku"
                 aria-label="Szukaj kierunku" autocomplete="off" spellcheck="false" enterkeyhint="go">
        </div>`
      : '';
    return `${search}<div class="settings-card wiz-list" id="wizKierunekList">${kierunekListHtml()}</div>`;
  }

  /** Wiersze listy kierunków — filtrowane i sortowane po wpisanych literach. */
  function kierunekListHtml() {
    const query = state.wizard.query || '';
    const shown = PW.rankKierunki(kierunkiOfNabor(), query);
    if (!shown.length) {
      return `<p class="materials-hint">Brak kierunku dla „${esc(query)}”.
        <button type="button" class="text-btn" data-wiz-clear-query>Wyczyść</button></p>`;
    }
    return shown.map((item) => choiceRow({
      attr: `data-wiz-kierunek="${esc(item.id)}"`,
      selected: item.field === state.sel.field,
      title: item.label,
    })).join('');
  }

  /** Przerysowanie samej listy kierunków — pole wyszukiwania nie traci fokusu. */
  function renderKierunekList() {
    const list = $('wizKierunekList');
    if (list) list.innerHTML = kierunekListHtml();
  }

  function wizardSpecHtml() {
    const items = state.wizard.specs || [];
    // Rocznik zawęża listę: pozycje bez grup w tym roczniku w ogóle nie
    // wchodzą — nie ma czego pokazywać ani czego tłumaczyć.
    const available = items.filter((item) => item.value && item.groups > 0);
    const legacy = available.filter((item) => item.source === 'catalog');
    const site = available.filter((item) => item.source !== 'catalog');
    const row = (item) => choiceRow({
      attr: `data-wiz-spec="${esc(item.id)}"`,
      selected: state.sel.spec === item.value,
      title: item.label,
    });
    const parts = [choiceRow({
      attr: 'data-wiz-skip-spec',
      selected: !state.sel.spec,
      title: 'Pomiń specjalność',
    }), ...site.map(row)];
    if (legacy.length) {
      parts.push('<p class="settings-group-head">Starsze nazwy z planów</p>');
      parts.push(...legacy.map(row));
    }
    return `<div class="settings-card wiz-list">${parts.join('')}</div>`;
  }

  /** Krok 1: roczniki całego wydziału, od najnowszego, z rokiem studiów. */
  function wizardNaborHtml() {
    const list = PW.cohortIndex(state.wizard.kierunki);
    if (!list.length) {
      return '<p class="materials-hint">Katalog nie ma jeszcze roczników. Odśwież za chwilę.</p>';
    }
    const ay = currentAcademicYear();
    const rows = list.map(({ value }) => {
      const info = PW.semesterFor(ay, value);
      return choiceRow({
        attr: `data-wiz-nabor="${esc(value)}"`,
        selected: String(state.sel.nabor) === value,
        title: naborLabel(value),
        meta: info ? `${info.year}. rok` : '',
      });
    }).join('');
    return `<div class="settings-card wiz-list">${rows}</div>`;
  }

  function wizardTrybHtml() {
    // Tryby z serwera zawężone do rocznika i specjalności. Gdy endpoint nie
    // odpowiedział, liczymy je z katalogu — krok nie może być ślepą uliczką.
    const own = (state.wizard.modes || []).filter((mode) => mode && mode.value);
    const values = own.length
      ? own
      : (PS.facets(state.groups, { ...state.sel, year: '', sem: '' }).mode || [])
        .filter((value) => value !== null)
        .map((value) => ({ value: String(value), groups: 0 }));
    if (!values.length) {
      return '<p class="materials-hint">Brak trybów dla tego wyboru — wróć i zmień rocznik.</p>';
    }
    const rows = values.map(({ value }) => choiceRow({
      attr: `data-wiz-tryb="${esc(value)}"`,
      selected: state.sel.mode === String(value),
      title: MODE_LABELS[value] || value,
    })).join('');
    return `<div class="settings-card wiz-list">${rows}</div>`;
  }

  function preparePlanStep() {
    const { groups, note, sel } = computePlanCandidates();
    state.wizard.plans = groups;
    state.wizard.note = note;
    // Wybór **po korekcie** (np. bez semestru, gdy ten jest pusty) — z niego
    // liczy się potem lista grup do dodania, więc musi być ten sam, co plany.
    state.wizard.sel = sel;
  }

  function wizardPlanHtml() {
    const plans = state.wizard.plans || [];
    if (!plans.length) {
      return '<p class="materials-hint">Nie ma planu dla tego wyboru. Wróć i zmień rocznik albo tryb.</p>';
    }
    // Plan już wczytany jest zaznaczony — inaczej Opcje → Wybór planu
    // pokazywałyby pusty wybór przy działającym planie.
    const current = state.planGroups.length ? String(state.planGroups[0]) : '';
    const rows = plans.map((group) => `
      <button type="button" class="radio-row" role="radio" aria-checked="${current === String(group.id) ? 'true' : 'false'}" data-wiz-plan="${esc(group.id)}">
        <span class="radio-mark" aria-hidden="true"></span>
        <span class="radio-text">
          <span class="radio-title">${esc(group.c || group.n || `grupa ${group.id}`)}</span>
          <span class="radio-sub">${esc(groupSubtitle(group))}</span>
        </span>
      </button>`).join('');
    return `<div class="settings-card wiz-list">${rows}</div>
      ${state.wizard.note ? `<p class="picker-note">${esc(state.wizard.note)}</p>` : ''}`;
  }

  /** Lista kierunków z formularza uczelni (cache w pamięci sesji). */
  async function wizLoadKierunki(force = false) {
    if (!force && state.wizard.kierunki.length) return;
    state.wizard.loading = true;
    state.wizard.error = null;
    refreshPicker();
    try {
      // `ay` tylko wtedy, gdy oglądamy archiwalny plan — wtedy roczniki i lata
      // studiów liczą się dla tego roku, a nie dla bieżącego.
      const query = state.ay ? `?ay=${encodeURIComponent(state.ay)}` : '';
      const data = await getJson(`/api/ideis/kierunki${query}`);
      state.wizard.kierunki = (data.items || []);
      state.wizard.faculty = (data.faculty && data.faculty.label) || null;
      state.wizard.warning = data.warning || null;
    } catch (err) {
      state.wizard.error = err.message || 'Nie udało się pobrać listy kierunków.';
    } finally {
      state.wizard.loading = false;
      refreshPicker();
    }
  }

  /**
   * Specjalności kierunku **w wybranym roczniku**. Rocznik jest parametrem
   * zapytania, bo ta sama specjalność bywa uruchamiana tylko dla jednego
   * naboru — a klucz cache zawiera oba, żeby zmiana rocznika odświeżyła listę.
   */
  async function wizLoadSpecs(kierunekId, nabor, force = false) {
    if (!kierunekId) {
      state.wizard.specs = [];
      refreshPicker();
      return;
    }
    const key = `${kierunekId}@${nabor || ''}`;
    if (!force && state.wizard.specsFor === key && state.wizard.specs.length) return;
    state.wizard.loading = true;
    state.wizard.error = null;
    refreshPicker();
    try {
      const params = new URLSearchParams({ kierunek: String(kierunekId) });
      if (nabor) params.set('nabor', String(nabor));
      if (state.ay) params.set('ay', String(state.ay));
      const data = await getJson(`/api/ideis/specjalnosci?${params.toString()}`);
      state.wizard.specs = data.items || [];
      state.wizard.specsFor = key;
      state.wizard.warning = data.warning || null;
    } catch (err) {
      state.wizard.error = err.message || 'Nie udało się pobrać listy specjalności.';
    } finally {
      state.wizard.loading = false;
      // Rocznik bez specjalności (typowy 1. rok): krok nie ma czego pokazać,
      // więc przechodzimy dalej sami — bez zmuszania do kliknięcia „pomiń”.
      if (activeStep() === 'spec' && !state.wizard.error && !wizardSpecsAvailable()) {
        wizChooseSpec(null);
        return;
      }
      refreshPicker();
    }
  }

  /** Czy w tym roczniku jest choć jedna specjalność z grupami. */
  function wizardSpecsAvailable() {
    return (state.wizard.specs || []).some((item) => item.value && item.groups > 0);
  }

  /** Tryby studiów dostępne dla wyboru (kierunek + rocznik + specjalność). */
  async function wizLoadModes(force = false) {
    const kierunekId = state.site.kierunekId;
    if (!kierunekId) {
      state.wizard.modes = [];
      refreshPicker();
      return;
    }
    const key = `${kierunekId}@${state.sel.nabor || ''}@${state.sel.spec || ''}`;
    if (!force && state.wizard.modesFor === key && state.wizard.modes.length) return;
    state.wizard.loading = true;
    state.wizard.error = null;
    refreshPicker();
    try {
      const params = new URLSearchParams({ kierunek: String(kierunekId) });
      if (state.sel.nabor) params.set('nabor', state.sel.nabor);
      if (state.sel.spec) params.set('spec', state.sel.spec);
      if (state.ay) params.set('ay', String(state.ay));
      const data = await getJson(`/api/ideis/tryby?${params.toString()}`);
      state.wizard.modes = (data.items || []).filter((item) => item && item.value);
      state.wizard.modesFor = key;
    } catch (err) {
      // Krok „tryb” ma listę zapasową z katalogu (`wizardTrybHtml`), więc brak
      // tego endpointu nie blokuje wyboru planu.
      state.wizard.modes = [];
      state.wizard.modesFor = key;
    } finally {
      state.wizard.loading = false;
      // Jeden tryb = nie ma czego wybierać; od razu plan.
      const only = (state.wizard.modes || []).filter((item) => item && item.value);
      if (activeStep() === 'tryb' && only.length === 1 && !state.sel.mode) {
        wizChooseTryb(only[0].value);
        return;
      }
      refreshPicker();
    }
  }

  /**
   * Kierunek: rocznik zostaje (wybrano go wcześniej), ale specjalność i tryb
   * są zarazem rocznikowe i kierunkowe — po zmianie kierunku wybieramy je od
   * nowa. Rocznik nie jest czyszczony, bo lista kierunków jest do niego
   * zawężona i jego zmiana nie jest tu potrzebna.
   */
  function wizChooseKierunek(id) {
    const item = state.wizard.kierunki.find((entry) => entry.id === id);
    if (!item) return;
    // Ten sam kierunek: nie ma czego czyścić, tylko zamykamy krok — inaczej
    // przypadkowe dotknięcie wybranej pozycji kasowałoby specjalność i tryb.
    if (state.site.kierunekId === item.id && state.sel.field === item.field) {
      state.wizard.openStep = null;
      refreshPicker({ reveal: firstIncompleteStep() });
      return;
    }
    state.site = {
      kierunekId: item.id,
      kierunekLabel: item.label,
      specId: '',
      specLabel: '',
      specSkipped: false,
    };
    state.sel = { ...state.sel, field: item.field, spec: '', degree: '', mode: '' };
    state.wizard.specs = [];
    state.wizard.modes = [];
    state.wizard.query = '';
    state.wizard.openStep = null;
    // Wybór jest jeszcze szkicem: zapisujemy go dopiero razem z planem
    // (`selectPlan`). Inaczej przeładowanie strony w połowie wyboru zmieniało
    // plan pod spodem (np. dogrywało grupę wykładową z innego rocznika).
    refreshPicker({ reveal: 'spec' });
    wizLoadSpecs(state.site.kierunekId, state.sel.nabor);
  }

  /** Pierwszy krok, którego brakuje — do „Wybierz plan” i wejścia z ekranu powitalnego. */
  function firstIncompleteStep() {
    if (!state.sel.nabor) return 'nabor';
    if (!state.sel.field) return 'kierunek';
    // Krok specjalności znika sam, gdy rocznik nie ma żadnej. Dopóki lista nie
    // jest pobrana, nie zgadujemy — lepiej pokazać krok niż go przeskoczyć.
    const known = state.wizard.specsFor === `${state.site.kierunekId}@${state.sel.nabor || ''}`;
    if ((!known || wizardSpecsAvailable()) && !state.site.specId && !state.site.specSkipped) return 'spec';
    if (!state.sel.mode) return 'tryb';
    return 'plan';
  }

  /**
   * Rocznik: z niego i z daty wynika rok studiów oraz semestr. Jeśli wybrany
   * kierunek nie ma grup w nowym roczniku, wracamy do listy kierunków (zostaje
   * tylko rocznik); jeśli ma — zostaje i pytamy o specjalność. Specjalność
   * i tryb czyścimy zawsze: ich oferta jest rocznikowa.
   */
  function wizChooseNabor(value) {
    const nabor = String(value);
    // Ten sam rocznik: nie ma czego czyścić, tylko zamykamy krok — inaczej
    // przypadkowe dotknięcie wybranej pozycji kasowałoby specjalność i tryb.
    if (nabor === String(state.sel.nabor || '')) {
      state.wizard.openStep = null;
      refreshPicker({ reveal: firstIncompleteStep() });
      return;
    }
    const keepField = Boolean(state.sel.field)
      && kierunkiOfNabor(nabor).some((item) => item.field === state.sel.field);
    const next = PW.withSemester({
      ...state.sel,
      nabor,
      field: keepField ? state.sel.field : '',
    }, currentAcademicYear(), new Date());
    state.sel = { ...next, spec: '', degree: '', mode: '' };
    state.site = {
      ...state.site,
      kierunekId: keepField ? state.site.kierunekId : '',
      kierunekLabel: keepField ? state.site.kierunekLabel : '',
      specId: '',
      specLabel: '',
      specSkipped: false,
    };
    state.wizard.specs = [];
    state.wizard.modes = [];
    state.wizard.query = '';
    state.wizard.openStep = null;
    // Szkic, nie wybór — patrz `selectPlan` (tam zapisujemy dopiero plan).
    refreshPicker({ reveal: keepField ? 'spec' : 'kierunek' });
    if (keepField) wizLoadSpecs(state.site.kierunekId, state.sel.nabor);
  }

  function wizChooseSpec(id) {
    if (id == null) {
      state.sel = { ...state.sel, spec: '' };
      state.site = { ...state.site, specId: '', specLabel: '', specSkipped: true };
    } else {
      const item = state.wizard.specs.find((entry) => entry.id === id);
      if (!item || !item.value) return;
      state.sel = { ...state.sel, spec: item.value };
      state.site = { ...state.site, specId: item.id, specLabel: item.label, specSkipped: false };
    }
    state.wizard.modes = [];
    state.wizard.openStep = null;
    refreshPicker({ reveal: 'tryb' });
    wizLoadModes();
  }

  function wizChooseTryb(value) {
    state.sel = { ...state.sel, mode: String(value) };
    preparePlanStep();
    if (state.wizard.plans.length === 1) {
      finishWizard(state.wizard.plans[0].id);
      return;
    }
    state.wizard.openStep = null;
    refreshPicker({ reveal: 'plan' });
  }

  /** „Od nowa”: czyści cały wybór i wraca do rocznika (plan zostaje, jaki jest). */
  function wizReset() {
    state.sel = { ...state.sel, nabor: '', field: '', spec: '', year: '', degree: '', mode: '', sem: '' };
    state.site = { kierunekId: '', kierunekLabel: '', specId: '', specLabel: '', specSkipped: false };
    state.wizard.specs = [];
    state.wizard.modes = [];
    state.wizard.plans = [];
    state.wizard.query = '';
    state.wizard.openStep = null;
    refreshPicker();
  }

  /**
   * Koniec kreatora: plan bazowy (wykład) + dzisiejszy semestr, potem pytanie
   * o własne ćwiczenia i laboratoria.
   */
  function finishWizard(groupId) {
    const group = groupById(groupId);
    if (!group) return;
    const ay = state.ay != null ? Number(state.ay) : Number(state.academicYear && state.academicYear.start);
    // Wybór przygotowany przez `preparePlanStep` — może mieć poluzowany semestr
    // (wtedy grupy do dodania też muszą być liczone bez semestru).
    const base = state.wizard.sel || PW.withSemester(state.sel, ay, new Date());
    const selectedSpec = base.spec || (group.s || '');
    const sel = {
      ...base,
      spec: selectedSpec,
      degree: group.d || base.degree || '',
    };
    state.sel = sel;
    state.site = {
      ...state.site,
      kierunekLabel: state.site.kierunekLabel || group.f || sel.field,
      // Wybrana grupa wykładowa niesie specjalność — pokazujemy ją w podpisie
      // i zawężamy listę grup do dodania (bez tego widać ćwiczenia wszystkich
      // specjalności roku). Skoro plan jest już przypisany do specjalności,
      // zapisujemy ją także jako wybór — inaczej karta mówi „specjalność”,
      // a krok specjalności pokazuje zaznaczone „Pomiń specjalność”.
      specLabel: state.site.specLabel || group.s || '',
      specId: state.site.specId || (selectedSpec ? `katalog:${selectedSpec}` : ''),
      specSkipped: selectedSpec ? false : Boolean(state.site.specSkipped),
    };
    closeSheet();
    selectPlan([String(group.id)], { ay, sel, first: true });
  }

  /** Grupa bazowa, gdy zapisany plan to sama grupa ćwiczeniowa. */
  function ensurePlanBase() {
    if (state.needsGroup || !state.sel.field || !state.groups.length) return;
    if (state.planGroups.some((id) => (groupById(id) || {}).k === 'Wyk')) return;
    const base = baseGroupForSelection();
    if (!base || state.planGroups.includes(String(base.id))) return;
    state.planGroups = [String(base.id), ...state.planGroups];
    state.group = state.planGroups[0];
    writePrefs({ planGroups: state.planGroups, groupId: state.group });
    syncUrl();
  }

  /** Semestr wyliczony z naboru i bieżącej daty (brak pola „semestr” w UI). */
  function ensureSemester() {
    if (!state.sel.nabor) return;
    const ay = state.ay != null ? Number(state.ay) : Number(state.academicYear && state.academicYear.start);
    const info = PW.withSemester({ nabor: state.sel.nabor }, ay, new Date());
    if (!info.sem) return;
    state.sel = { ...state.sel, year: info.year, sem: info.sem };
  }

  // ------------------------------- 7c. Grupy w planie ---------------------

  /** Arkusz „Dodaj grupy”: bez wykładów (są wliczone automatycznie). */
  function openAddPlanSheet({ first = false, fromSettings = false } = {}) {
    state.wizard.pendingAdd = state.wizard.pendingAdd || new Set();
    state.wizard.pendingAdd.clear();
    state.wizard.addFirst = Boolean(first);
    // Skąd weszliśmy — po dodaniu wracamy tam, a nie na plan (Opcje → Plan).
    state.wizard.addBack = fromSettings ? (state.settingsPage || 'plan') : null;
    openSheet(addPlanHtml({ first }));
    state.sheetKind = 'add-plan';
  }

  /** Zamknięcie arkusza dodawania: powrót do Opcji → Plan albo do planu. */
  function closeAddPlanSheet() {
    const back = state.wizard.addBack;
    state.wizard.addBack = null;
    if (back) {
      openSettings(back);
      return;
    }
    closeSheet();
  }

  /** Tytuł wiersza do dodania: rodzaj zajęć + numer grupy („Laboratorium · gr. 1A”). */
  function addGroupTitle(group) {
    const kind = PW.kindLabel(group.k || '');
    const number = group.num ? `gr. ${group.num}` : '';
    const label = [kind, number].filter(Boolean).join(' · ');
    return label || group.c || group.n || `grupa ${group.id}`;
  }

  /** Podpis wiersza do dodania: co odróżnia tę grupę od innych w tym samym rodzaju. */
  function addGroupSubtitle(group) {
    const parts = [`grupa ${group.id}`];
    if (group.y) parts.push(`${group.y}. rok`);
    if (group.sem) parts.push(`${group.sem}. sem.`);
    if (group.m) parts.push(MODE_LABELS[group.m] || group.m);
    return parts.join(' · ');
  }

  function addPlanHtml({ first = false } = {}) {
    const candidates = PW.addableGroups(state.groups, state.sel, state.planGroups);
    const pending = state.wizard.pendingAdd || new Set();
    const kinds = new Map();
    for (const group of candidates) {
      const kind = group.k || 'Inne';
      if (!kinds.has(kind)) kinds.set(kind, []);
      kinds.get(kind).push(group);
    }
    const sections = [...kinds.entries()].map(([kind, list]) => `
      <p class="settings-group-head">${esc(PW.kindLabel(kind))} (${list.length})</p>
      <div class="settings-card">
        ${list.map((group) => {
          const on = pending.has(String(group.id));
          return `<button type="button" class="radio-row wiz-pick"
              data-plan-pick="${esc(group.id)}" aria-pressed="${on ? 'true' : 'false'}">
            <span class="radio-mark" aria-hidden="true"></span>
            <span class="radio-text">
              <span class="radio-title">${esc(addGroupTitle(group))}</span>
              <span class="radio-sub">${esc(addGroupSubtitle(group))}</span>
            </span>
          </button>`;
        }).join('')}
      </div>`).join('');
    const count = pending.size;
    return `<h2 class="sheet-title" id="sheetTitle">${first ? 'Dodaj swoje grupy' : 'Dodaj grupy do planu'}</h2>
      <p class="sheet-sub">Wykłady są wliczone automatycznie — wybierz swoje ćwiczenia,
        laboratoria i lektorat.</p>
      ${state.planGroups.length ? `<p class="picker-scope">W planie: ${esc(planLabel())}</p>` : ''}
      ${sections || '<p class="materials-hint">Nie ma już grup do dodania w tym wyborze.</p>'}
      <div class="wiz-actions">
        <span class="wiz-count">${count
    ? `Zaznaczono ${count} ${countLabel(count, 'grupę', 'grupy', 'grup')}`
    : 'Zaznacz grupy, które są Twoje'}</span>
        <button type="button" class="text-btn" data-add-plan-skip>${first ? 'Pomiń' : 'Zamknij'}</button>
        <button type="button" class="btn-filled" data-add-plan-apply ${count ? '' : 'disabled'}>
          ${count ? `Dodaj (${count})` : 'Dodaj'}
        </button>
      </div>`;
  }

  function renderAddPlanSheet() {
    if (state.sheetKind !== 'add-plan' || $('sheet').hidden) return;
    $('sheetBody').innerHTML = addPlanHtml({ first: Boolean(state.wizard.addFirst) });
  }

  function applyPendingGroups() {
    const pending = [...(state.wizard.pendingAdd || new Set())];
    if (!pending.length) return;
    state.wizard.pendingAdd.clear();
    // Zamykamy arkusz **przed** dodaniem: po zmianie planu i tak wracamy do
    // miejsca, z którego przyszliśmy (Opcje → Plan albo plan zajęć).
    closeAddPlanSheet();
    addPlanGroup(pending, { ay: state.ay });
    toast(`Dodano ${pending.length} ${countLabel(pending.length, 'grupę', 'grupy', 'grup')} do planu`);
  }

  /** Pytanie po pierwszej konfiguracji: dodać własne grupy czy pominąć. */
  function maybePromptAddPlan() {
    if (state.needsGroup || !state.groups.length) return;
    window.setTimeout(() => {
      if (!$('sheet').hidden) return;
      openAddPlanSheet({ first: true });
    }, 600);
  }


  /** Grupy w formacie wiersza radio — z podpisem rocznika, żeby było widać rok. */
  function groupSubtitle(group) {
    const parts = [`grupa ${group.id}`];
    if (group.y) parts.push(`${group.y}. rok`);
    if (group.d) parts.push(DEGREE_LABELS[group.d] || group.d);
    if (group.m) parts.push(MODE_LABELS[group.m] || group.m);
    const nabory = Array.isArray(group.b) && group.b.length ? group.b : [];
    if (nabory.length) parts.push(`nabór ${naborLabel(String(Math.max(...nabory.map(Number))))}`);
    return parts.join(' · ');
  }

  function parseClock(value, fallbackMinutes) {
    if (Number.isFinite(fallbackMinutes) && fallbackMinutes >= 0) return fallbackMinutes;
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function toSlot(dto) {
    if (!dto || !dto.date) return null;
    const startMinutes = parseClock(dto.start, dto.startMinutes);
    if (startMinutes === null) return null;
    const endMinutes = parseClock(dto.end, dto.endMinutes) ?? startMinutes;
    const safeEnd = endMinutes > startMinutes ? endMinutes : startMinutes;
    const form = (dto.form && (dto.form.label || dto.form.raw)) || null;
    const room = (dto.room && dto.room.label) || String(dto.roomRaw || '').trim() || null;
    const lecturer = String(dto.lecturer || '').trim() || null;
    const notes = String(dto.notes || '').trim() || null;
    return {
      id: dto.id,
      date: dto.date,
      startMinutes,
      endMinutes: safeEnd,
      durationMinutes: safeEnd - startMinutes,
      subject: String(dto.subject || '').trim(),
      form,
      mode: dto.mode || null,
      room,
      lecturer,
      notes,
      group: dto.group || null,
      remote: /zdaln/i.test(dto.mode || ''),
    };
  }

  function applyPlan(plan, savedAt) {
    const slots = (plan.classes || []).map(toSlot).filter(Boolean);
    const byDate = {};
    slots.forEach((slot) => {
      (byDate[slot.date] = byDate[slot.date] || []).push(slot);
    });
    Object.values(byDate).forEach((list) => list.sort((a, b) => a.startMinutes - b.startMinutes));

    state.slots = slots;
    state.byDate = byDate;
    state.dates = Object.keys(byDate).sort();
    state.savedAt = savedAt || Date.now();
    // `groupName` to nazwa planu jednej grupy; przy scalonym planie byłaby
    // sklejeniem wszystkich nazw („A + B + C”), więc podpis bierzemy z katalogu.
    if (state.planGroups.length <= 1) {
      state.groupName = (plan.meta && plan.meta.groupName) || state.groupName;
    }
    // Plan dotyczy tej grupy — od tego zależy, czy zmiana grupy ma cokolwiek wczytać.
    state.planKey = planCacheKey();
    // Tożsamość treści do sprawdzania w tle (`checkPlanVersion`). Sam numer
    // wersji nie wystarcza: jest liczony od nowa po restarcie serwera.
    state.planVersion = plan.version || null;
    // Plan jest na ekranie — jeśli instrukcja instalacji czekała na wyjście
    // z kreatora, to jest ten moment.
    flushPendingInstallGuide();
  }

  async function getJson(path, options) {
    const res = await fetch(path, {
      headers: { accept: 'application/json' },
      ...options,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (err) {
      throw new Error('Nieprawidłowa odpowiedź serwera.');
    }
    if (!res.ok) {
      throw new Error((data && data.error) || `Błąd serwera (${res.status})`);
    }
    return data;
  }

  /** To samo, co „Odśwież” w natywnej aplikacji: gałka dotyka harmonogramu uczelni. */
  async function fetchPlanEnvelope(force) {
    if (force) {
      try {
        return await getJson(apiUrl('/api/refresh'), { method: 'POST' });
      } catch (err) {
        // REFRESH_TOKEN, stary serwer albo throttling — schodzimy do zwykłego GET.
      }
    }
    return getJson(apiUrl('/api/plan'));
  }

  async function loadGroups(force) {
    if (!force && state.groups.length && Date.now() - state.groupsAt < GROUPS_TTL_MS) return;
    try {
      const data = await getJson('/api/groups');
      if (data && data.ok && data.groups && data.groups.length) {
        state.groups = data.groups;
        state.groupsAt = Date.now();
        state.defaults = data.defaults || state.defaults;
        state.academicYear = data.academicYear || state.academicYear;
        adoptSelectionFromCatalog();
      }
    } catch (err) { /* katalog jest opcjonalny — zostaje numer ręczny */ }
  }

  /**
   * Uzupełnia brakujące wymiary po wczytaniu katalogu:
   *   - pierwsze wejście → wybór początkowy z serwera (DEFAULT_*),
   *   - stary link `?group=NNNN` → wymiary tej grupy z katalogu,
   *   - `?ay=RRRR` (starszy nabór) → nabór przeliczony z roku studiów.
   *
   * Pełny wybór z `?…`/pamięci (co najmniej dwa pola) zostaje nietknięty.
   */
  function adoptSelectionFromCatalog() {
    const filled = ['nabor', 'field', 'spec', 'year', 'degree', 'mode'].filter((key) => state.sel[key]).length;
    const group = groupById(state.group);
    // Pierwsze uruchomienie: wybór ma być pusty, żeby kreator zaczął od
    // kierunku — podpowiadanie wymiarów domyślnej grupy wyglądało jak wybór,
    // którego użytkownik nie zrobił.
    if (filled < 2 && !state.needsGroup) {
      if (group) {
        state.sel = selectionOfGroup(group, state.sel);
      } else if (state.defaults) {
        state.sel = { ...state.defaults };
      }
      // Rok akademicki planu jest ważniejszy od „najnowszego naboru” grupy:
      //   `?ay=2025` + 2. rok  → nabór 2024,
      //   brak `ay` (stary link) → nabór liczony od bieżącego roku akademickiego.
      const year = Number(state.sel.year);
      const studyYear = Number.isFinite(year) && year >= 1 ? year - 1 : 0;
      const ay = state.ay != null ? Number(state.ay) : Number(state.academicYear && state.academicYear.start);
      if (Number.isFinite(ay) && ay >= 2000) state.sel.nabor = String(ay - studyYear);
      writePrefs({ sel: state.sel });
    }
    if (state.ay == null) {
      const ay = selectionAcademicYear(state.sel);
      if (ay != null) state.ay = String(ay);
    }
    // Semestr i plan bazowy: kreator liczy je z naboru i daty, a stare zapisy
    // (sama grupa ćwiczeniowa) dostają grupę wykładową, żeby nie zostały bez wykładów.
    ensureSemester();
    ensurePlanBase();
    // Wybór uzupełniony z katalogu dotyczy planu, który zaraz wczytamy —
    // dopiero od tego miejsca jest „prawdziwy” (nie szkic).
    markAppliedSelection();
    syncUrl();
  }

  /**
   * Spinacze materiałów (APK 1.9): jedna lekka odpowiedź zamiast pytania
   * o każdą kartę. Błąd jest ignorowany — brak indeksu oznacza po prostu brak
   * ikon, nie błąd planu. Identyfikator zajęć jest wspólny dla wszystkich grup,
   * więc materiały do wykładu widać też w grupie, która ich nie dodała.
   */
  async function loadAttachmentIndex() {
    if (navigator.onLine === false) return;
    try {
      const data = await getJson('/api/attachments/index');
      const classes = (data && data.classes) || {};
      const next = new Set(Object.keys(classes).filter((id) => {
        const counts = classes[id] || {};
        return (Number(counts.files) || 0) + (Number(counts.links) || 0) > 0;
      }));
      const changed = next.size !== state.attachmentIds.size
        || Array.from(next).some((id) => !state.attachmentIds.has(id));
      state.attachmentIds = next;
      if (changed) render();
    } catch (err) { /* indeks jest opcjonalny */ }
  }

  /**
   * Notatki na kafelkach („Kolos”, „Egzamin”). Jedna lekka odpowiedź na cały
   * plan, jak indeks materiałów — kafelek nie pyta o notatkę osobno. Błąd jest
   * ignorowany: brak notatek oznacza po prostu brak plakietek, nie błąd planu.
   */
  async function loadNotes() {
    if (navigator.onLine === false) return;
    try {
      const data = await getJson('/api/notes');
      const notes = (data && data.notes) || {};
      const next = new Map(Object.entries(notes).filter(([, text]) => typeof text === 'string' && text));
      const changed = next.size !== state.notes.size
        || Array.from(next).some(([id, text]) => state.notes.get(id) !== text);
      state.notes = next;
      if (changed) render();
    } catch (err) { /* notatki są opcjonalne */ }
  }

  /**
   * Czy plan w pamięci to ta sama treść, którą ma serwer?
   *
   * Najpierw **odcisk treści** (`fingerprint`), bo tylko on jest tożsamością:
   * `version.id` jest licznikiem w pamięci serwera i po restarcie wraca do #1,
   * więc klient ze starym planem uznawałby go za aktualny już na zawsze.
   * Starsze serwery nie znają odcisku — dla nich `fetchedAt` (zmienia się razem
   * z treścią), a na końcu numer wersji.
   *
   * @param {object|null} known `plan.version` z cache/odpowiedzi API
   * @param {object|null} server odpowiedź `/api/version`
   */
  function samePlanVersion(known, server) {
    if (!server || !known) return false;
    const serverPrint = server.currentFingerprint || server.fingerprint;
    if (serverPrint && known.fingerprint) return serverPrint === known.fingerprint;
    const serverFetchedAt = server.currentFetchedAt || server.fetchedAt;
    if (serverFetchedAt && known.fetchedAt) return serverFetchedAt === known.fetchedAt;
    const serverId = server.currentId != null ? server.currentId : server.id;
    return serverId != null && known.id === serverId;
  }

  async function load(force) {
    // Numeracja wczytań. Dwa mogą iść naraz (np. wybór planu, a zaraz po nim
    // dodanie grup), a odpowiedź starszego przychodzi pierwsza — bez tej bariery
    // jego `finally` gasiło animację nowszego, więc na ekranie pojawiał się
    // plan bez dodanych grup, a resztę zajęć „doładowywało” dopiero po chwili.
    const seq = (state.loadSeq = (state.loadSeq || 0) + 1);
    const isCurrent = () => seq === state.loadSeq;

    state.lastLoadAt = Date.now();
    state.today = todayIso();
    state.error = null;

    const cached = readCachedPlan();
    // Boot narysował już ten sam plan z pamięci — drugi pełny render jest zbędny.
    const alreadyShown = Boolean(cached) && state.slots.length > 0 && state.savedAt === cached.savedAt;
    if (cached && !alreadyShown) {
      applyPlan(cached.plan, cached.savedAt);
      state.loading = false;
      render();
    } else if (!cached) {
      state.loading = state.slots.length === 0;
      render();
    }

    // Bez sieci nie ma po co pytać API — plan z pamięci jest pełnoprawny.
    if (navigator.onLine === false) {
      state.loading = false;
      state.refreshing = false;
      state.offline = Boolean(cached || state.slots.length);
      if (!state.offline) state.error = 'Brak internetu i brak zapisanego planu.';
      render();
      return;
    }

    state.refreshing = true;
    renderChrome();

    // Spinacze nie blokują planu: indeks leci równolegle z resztą pobierania.
    loadAttachmentIndex();
    loadNotes();

    await loadGroups(force);
    // Nowe wczytanie wystartowało, gdy to czekało na katalog grup — oddajemy
    // pałeczkę jemu, żeby nie cofnąć jego stanu ładowania.
    if (!isCurrent()) return;
    if (state.groups.length) {
      const found = state.groups.find((group) => String(group.id) === String(state.group));
      if (found && !state.groupName) state.groupName = found.n || found.c;
    }

    if (!force && cached && Date.now() - cached.savedAt < FRESH_MS) {
      // Plan z pamięci jest pełnoprawny — nic się już nie „wczytuje”. Bez tego
      // `state.loading` zostawało `true` z bootu i gest w bok był martwy
      // (`attachSwipe` nie zaczyna przeciągania, gdy trwa wczytywanie).
      state.loading = false;
      state.refreshing = false;
      state.offline = false;
      render();
      return;
    }

    try {
      const serverVersion = await getJson(apiUrl('/api/version'));
      if (!isCurrent()) return;
      if (cached && samePlanVersion(cached.plan.version, serverVersion)) {
        writeCachedPlan(cached.plan, Date.now());
        applyPlan(cached.plan, Date.now());
        state.loading = false;
        state.offline = false;
        state.error = null;
        state.refreshing = false;
        render();
        return;
      }
    } catch (err) { /* brak /api/version nie blokuje pełnego planu */ }

    try {
      const plan = await fetchPlanEnvelope(force);
      // Odpowiedź starszego żądania nie może już niczego podmienić: na ekranie
      // ma wylądować plan z **ostatniego** wyboru, w całości.
      if (!isCurrent()) return;
      if (!plan || !plan.ok) throw new Error((plan && plan.error) || 'Nieprawidłowa odpowiedź API');
      const savedAt = Date.parse((plan.version && plan.version.fetchedAt) || plan.generatedAt) || Date.now();
      writeCachedPlan(plan, savedAt);
      applyPlan(plan, savedAt);
      state.offline = false;
      state.error = null;
    } catch (err) {
      if (!isCurrent()) return;
      if (cached) {
        state.offline = true;
        state.error = null;
      } else {
        state.error = err.message || 'Nie udało się pobrać planu.';
      }
    } finally {
      // Animacja wczytywania trwa, dopóki trwa **najnowsze** wczytanie —
      // dopiero ono może ją zgasić.
      if (isCurrent()) {
        state.loading = false;
        state.refreshing = false;
        render();
      }
    }
  }

  /**
   * Lekkie „czy plan u uczelni się zmienił” — bez ruszania ekranu.
   *
   * `load()` wraca z pamięci, gdy plan jest młodszy niż `FRESH_MS`, więc samo
   * otwarcie strony nie pytało o wersję. Tutaj wystarczy `GET /api/version`
   * (kilkaset bajtów): zgodny odcisk treści kończy sprawę, a inny uruchamia
   * normalne wczytanie planu. Odpowiednik `RefreshWorker` z APK.
   */
  async function checkPlanVersion() {
    if (state.needsGroup || !state.planGroups.length) return;
    if (state.loading || state.refreshing) return;
    if (navigator.onLine === false) return;
    if (document.visibilityState === 'hidden') return;
    try {
      const serverVersion = await getJson(apiUrl('/api/version'));
      // Ten sam plan: nic nie robimy, żeby nie mrugać ekranem.
      if (samePlanVersion(state.planVersion, serverVersion)) return;
      load(true);
    } catch (err) { /* sprawdzanie w tle nie może psuć pokazanego planu */ }
  }

  /**
   * Ustawia plan (lista grup) i wczytuje go, jeśli zmiana jest realna.
   * Pierwsza grupa jest bazowa (wykład) — reszta to ćwiczenia, laby, lektorat.
   *
   * @param {string[]} groups numery grup
   * @param {{ ay?: string|null, sel?: object, first?: boolean }} [opts]
   */
  function selectPlan(groups, { ay = state.ay, sel = null, first = false } = {}) {
    const list = [...new Set((groups || []).map(String).filter((id) => /^\d{2,8}$/.test(id)))];
    if (!list.length) return;
    if (sel) state.sel = sel;
    const nextAy = ay == null || ay === '' ? null : String(ay);
    const changed = planCacheKey(list, nextAy) !== state.planKey;
    state.planGroups = list;
    state.group = list[0];
    state.ay = nextAy;
    writePrefs({
      groupId: list[0],
      planGroups: list,
      hasChosenGroup: true,
      sel: state.sel,
      ay: state.ay,
      site: state.site,
    });
    state.needsGroup = false;
    // Od tej chwili ten wybór opisuje plan, który jest na ekranie — kroki
    // pickera mogą go już tylko szkicować (patrz `restoreAppliedSelection`).
    markAppliedSelection();
    syncUrl();
    if (!changed) {
      render();
      maybeShowWhatsNew();
      return;
    }
    state.slots = [];
    state.dates = [];
    state.byDate = {};
    state.savedAt = 0;
    state.groupName = null;
    state.selectedDate = null;
    state.weekAnchor = null;
    state.monthKey = null;
    state.loading = true;
    state.error = null;
    state.offline = false;
    // Materiały są wspólne dla grup (wykład), ale licznik i lista mogą się
    // różnić — po zmianie planu pamięć zaczyna od zera.
    materialsCache.clear();
    render();
    load(true);
    // Pierwsze wejście: arkusz „Co nowego” czekał na wybór grupy.
    maybeShowWhatsNew();
    if (first) maybePromptAddPlan();
  }

  /** Stary link `?group=NNNN` i numer wpisany ręcznie. */
  function selectGroup(groupId) {
    const normalized = String(groupId || '').trim();
    if (!normalized) return;
    if (!DIMENSIONS.some((field) => state.sel[field.key])) {
      const group = groupById(normalized);
      if (group) state.sel = selectionOfGroup(group, state.sel);
    }
    // Plan z numeru grupy: baza = grupa wykładowa z tego samego wyboru, żeby
    // oglądana grupa ćwiczeniowa nie została bez wykładów.
    const base = baseGroupForSelection();
    const ay = state.ay != null ? state.ay : selectionAcademicYear(state.sel);
    selectPlan(base && base.id !== normalized ? [String(base.id), normalized] : [normalized], { ay });
  }

  /** Grupa wykładowa (baza planu) dla bieżącego wyboru — albo null. */
  function baseGroupForSelection(sel = state.sel) {
    if (!state.groups.length || !state.sel.field) return null;
    const found = filteredGroups(sel).filter((group) => group.k === 'Wyk');
    return found[0] || null;
  }

  /** Dodanie grup (ćwiczenia/lab/lektorat) do planu — jedna lub kilka naraz. */
  function addPlanGroup(groupIds, opts) {
    const wanted = (Array.isArray(groupIds) ? groupIds : [groupIds])
      .map((id) => String(id || '').trim())
      .filter((id) => id && !state.planGroups.includes(id));
    if (!wanted.length) return;
    selectPlan([...state.planGroups, ...wanted], opts);
  }

  /** Usunięcie grupy z planu — bazy nie można usunąć, plan musi mieć grupę. */
  function removePlanGroup(groupId) {
    if (state.planGroups.length < 2) return;
    selectPlan(state.planGroups.filter((id) => id !== String(groupId)));
  }

  function selectStyle(styleId) {
    const normalized = normalizeStyle(styleId);
    state.styleId = normalized;
    // Wybór użytkownika jest już „nasz” — zapisujemy epokę, żeby przetrwał
    // kolejne wejścia (bez tego każde uruchomienie wracało do domyślnego).
    writePrefs({ styleId: normalized, theme: normalized, themePicked: true, styleEpoch: STYLE_EPOCH });
    applyStyle(normalized);
    syncUrl();
    render();
  }

  /**
   * Parametry w adresie (`?group=`, `?style=`, `?view=`) mają pierwszeństwo przy
   * wejściu — po zmianie z UI nadpisujemy je, żeby odświeżenie strony nie cofało
   * wyboru użytkownika.
   */
  function syncUrl() {
    const params = new URLSearchParams(window.location.search);
    // Grupy i rok akademicki trafiają do adresu zawsze, gdy są znane — link ma
    // otwierać dokładnie ten plan (także po zmianie roku akademickiego
    // u uczelni). Stare linki `?group=21188` nadal działają: brak `ay` znaczy
    // „rok bieżący”, a brak `groups` — plan z jednej grupy.
    if (state.needsGroup) {
      // Przed pierwszym wyborem nie ma czego zapisywać w adresie — inaczej link
      // „?group=21188” sugerowałby plan, którego użytkownik jeszcze nie wybrał.
      params.delete('group');
      params.delete('groups');
      params.delete('ay');
    } else if (state.planGroups.length > 1) {
      params.set('groups', state.planGroups.join(','));
      params.delete('group');
    } else if (state.planGroups.length === 1) {
      params.set('group', state.planGroups[0]);
      params.delete('groups');
    } else if (state.group) {
      params.set('group', state.group);
    }
    if (state.ay) params.set('ay', state.ay);
    else params.delete('ay');
    if (params.has('style')) params.set('style', state.styleId);
    if (params.has('view')) params.set('view', state.view);
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', next);
    }
  }

  const VIEW_ORDER = ['day', 'week', 'month', 'semester'];

  function selectView(view) {
    if (!VIEW_ORDER.includes(view)) return;
    if (state.view === view) return;
    const direction = VIEW_ORDER.indexOf(view) > VIEW_ORDER.indexOf(state.view) ? 1 : -1;
    state.view = view;
    state.enter = { target: 'view', dir: direction };
    // Tryb widoku jest wyłącznie stanem ekranu — nie zapisujemy go, bo „ostatnio
    // oglądany semestr” nie jest dobrym widokiem startowym (APK 1.7).
    syncUrl();
    if (view === 'week') state.weekAnchor = ScheduleViews.weekStart(anchorDay());
    if (view === 'month') {
      state.monthKey = ScheduleViews.monthOf(anchorDay());
    }
    render();
  }

  // ----------------------------------------------------------- 8. Render

  const viewport = () => $('viewport');

  function activeDay() {
    // Wybór użytkownika ma pierwszeństwo — także dla dnia bez zajęć, bo wtedy
    // widać „Brak zajęć w tym dniu”. Wcześniej taki dzień po cichu wracał do
    // najbliższych zajęć, co wyglądało na zepsuty kafelek (zmiana z APK 1.5).
    if (state.selectedDate) return state.selectedDate;
    return ScheduleViews.initialDay(state.dates, state.today);
  }

  /**
   * Dzień-kotwica widoków okresowych (tydzień, miesiąc) — **ten sam**, który
   * pokazuje widok dnia. Wcześniej dzień i miesiąc startowały na pierwszym dniu
   * z zajęciami, a tydzień na „dziś”, więc ten sam plan otwierał się w trzech
   * różnych miejscach (i tydzień często witał „Brak zajęć”).
   */
  function anchorDay() {
    return activeDay() || state.today;
  }

  function groupLabel() {
    const baseGroup = groupById(state.planGroups[0]);
    let base = baseGroup ? (baseGroup.c || baseGroup.n) : '';
    if (!base && state.groupName) {
      base = Format.shortGroupName(state.groupName) || state.groupName;
    }
    if (!base) base = `grupa ${state.group}`;
    // Plan z kilku grup: podstawa + licznik dodanych (ćwiczenia, laby…).
    const extra = Math.max(0, state.planGroups.length - 1);
    const suffix = extra ? ` +${extra}` : '';
    // Przy planie starszego rocznika dopisujemy rok akademicki — inaczej nie
    // widać, że ogląda się np. 2025/2026 zamiast bieżącego.
    const currentStart = Number(state.academicYear && state.academicYear.start);
    const ay = state.ay == null || state.ay === '' ? NaN : Number(state.ay);
    if (Number.isFinite(ay) && ay >= 2000 && Number.isFinite(currentStart) && ay !== currentStart) {
      return `${base}${suffix} · ${ay}/${ay + 1}`;
    }
    return `${base}${suffix}`;
  }

  function renderChrome() {
    $('groupSub').textContent = groupLabel();
    $('refreshLine').hidden = !state.refreshing;

    Array.from(document.querySelectorAll('#tabs button[data-view]')).forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.view === state.view));
    });
    const badge = $('optionsBadge');
    if (badge) badge.hidden = !state.update.available;
    $('btnOptions').setAttribute(
      'aria-label',
      state.update.available ? 'Opcje — dostępna nowa wersja' : 'Opcje',
    );

    positionTabIndicator(state.tabsReady);
    state.tabsReady = true;
  }

  /**
   * Przesuwa podświetlenie dolnych kafelków pod wybrany widok. Pierwsze
   * ustawienie jest bez animacji (inaczej pigułka „przyjeżdżałaby” z lewej),
   * każde następne — sprężyną CSS (patrz `--spring`).
   */
  function positionTabIndicator(animate) {
    const tabs = $('tabs');
    if (!tabs) return;
    const indicator = tabs.querySelector('.tab-indicator');
    const button = tabs.querySelector('button[data-view][aria-selected="true"]');
    if (!indicator || !button) return;
    positionHighlight(indicator, button, animate);
  }

  /**
   * Prostokąt „plamki” pod elementem paska. Bierzemy go z układu
   * (`offsetLeft/offsetWidth`), a nie z `getBoundingClientRect()`, bo wybrany
   * kafelek jest przeskalowany (`scale(1.06)`) — plamka ma zostać rozmiaru
   * kafelka z układu, jak `TileHighlight` liczący się z szerokości paska.
   */
  function highlightRect(element) {
    return { x: element.offsetLeft, w: element.offsetWidth };
  }

  /**
   * Plamka w trwałym pasku (dolna nawigacja). Element istnieje od początku,
   * więc zwykłe przejście CSS na `--spring` wystarcza; pierwsze ustawienie
   * idzie bez animacji, żeby pigułka nie przyjechała z lewej.
   */
  function positionHighlight(highlight, element, animate) {
    if (!animate) highlight.classList.add('no-anim');
    const rect = highlightRect(element);
    highlight.style.width = `${rect.w}px`;
    highlight.style.transform = `translateX(${rect.x}px)`;
    if (!animate) {
      void highlight.offsetWidth; // wymuś styl przed włączeniem przejścia
      highlight.classList.remove('no-anim');
    }
  }

  /**
   * Plamka w pasku dni. Pasek jest przerysowywany od zera, więc plamka powstaje
   * w każdej klatce jako **nowy** węzeł i przejście CSS nie miało od czego
   * wystartować — przeglądarka brała styl początkowy (`translateX(0)`,
   * `width: 0`) i kwadrat leciał z lewej krawędzi zamiast z aktualnego kafelka.
   * Dlatego stan końcowy piszemy od razu, a ruch z poprzedniego prostokąta robi
   * Web Animations z jawną klatką startową (`previous`).
   */
  function positionStripHighlight(highlight, selected, previous) {
    const to = highlightRect(selected);
    highlight.style.width = `${to.w}px`;
    highlight.style.transform = `translateX(${to.x}px)`;
    if (previous && (previous.x !== to.x || previous.w !== to.w)) {
      springAnimate(highlight, [
        { transform: `translateX(${previous.x}px)`, width: `${previous.w}px` },
        { transform: `translateX(${to.x}px)`, width: `${to.w}px` },
      ]);
    }
    return to;
  }

  /**
   * Animacja wejścia po zmianie dnia, okresu albo widoku.
   *
   * Każde przejście idzie **tym samym ruchem co dolny pasek**: sprężyna
   * `--spring` (460 ms), ta sama, którą jadą podświetlenia kafelków i dni. Ruch
   * robi `springSlide()` na Web Animations, a nie keyframe z `opacity: .15` —
   * poprzednia wersja migała i wjeżdżała z zawracaniem.
   *
   * Strona jedzie **pełną szerokość**, niezależnie od tego, czy przyszła z gestu,
   * kliknięcia w dzień, czy w zakładkę. Krótszy ruch (24%) zostawiał kopię starej
   * treści nad nową przez całą animację, a po jej końcu ucinał ją skokowo — to
   * były „glitche” przy klikaniu (v15). Pełna szerokość gwarantuje, że kopia
   * zawsze zjeżdża z ekranu, a między nią i nową treścią nie ma pustego tła.
   *
   * `pageEasing()` przycina sprężynę do 1: 5,4% zapasu `--spring` to przy
   * szerokości ekranu ~14 px wyjazdu strony za krawędź i pasek tła na końcu
   * ruchu. Podświetlenia (kilkadziesiąt pikseli) zostają przy `--spring`.
   */
  function applyEnterAnimation(box) {
    const animation = state.enter;
    const offset = state.swipeOffset;
    if (!animation) return;
    state.enter = null;
    const dir = animation.dir > 0 ? 1 : -1;
    const element = animation.target === 'agenda'
      ? box.querySelector('.agenda')
      : box.firstElementChild;
    if (!element) return;

    // Gest dokłada do pełnej szerokości miejsce, w którym puścił palec, żeby
    // treść nie zawracała w połowie ruchu.
    const from = dir > 0
      ? `translateX(calc(${PAGE_DISTANCE}% + ${offset || 0}px))`
      : `translateX(calc(-${PAGE_DISTANCE}% + ${offset || 0}px))`;
    springSlide(element, from, 'translateX(0)', pageEasing());
  }

  /** Czas i krzywa wspólne z dolnym paskiem (`--spring`, 460 ms). */
  const PAGE_MS = 460;
  /** Ile szerokości przejeżdża strona — zawsze cała (`swipeOffset` dokłada resztę). */
  const PAGE_DISTANCE = 100;

  function reducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /** Krzywa sprężyny z CSS (`--spring`) w postaci, którą przyjmie Web Animations. */
  function springEasing() {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--spring').trim();
    return value || 'cubic-bezier(.2, .8, .2, 1)';
  }

  /**
   * Ta sama sprężyna, ale przycięta do 1 i bez cofania — do ruchu całych stron.
   *
   * `linear()` z `--spring` przestrzela o 5,4% (1.0542 w 45,8% czasu). Przy
   * podświetleniu szerokości kafelka to ~3 px, czyli część charakteru ruchu, ale
   * przy przesuwaniu dnia o pełną szerokość dawało ~14 px wyjazdu strony za
   * krawędź i na końcu animacji odsłaniało tło. Przycinamy wartości, a nie
   * podmieniamy krzywą, żeby „feel” (szybki start, łagodne dojście) został ten sam.
   *
   * Bierzemy przy tym maksimum z dotychczasowych wartości: po obcięciu sprężyna
   * wciąż ma ogon 0.9971 (1,2 px cofnięcia na szerokości ekranu), a strona nie
   * może drgnąć w tył, gdy już stanęła.
   */
  function pageEasing() {
    const value = springEasing();
    if (!value.startsWith('linear(') || !value.endsWith(')')) return value;
    let highest = 0;
    let broken = false;
    const stops = value.slice('linear('.length, -1).split(',').map((stop) => {
      const [y, position] = stop.trim().split(/\s+/);
      const progress = Number(y);
      if (!Number.isFinite(progress)) {
        broken = true;
        return null;
      }
      highest = Math.max(highest, Math.min(1, progress));
      return `${highest}${position ? ` ${position}` : ''}`;
    });
    if (broken) return value;
    return `linear(${stops.join(', ')})`;
  }

  /**
   * Sprężynuje element między jawnymi klatkami i zwraca animację (albo `null`,
   * gdy przeglądarka nie umie Web Animations).
   *
   * Dlaczego nie `transition`: świeżo wstawiony węzeł nie ma „poprzedniego”
   * stylu, więc przeglądarka brała styl początkowy i przejście startowało z zera
   * (albo w ogóle nie ruszało). Animacja z jawną klatką początkową działa zawsze.
   */
  function springAnimate(element, keyframes, easing) {
    if (!element) return null;
    if (reducedMotion() || typeof element.animate !== 'function') return null;
    let animation;
    try {
      animation = element.animate(keyframes, {
        duration: PAGE_MS,
        easing: easing || springEasing(),
        fill: 'both',
      });
    } catch (err) {
      return null;
    }
    // `fill: 'both'` trzyma ostatnią klatkę po zakończeniu — zdejmujemy ją, bo
    // stan końcowy jest już zapisany w stylach inline.
    animation.finished.then(() => {
      animation.cancel();
    }).catch(() => undefined);
    return animation;
  }

  function springSlide(element, from, to, easing) {
    const animation = springAnimate(element, [{ transform: from }, { transform: to }], easing);
    // Bez animacji element musi wrócić do stanu z arkusza, a nie zostać
    // w klatce startowej.
    if (!animation && element) element.style.transform = '';
    return animation;
  }

  function emptyMessage(title, body, actionLabel, action) {
    return `<div class="empty-msg">
      <p class="empty-title">${esc(title)}</p>
      <p class="empty-body">${esc(body)}</p>
      ${actionLabel ? `<button type="button" class="text-btn" data-empty-action="${esc(action)}">${esc(actionLabel)}</button>` : ''}
    </div>`;
  }

  function renderLoading() {
    return `<div class="block-center">
      <span class="load-bar"><span></span></span>
      <p class="t-body-medium">Pobieram plan…</p>
    </div>`;
  }

  function renderError() {
    return `<div class="block-center">
      <p class="t-title-medium">Nie udało się pobrać planu</p>
      <p class="t-body-small" style="color:var(--text-soft)">${esc(state.error || '')}</p>
      <button type="button" class="btn-filled" data-empty-action="retry" style="margin-top:12px">Ponów</button>
    </div>`;
  }

  function render() {
    state.today = state.today || todayIso();
    state.nowMinute = new Date().getHours() * 60 + new Date().getMinutes();

    const welcome = $('welcome');
    const app = $('app');
    if (state.needsGroup) {
      welcome.hidden = false;
      app.hidden = true;
      renderWelcome();
      return;
    }
    welcome.hidden = true;
    app.hidden = false;

    renderChrome();

    const box = viewport();
    box.className = `viewport view-${state.view}`;

    let html;
    if (state.loading && !state.slots.length) html = renderLoading();
    else if (state.error && !state.slots.length) html = renderError();
    else if (!state.dates.length) {
      // Plan pobrany poprawnie, ale bez zajęć. Dla starszych roczników to
      // normalne (plan bywa już zamknięty), więc zamiast samego „odśwież”
      // mówimy, co się dzieje, i dajemy skrót do zmiany rocznika.
      html = `<div class="empty-msg">
        <p class="empty-title">Ten plan nie ma zajęć</p>
        <p class="empty-body">Wybrany rocznik lub grupa nie mają zajęć w planie
          uczelni. Na starszych rocznikach to normalne — plan bywa już zamknięty.</p>
        <button type="button" class="text-btn" data-empty-action="pick">Zmień rocznik lub plan</button>
        <button type="button" class="text-btn" data-empty-action="retry"
          style="margin-top:8px">Odśwież</button>
      </div>`;
    } else if (state.view === 'day') html = renderDay();
    else if (state.view === 'week') html = renderWeek();
    else if (state.view === 'month') html = renderMonth();
    else html = renderSemester();

    // Stary widok zostaje na chwilę jako kopia nad nowym — inaczej podmiana HTML
    // zostawiała przez całą animację puste tło po jednej stronie.
    const animation = state.enter;
    const outgoing = takeOutgoingView(box);
    box.innerHTML = html;
    pushOutgoingView(box, outgoing, animation);
    afterRender(box);
    applyEnterAnimation(box);
    // Przesunięcie z gestu dotyczy tylko tego jednego przejścia.
    state.swipeOffset = null;
    markPlanVisible();
  }

  /**
   * Kopia treści, która ma odjechać w bok (`AnimatedContent` w Compose animuje
   * oba elementy: nowy wjeżdża, stary wyjeżdża). Bierzemy ją **przed** podmianą
   * HTML, bo potem starego węzła już nie ma.
   */
  function takeOutgoingView(box) {
    const animation = state.enter;
    if (!animation) return null;
    const isAgenda = animation.target === 'agenda';
    const node = isAgenda ? box.querySelector('.agenda') : box.firstElementChild;
    if (!node) return null;
    const clone = node.cloneNode(true);
    clone.removeAttribute('id');
    // `dragging` ustawia `transition: none !important` — na kopii musi zniknąć,
    // inaczej sprężyna nigdy by nie wystartowała.
    clone.classList.remove('dragging');
    clone.style.transition = '';
    clone.classList.add('view-exit');
    clone.setAttribute('aria-hidden', 'true');
    // Kopia musi stać dokładnie tam, gdzie stała oryginalna treść: agenda jest
    // pod paskiem tygodnia, a nie na górze przewijanego obszaru.
    clone.style.top = `${node.offsetTop}px`;
    // `cloneNode` nie przenosi transformacji z Web Animations — przy szybkim
    // drugim kliknięciu albo geście treść jest w połowie ruchu, więc pozycję
    // bierzemy z animacji oryginału.
    const current = getComputedStyle(node).transform;
    if (current && current !== 'none') clone.style.transform = current;
    return clone;
  }

  function pushOutgoingView(box, clone, animation) {
    if (!clone) return;
    box.appendChild(clone);
    const remove = () => clone.remove();
    // Kopia zjeżdża w przeciwną stronę niż wjeżdżająca treść — zawsze o pełną
    // szerokość, więc po animacji jest poza ekranem i można ją usunąć.
    const dir = animation.dir > 0 ? 1 : -1;
    const current = getComputedStyle(clone).transform;
    const slide = springSlide(
      clone,
      current === 'none' ? 'translateX(0px)' : current,
      `translateX(${dir > 0 ? '-' : ''}${PAGE_DISTANCE}%)`,
      pageEasing(),
    );
    if (slide) {
      slide.finished.then(remove).catch(remove);
    } else {
      remove();
    }
    // Zapasowy timer: w karcie w tle przeglądarka może nie dowieźć `finished`.
    window.setTimeout(remove, PAGE_MS + 260);
  }

  /**
   * Znacznik dla pomiarów startu: pierwsza klatka z planem w DOM.
   * `performance.getEntriesByName('plan-visible')[0].startTime` to czas od
   * początku nawigacji do pokazania zajęć — tyle trwa „klik w ikonę”.
   */
  function markPlanVisible() {
    if (state.planMarked || !state.slots.length) return;
    state.planMarked = true;
    if (!window.performance || !performance.mark) return;
    requestAnimationFrame(() => {
      try { performance.mark('plan-visible'); } catch (err) { /* starsze silniki */ }
    });
  }

  function afterRender(box) {
    // Nazwy przedmiotów dopasowujemy po każdym rysowaniu (APK 1.11) —
    // `fitSubjects` robi jeden układ na widok, więc nie spowalnia startu.
    fitSubjects(box);
    // Notatki mierzymy w tym samym układzie, żeby nie robić drugiego.
    fitNotes(box);

    if (state.view === 'day') {
      // Pasek tygodnia ma to samo przesuwane podświetlenie co dolne kafelki,
      // ale jest przerysowywany od zera — dlatego plamka dostaje jawną klatkę
      // startową z poprzedniego prostokąta (`positionStripHighlight`).
      const highlight = box.querySelector('.strip-highlight');
      const selected = box.querySelector('.strip-day.is-selected');
      const firstCell = box.querySelector('.strip-day');
      if (highlight && selected && firstCell) {
        const week = firstCell.dataset.selectDate;
        const previous = state.stripHighlight && state.stripWeek === week
          ? state.stripHighlight
          : null;
        state.stripHighlight = positionStripHighlight(highlight, selected, previous);
        state.stripWeek = week;
        state.stripReady = true;
      }
      // Materiały widocznego dnia dociągamy w tle, zanim ktoś w nie kliknie.
      const day = activeDay();
      prefetchMaterials(day ? (state.byDate[day] || []) : []);
    }
    if (state.view === 'week') {
      const scroll = box.querySelector('.week-scroll');
      if (scroll) {
        const target = state.weekScrollX;
        scroll.scrollLeft = typeof target === 'number' ? target : 0;
        scroll.scrollTop = state.weekScrollY || 0;
        scroll.addEventListener('scroll', () => {
          state.weekScrollX = scroll.scrollLeft;
          state.weekScrollY = scroll.scrollTop;
        }, { passive: true });
      }
    }
    if (state.view === 'semester') {
      const scroller = box;
      scroller.scrollTop = state.semesterScrollY || 0;
      scroller.addEventListener('scroll', () => {
        state.semesterScrollY = scroller.scrollTop;
      }, { passive: true });
    }
    rememberOngoing();
  }

  function rememberOngoing() {
    const ids = state.slots
      .filter((slot) => slot.date === state.today && isOngoing(slot))
      .map((slot) => slot.id)
      .join('|');
    state.ongoingKey = ids;
  }

  function isOngoing(slot) {
    if (slot.date !== state.today) return false;
    return state.nowMinute >= slot.startMinutes && state.nowMinute < slot.endMinutes;
  }

  // --- widok Dnia ----------------------------------------------------------

  function renderDay() {
    const active = activeDay();
    if (!active) return emptyMessage('Brak zajęć w planie', 'Odśwież plan albo sprawdź inną grupę.');
    const classes = state.byDate[active] || [];

    return `<div class="day-view">
      ${renderWeekStrip(active)}
      <div class="agenda">${renderAgenda(active, classes)}</div>
    </div>`;
  }

  function renderWeekStrip(active) {
    const weekDates = ScheduleViews.weekDates(active);
    const cells = weekDates.map((iso) => {
      const classes = state.byDate[iso] || [];
      const selected = iso === active;
      const today = iso === state.today;
      const cls = selected ? ' is-selected' : (today ? ' is-today' : '');
      const dots = classes.slice(0, 3).map((slot) => dot(slot.subject, 4)).join('');
      return `<button type="button" class="strip-day${cls}" data-select-date="${iso}"
        aria-label="${esc(Format.dayLong(iso))}" ${selected ? 'aria-current="date"' : ''}>
        <span class="strip-weekday">${esc(Format.weekdayShort(iso))}</span>
        <span class="strip-date">${parseIso(iso).getDate()}</span>
        <span class="strip-dots">${dots}</span>
      </button>`;
    }).join('');

    return `<div class="week-strip">
      <button type="button" class="strip-arrow" data-strip-shift="-7" aria-label="Poprzedni tydzień">‹</button>
      <div class="strip-bar" id="stripBar">
        <span class="strip-highlight" aria-hidden="true"></span>
        ${cells}
      </div>
      <button type="button" class="strip-arrow" data-strip-shift="7" aria-label="Następny tydzień">›</button>
    </div>`;
  }

  function renderAgenda(date, classes) {
    const remote = classes.filter((slot) => slot.remote).length;
    const headCount = classes.length
      ? `<div class="agenda-summary">
          <span class="agenda-count">${esc(Format.classesCount(classes.length))}</span>
          <span class="agenda-meta">${esc(Format.minutesLabel(ScheduleViews.totalMinutes(classes)))}${
  remote > 0 ? ` · ${remote} zdal.` : ''}</span>
        </div>`
      : '';

    const head = `<div class="agenda-head">
      <div class="agenda-head-main">
        <span class="agenda-weekday">${esc(Format.weekdayFull(date))}</span>
        <span class="agenda-date">${esc([Format.dateWithYear(date), Format.relativeDay(date, state.today)].filter(Boolean).join(' · '))}</span>
      </div>
      ${headCount}
    </div>`;

    if (!classes.length) {
      const prev = ScheduleViews.neighborDate(state.dates, date, false);
      const next = ScheduleViews.neighborDate(state.dates, date, true);
      const target = next || prev;
      const label = next ? `Najbliższe: ${Format.dayLong(next)}` : (prev ? `Ostatnie: ${Format.dayLong(prev)}` : null);
      return `${head}${emptyMessage('Brak zajęć w tym dniu',
    'Przesuń palcem w bok albo przejdź do najbliższych zajęć.',
    label, target ? `select:${target}` : null)}`;
    }

    const cards = classes.map((slot) => renderClassCard(slot)).join('');
    const prev = ScheduleViews.neighborDate(state.dates, date, false);
    const next = ScheduleViews.neighborDate(state.dates, date, true);
    const jump = `<div class="agenda-jump">
      ${prev ? `<button type="button" class="text-btn" data-select-date="${prev}">‹ ${esc(Format.dayTitle(prev))}</button>` : '<span></span>'}
      ${next ? `<button type="button" class="text-btn" data-select-date="${next}">${esc(Format.dayTitle(next))} ›</button>` : ''}
    </div>`;

    return `${head}${cards}${jump}`;
  }

  /**
   * Karta zajęć w widoku dnia (APK 1.11).
   *
   * Trwające zajęcia zaznacza **cienki obrys** w kolorze akcentu i ledwo widoczne
   * podbarwienie środka, a status „teraz” stoi na początku linii metadanych —
   * wcześniej był osobną plakietką po prawej, przez co karta była wyższa.
   * Plakietka „dziś” zniknęła: dzień jest w nagłówku agendy.
   *
   * Nazwa przedmiotu zawsze mieści się w jednej linii — `fitSubjects()` zmniejsza
   * czcionkę (16 → 10 px), zamiast łamać nazwę na dwie linie.
   */
  /**
   * Plakietka notatki na kafelku („Kolos”, „Egzamin”).
   *
   * Kolor bierze się z motywu (`--accent` na `--accent-on`), więc notatka jest
   * widoczna w każdym z 20 motywów — jasnych i ciemnych. Plakietka jest
   * **elementem układu** karty, nie nakładką: nazwa przedmiotu zwęża się tylko
   * o tyle, ile naprawdę zajmuje tekst, a szerokość jest ograniczona do 35%
   * karty (`max-width` w arkuszu). Rozmiar tekstu dopasowuje `fitNotes()`.
   */
  function noteBadge(slot) {
    const text = state.notes.get(slot.id);
    if (!text) return '';
    return `<span class="note-badge">
      <span class="note-badge-text">${esc(text)}</span>
    </span>`;
  }

  function renderClassCard(slot) {
    const ongoing = isOngoing(slot);
    const meta = [
      ongoing ? 'teraz' : null,
      slot.room,
      slot.form,
      Format.modeLabel(slot.mode),
    ].filter(Boolean).join(' · ');
    const mark = state.attachmentIds.has(slot.id) ? attachmentMark(16) : '';
    const badge = noteBadge(slot);
    return `<button type="button" class="class-card${ongoing ? ' is-ongoing' : ''}${badge ? ' has-note' : ''}" data-class-id="${esc(slot.id)}">
      <span class="class-time">
        <span class="class-time-start">${esc(Format.clock(slot.startMinutes))}</span>
        <span class="class-time-end">${esc(Format.clock(slot.endMinutes))}</span>
      </span>
      <span class="class-bar" style="background:${subjectColor(slot.subject)}"></span>
      <span class="class-main">
        <span class="class-subject" title="${esc(slot.subject)}">${esc(slot.subject)}</span>
        ${meta ? `<span class="class-meta${ongoing ? ' is-ongoing' : ''}">${esc(meta)}</span>` : ''}
      </span>
      ${mark}
      ${badge}
    </button>`;
  }

  /**
   * Dopasowanie nazwy przedmiotu do jednej linii — port `TextAutoSize.StepBased`
   * z APK 1.11. CSS nie umie zmniejszyć czcionki „do szerokości”, więc mierzymy
   * `scrollWidth` i liczymy rozmiar z proporcji (tekst skaluje się liniowo),
   * a potem schodzimy co 0,5 px, jeśli po zaokrągleniu jeszcze nie mieści się.
   *
   * Najpierw ustawiamy wszystkie rozmiary, potem czytamy szerokości — dzięki
   * temu przeglądarka robi jeden układ na widok, a nie jeden na kartę.
   *
   * Nominały z APK (16 → 10 sp w karcie, 14 → 9 sp w wierszu) mnożymy przez
   * skalę czcionki `--fs`: bez tego dopasowanie nadpisałoby pomniejszony CSS
   * i krótkie nazwy byłyby większe od reszty tekstu.
   */
  const SUBJECT_FIT = {
    card: { max: 16, min: 10 },
    row: { max: 14, min: 9 },
  };

  /** Skala czcionki z `--fs` (native.css) — jedno źródło prawdy dla CSS i JS. */
  function textScale() {
    const value = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--fs'),
    );
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function fitSubjects(root) {
    const scale = textScale();
    const fitFor = (kind) => ({
      max: SUBJECT_FIT[kind].max * scale,
      min: SUBJECT_FIT[kind].min * scale,
    });
    const targets = [
      ...Array.from(root.querySelectorAll('.class-card .class-subject'))
        .map((element) => ({ element, fit: fitFor('card') })),
      ...Array.from(root.querySelectorAll('.class-row .class-subject'))
        .map((element) => ({ element, fit: fitFor('row') })),
    ];
    if (!targets.length) return;

    targets.forEach(({ element, fit }) => {
      element.style.fontSize = `${fit.max}px`;
    });

    const metrics = targets.map(({ element, fit }) => ({
      element,
      fit,
      available: element.clientWidth,
      needed: element.scrollWidth,
    }));

    metrics.forEach(({
      element, fit, available, needed,
    }) => {
      if (!available || needed <= available) return;
      const scaled = (fit.max * available) / needed;
      const size = Math.max(fit.min, Math.floor(scaled / 0.5) * 0.5);
      element.style.fontSize = `${size}px`;
    });

    // Kontrola po zapisie: przy bardzo długich nazwach schodzimy do granicy,
    // a potem zostaje wielokropek — dokładnie jak `TextOverflow.Ellipsis`.
    metrics.forEach(({ element, fit, available }) => {
      if (!available || element.scrollWidth <= available) return;
      let size = parseFloat(element.style.fontSize) || fit.max;
      while (size > fit.min && element.scrollWidth > available) {
        size = Math.max(fit.min, size - 0.5);
        element.style.fontSize = `${size}px`;
      }
    });
  }

  /**
   * Dopasowanie tekstu notatki do plakietki — port `TextAutoSize.StepBased`
   * z APK 1.12. Startujemy z 20 px i schodzimy co 0,5 px (do 9 px), aż cała
   * notatka zmieści się w jednej linii; przy 15 znakach zostaje wielokropek.
   * Skala czcionki `--fs` obowiązuje tak samo jak przy nazwach przedmiotów.
   */
  const NOTE_FIT = { max: 20, min: 9 };

  /**
   * Ścięcie lewego brzegu plakietki: 60% jej wysokości, nie więcej niż 44 px.
   * Kąt liczymy z wysokości karty, bo CSS nie zna jej w `clip-path` (procenty
   * w `polygon()` odnoszą się do szerokości, więc szeroka notatka miałaby
   * zupełnie inny skos niż krótka).
   */
  const NOTE_SLANT = 0.6;
  const NOTE_SLANT_MAX = 44;

  function fitNotes(root) {
    const scale = textScale();
    const max = NOTE_FIT.max * scale;
    const min = NOTE_FIT.min * scale;
    const targets = Array.from(root.querySelectorAll('.note-badge-text'));
    if (!targets.length) return;

    // Najpierw kształt: padding zależy od ścięcia, a dopiero potem mierzymy
    // tekst (inaczej pierwszy pomiar wypadłby dla złej szerokości plakietki).
    Array.from(root.querySelectorAll('.note-badge')).forEach((badge) => {
      const height = badge.getBoundingClientRect().height;
      if (!height) return;
      const slant = Math.min(
        Math.round(height * NOTE_SLANT),
        Math.round(NOTE_SLANT_MAX * scale),
      );
      badge.style.setProperty('--note-slant', `${slant}px`);
      badge.style.setProperty('--note-pad', `${Math.round(slant / 2) + 12}px`);
    });

    targets.forEach((element) => { element.style.fontSize = `${max}px`; });
    const metrics = targets.map((element) => ({
      element,
      available: element.clientWidth,
      needed: element.scrollWidth,
    }));

    metrics.forEach(({ element, available, needed }) => {
      if (!available || needed <= available) return;
      const scaled = (max * available) / needed;
      element.style.fontSize = `${Math.max(min, Math.floor(scaled / 0.5) * 0.5)}px`;
    });

    metrics.forEach(({ element, available }) => {
      if (!available || element.scrollWidth <= available) return;
      let size = parseFloat(element.style.fontSize) || max;
      while (size > min && element.scrollWidth > available) {
        size = Math.max(min, size - 0.5);
        element.style.fontSize = `${size}px`;
      }
    });
  }

  // --- widok Tygodnia ------------------------------------------------------

  function renderWeek() {
    const anchor = state.weekAnchor || ScheduleViews.weekStart(anchorDay());
    state.weekAnchor = ScheduleViews.weekStart(anchor);
    const weekDates = state.weekDatesCache = ScheduleViews.weekDates(state.weekAnchor);
    const allClasses = weekDates.flatMap((iso) => state.byDate[iso] || []);
    const hours = ScheduleViews.hourBounds(allClasses);
    const hourCount = hours.last - hours.first + 1;
    const totalHeight = HOUR_HEIGHT * hourCount;

    const nav = `<div class="period-nav">
      <button type="button" class="period-arrow" data-week-shift="-7" aria-label="Poprzedni tydzień">‹</button>
      <div class="period-center">
        <span class="period-title">${esc(Format.dateRange(weekDates[0], weekDates[6]))}</span>
        <span class="period-sub">${esc(Format.classesCount(allClasses.length))}</span>
      </div>
      <button type="button" class="period-today" data-week-today>Dziś</button>
      <button type="button" class="period-arrow" data-week-shift="7" aria-label="Następny tydzień">›</button>
    </div>`;

    if (!allClasses.length) {
      return `<div class="week-view">${nav}
        ${emptyMessage('Brak zajęć w tym tygodniu', 'Przejdź do innego tygodnia albo sprawdź widok „Miesiąc”.')}
      </div>`;
    }

    const firstClassIndex = weekDates.findIndex((iso) => (state.byDate[iso] || []).length > 0);
    if (typeof state.weekScrollX !== 'number' || state.weekAnchorChanged) {
      state.weekScrollX = DAY_WIDTH * Math.max(0, firstClassIndex - 1);
      state.weekAnchorChanged = false;
    }

    const head = `<div class="week-head">
      <div class="week-head-spacer"></div>
      ${weekDates.map((iso) => `<div class="week-head-day">
        <span class="week-head-weekday">${esc(Format.weekdayShort(iso))}</span>
        <span class="week-head-date${iso === state.today ? ' is-today' : ''}">${esc(Format.dateShort(iso))}</span>
      </div>`).join('')}
    </div>`;

    const hourLabels = Array.from({ length: hourCount }, (_, i) => (
      `<span class="hour-label" style="top:${i * HOUR_HEIGHT}px">${pad2(hours.first + i)}:00</span>`
    )).join('');

    const dayColumns = weekDates.map((iso) => {
      const blocks = ScheduleViews.timetable(state.byDate[iso] || []);
      const lines = Array.from({ length: hourCount }, (_, i) => (
        `<span class="week-hour-line" style="top:${i * HOUR_HEIGHT}px"></span>`
      )).join('');
      const items = blocks.map((block) => {
        const top = ((block.startMinute - hours.first * 60) / 60) * HOUR_HEIGHT;
        const height = Math.max(26, ((block.endMinute - block.startMinute) / 60) * HOUR_HEIGHT);
        const columnWidth = DAY_WIDTH / block.columns;
        const accent = subjectColor(block.slot.subject);
        return `<button type="button" class="week-block" data-class-id="${esc(block.slot.id)}"
          style="top:${top.toFixed(1)}px;left:${(columnWidth * block.column + 2).toFixed(1)}px;
                 width:${(columnWidth - 4).toFixed(1)}px;height:${height.toFixed(1)}px;
                 border-color:${accent}cc">
          <span class="week-block-time">${esc(Format.clock(block.slot.startMinutes))}</span>
          <span class="week-block-subject">${esc(block.slot.subject)}</span>
        </button>`;
      }).join('');
      const weekend = dayOfWeek(iso) >= 6;
      return `<div class="week-day${weekend ? ' is-weekend' : ''}" style="height:${totalHeight}px">
        ${lines}${items}
      </div>`;
    }).join('');

    return `<div class="week-view">
      ${nav}
      <div class="week-scroll">
        <div class="week-canvas" style="width:${44 + 7 * DAY_WIDTH}px">
          ${head}
          <div class="week-body">
            <div class="hour-labels" style="height:${totalHeight}px">${hourLabels}</div>
            ${dayColumns}
          </div>
        </div>
      </div>
    </div>`;
  }

  // --- widok Miesiąca ------------------------------------------------------

  function renderMonth() {
    const monthKey = state.monthKey || ScheduleViews.monthOf(anchorDay());
    state.monthKey = monthKey;

    // Podświetlony dzień to ten sam dzień-kotwica, który pokazuje widok dnia
    // (a nie „pierwszy dzień z zajęciami w miesiącu”).
    const anchor = anchorDay();
    const activeDate = (state.selectedDate && state.selectedDate.slice(0, 7) === monthKey)
      ? state.selectedDate
      : (anchor && anchor.slice(0, 7) === monthKey
        ? anchor
        : (ScheduleViews.daysInMonth(state.dates, monthKey)[0] || null));
    const dayClasses = activeDate ? (state.byDate[activeDate] || []) : [];
    const monthClasses = ScheduleViews.daysInMonth(state.dates, monthKey)
      .reduce((sum, iso) => sum + (state.byDate[iso] || []).length, 0);

    const nav = `<div class="month-nav">
      <button type="button" class="period-arrow" data-month-shift="-1" aria-label="Poprzedni miesiąc">‹</button>
      <div class="period-center">
        <span class="period-title">${esc(Format.monthLabel(monthKey))}</span>
        <span class="period-sub">${monthClasses > 0 ? esc(Format.classesCount(monthClasses)) : 'brak zajęć'}</span>
      </div>
      <button type="button" class="period-today" data-month-today>Dziś</button>
      <button type="button" class="period-arrow" data-month-shift="1" aria-label="Następny miesiąc">›</button>
    </div>`;

    let list;
    if (!activeDate) {
      list = emptyMessage('Brak zajęć w tym miesiącu', 'Przejdź do innego miesiąca albo odśwież plan.');
    } else {
      const remote = dayClasses.filter((slot) => slot.remote).length;
      const onsite = dayClasses.length - remote;
      const countText = Format.classesCount(dayClasses.length)
        + (onsite > 0 ? ` · stacj. ${onsite}` : '')
        + (remote > 0 ? ` · zdal. ${remote}` : '');
      list = `<div class="day-head">
          <span class="day-head-title">${esc(Format.dayTitle(activeDate))}</span>
          <span class="day-head-count">${esc(countText)}</span>
        </div>`
        + (dayClasses.length
          ? dayClasses.map(renderClassRow).join('')
          : emptyMessage('Brak zajęć w tym dniu', 'Wybierz inny dzień w kalendarzu.'));
    }

    return `<div class="month-view">
      ${nav}
      <div class="month-grid">${renderMonthGrid(monthKey, activeDate, true)}</div>
      <div class="month-list">${list}</div>
    </div>`;
  }

  function renderMonthGrid(monthKey, selected, interactive) {
    const weekdayRow = WEEKDAYS.map((label) => `<span>${esc(label)}</span>`).join('');
    const weeks = ScheduleViews.monthWeeks(monthKey).map((week) => {
      const cells = week.map((iso) => {
        if (!iso) return '<div class="day-cell-wrap"></div>';
        const classes = state.byDate[iso] || [];
        const isSelected = iso === selected;
        const isToday = iso === state.today;
        const cls = `day-cell${classes.length ? ' has-classes' : ''}${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`;
        const dots = classes.slice(0, 3).map((slot) => dot(slot.subject, 5)).join('');
        const attrs = interactive
          ? `data-select-date="${iso}" aria-label="${esc(Format.dayLong(iso))}" type="button"`
          : 'type="button" disabled';
        return `<div class="day-cell-wrap"><button class="${cls}" ${attrs}>
          <span class="day-cell-date">${parseIso(iso).getDate()}</span>
          <span class="day-cell-dots">${dots}</span>
        </button></div>`;
      }).join('');
      return `<div class="month-week">${cells}</div>`;
    }).join('');

    return `<div class="month-grid-weekdays">${weekdayRow}</div>
      <div class="month-grid-spacer"></div>
      ${weeks}`;
  }

  function renderClassRow(slot) {
    const meta = [Format.clock(slot.endMinutes), slot.form, slot.lecturer].filter(Boolean).join(' · ');
    const room = slot.remote ? 'ZDALNE' : (slot.room || '—');
    // Spinacz jak w `CompactClassRow` z APK 1.9 — mniejszy niż na karcie dnia.
    const mark = state.attachmentIds.has(slot.id) ? attachmentMark(14) : '';
    return `<button type="button" class="class-row" data-class-id="${esc(slot.id)}">
      <span class="class-time">
        <span class="class-time-start">${esc(Format.clock(slot.startMinutes))}</span>
      </span>
      <span class="class-bar" style="background:${subjectColor(slot.subject)}"></span>
      <span class="class-main">
        <span class="class-subject" title="${esc(slot.subject)}">${esc(slot.subject)}</span>
        ${meta ? `<span class="class-meta">${esc(meta)}</span>` : ''}
      </span>
      <span class="class-room${slot.remote ? ' is-remote' : ''}">${esc(room)}</span>
      ${mark}
    </button>`;
  }

  // --- widok Semestru ------------------------------------------------------

  function renderSemester() {
    const months = ScheduleViews.months(state.dates);
    if (!months.length) {
      return `<div class="semester">${emptyMessage('Brak zajęć w semestrze', 'Odśwież plan albo wybierz inną grupę.')}</div>`;
    }
    const cards = months.map((monthKey) => {
      const count = ScheduleViews.daysInMonth(state.dates, monthKey)
        .reduce((sum, iso) => sum + (state.byDate[iso] || []).length, 0);
      return `<section class="semester-card" data-month="${monthKey}">
        <div class="semester-card-head">
          <span class="semester-month">${esc(Format.monthLabel(monthKey))}</span>
          <span class="semester-count">${count > 0 ? esc(Format.classesCount(count)) : 'brak zajęć'}</span>
        </div>
        <div class="month-grid">${renderMonthGrid(monthKey, null, true)}</div>
      </section>`;
    }).join('');
    return `<div class="semester">${cards}</div>`;
  }

  // --- ekran powitalny -----------------------------------------------------
  //
  // Wybór planu jest tu **jeden, malejący**: na starcie widać tylko rocznik,
  // a każdy kolejny krok pojawia się pod nim po wybraniu poprzedniego
  // (`pickerHtml`). Plan wczytuje się sam, gdy wybór jest kompletny.

  function renderWelcome() {
    paintPicker($('welcomePicker'));
    // Wydział jest stały — pokazujemy go jedną cichą linią pod tytułem.
    const faculty = $('welcomeFaculty');
    if (faculty) faculty.textContent = facultyLabel();
    // Ręczny numer grupy jest schowany, dopóki ktoś go nie potrzebuje —
    // ekran powitalny ma pokazywać wybór, a nie alternatywne wejście.
    const manual = $('welcomeManual');
    const go = $('welcomeManualGo');
    if (manual && go) {
      const digits = manual.value.replace(/\D/g, '');
      go.disabled = digits.length < 2 || digits.length > 8;
    }
    if (!$('welcome').hidden) ensurePickerData();
  }

  /**
   * Lista kierunków/roczników jest wspólna dla ekranu powitalnego i dla
   * Opcji → Wybór planu, więc dociąga ją to miejsce, a nie tylko powitanie.
   * Wcześniej użytkownik z zapisanym planem (powitania nie widzi) otwierał
   * krok „Rocznik” i dostawał „katalog nie ma roczników” bez wyjścia.
   * `loading` i `error` chronią przed pętlą pobrań — błąd pokazuje „Ponów”.
   */
  function ensurePickerData() {
    if (state.wizard.kierunki.length || state.wizard.loading || state.wizard.error) return;
    const steps = visibleSteps();
    if (steps.includes('nabor') || steps.includes('kierunek')) wizLoadKierunki();
  }

  // ---------------------------------------------------------- 9. Arkusze

  // Fokus w arkuszach i dialogach. `aria-modal` niczego nie wymusza, więc
  // klawiatura chodziła po stronie pod spodem, a po zamknięciu okna fokus
  // wracał na początek dokumentu. Teraz: fokus wchodzi do środka, Tab krąży
  // w obrębie okna, tło jest `inert`, a po zamknięciu fokus wraca tam, gdzie był.
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), '
    + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const focusReturn = { sheet: null, dialog: null };

  function focusablesIn(root) {
    return [...root.querySelectorAll(FOCUSABLE)]
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  /** Tło pod oknem nie łapie fokusu ani kliknięć (scrim tylko zasłania). */
  function setBackgroundInert(inert) {
    for (const id of ['app', 'welcome']) {
      const node = $(id);
      if (node) node.inert = inert;
    }
  }

  function restoreFocus(key) {
    const node = focusReturn[key];
    focusReturn[key] = null;
    if (node && node.isConnected && typeof node.focus === 'function') {
      node.focus({ preventScroll: true });
    }
  }

  /** Tab / Shift+Tab krąży w obrębie otwartego okna. */
  function trapFocus(root, event) {
    const items = focusablesIn(root);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!root.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * Otwarcie okna: zapamiętanie fokusu, pokazanie warstwy, fokus w środku
   * i zablokowanie tła.
   *
   * Wszystkie ścieżki (arkusz, Opcje, dialog potwierdzenia, instrukcja
   * instalacji, zgłoszenie) przechodzą tędy — wcześniej każda ustawiała
   * `hidden` po swojemu i tylko część przenosiła fokus, więc klawiatura
   * zostawała na stronie pod spodem.
   */
  function enterOverlay(kind) {
    const layer = kind === 'sheet' ? $('sheet') : $('dialog');
    if (layer.hidden) focusReturn[kind] = document.activeElement;
    layer.hidden = false;
    $(kind === 'sheet' ? 'sheetScrim' : 'dialogScrim').hidden = false;
    setBackgroundInert(true);
    // Pierwszy przycisk/pole, a gdy takiego nie ma — samo okno (tabindex="-1").
    const target = focusablesIn(layer)[0] || layer;
    target.focus({ preventScroll: true });
  }

  function openSheet(html) {
    $('sheetBody').innerHTML = html;
    $('sheetBody').scrollTop = 0;
    state.sheetKind = null;
    enterOverlay('sheet');
  }

  function closeSheet() {
    // „Co nowego” zapamiętujemy przy każdym zamknięciu (scrim, Escape, przycisk),
    // tak jak `onDismiss` → `markWhatsNewSeen()` w arkuszu natywnym.
    if (state.sheetKind === 'whats-new') markWhatsNewSeen();
    // Wyjście z Opcji w połowie wyboru nie może zostawić wyboru niezgodnego
    // z planem (karta „Plan” kłamałaby, a „Dodaj grupy” filtrowało zły rocznik).
    if (state.sheetKind === 'settings') restoreAppliedSelection();
    $('sheet').hidden = true;
    $('sheetScrim').hidden = true;
    $('sheetBody').innerHTML = '';
    state.sheetKind = null;
    // Tło wraca dopiero, gdy pod spodem nie ma już dialogu.
    if ($('dialog').hidden) setBackgroundInert(false);
    restoreFocus('sheet');
    // Instrukcja instalacji czekała na zamknięcie tego arkusza (pierwsze wejście).
    flushPendingInstallGuide();
  }

  /**
   * Zapisuje wybór, który opisuje wczytany plan — punkt odniesienia dla szkicu
   * w pickerze (`restoreAppliedSelection`). Wołane tylko tam, gdzie plan i wybór
   * są już zgodne: przy wejściu z adresu/pamięci, po korekcie z katalogu
   * i przy zmianie planu.
   */
  function markAppliedSelection() {
    state.wizard.applied = { sel: { ...state.sel }, site: { ...state.site } };
  }

  /**
   * Przywraca wybór, który opisuje wczytany plan.
   *
   * Kroki pickera zmieniają `state.sel` natychmiast (tak działa podgląd kroków),
   * ale plan zmienia się dopiero po wybraniu grupy — `selectPlan` zapisuje then
   * `state.wizard.applied`. Zamknięcie arkusza bez wybrania planu cofa więc
   * szkic, żeby podpisy i filtry grup opisywały to, co naprawdę widać.
   */
  function restoreAppliedSelection() {
    const applied = state.wizard.applied;
    if (!applied) return;
    const same = (a, b) => {
      const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
      for (const key of keys) if ((a || {})[key] !== (b || {})[key]) return false;
      return true;
    };
    if (same(applied.sel, state.sel) && same(applied.site, state.site)) return;
    state.sel = { ...applied.sel };
    state.site = { ...applied.site };
    writePrefs({ sel: state.sel, site: state.site });
  }

  // ------------------------------- 9b. Panel ustawień (APK 1.7, rozszerzony 1.9)

  /**
   * Panel ustawień ma **dwa poziomy**, jak w natywnej aplikacji: spis treści
   * („Ustawienia”) i cztery strony tematyczne. Wcześniej był jednym długim
   * arkuszem, w którym etykiety z wartościami rozstrzelone na całą szerokość,
   * akapity, przełączniki i przyciski miały tę samą rangę — nie dało się w nim
   * niczego znaleźć. Osobne arkusze „Grupa” i „Styl” zniknęły, żeby ustawienia
   * miały jedno miejsce (`SettingsPage` i `SettingsSheet` w APK).
   */
  const SETTINGS_PAGES = ['root', 'plan', 'look', 'updates', 'android', 'group', 'feedback'];

  const settingsCard = (html) => `<div class="settings-card">${html}</div>`;
  const settingsDivider = () => '<div class="settings-divider" role="presentation"></div>';

  /** Podsumowania wierszy spisu treści — port `SettingsSummary` z APK. */
  const SettingsSummary = {
    /** np. „Ćw (gr. 2) · aktualne” albo „Ćw (gr. 2) · offline, dane z pamięci”. */
    plan(groupLabel, savedAt, now, offline) {
      let freshness;
      if (offline) freshness = 'offline, dane z pamięci';
      else if (!savedAt || savedAt <= 0) freshness = 'brak danych';
      else if (Format.stale(savedAt, now)) freshness = 'dane starsze niż doba';
      else freshness = 'aktualne';
      return [groupLabel, freshness].filter(Boolean).join(' · ');
    },
    /** np. „v8 · najnowsza” albo „v8 · dostępna nowa wersja”. */
    updates(versionLabel, available) {
      return available
        ? `${versionLabel} · dostępna nowa wersja`
        : `${versionLabel} · najnowsza`;
    },
  };

  /** Wiersz nawigacyjny spisu treści: ikona w kaflu, tytuł, stan i strzałka. */
  function settingsNavRow({ icon, title, summary, page, accent, attr }) {
    const target = attr || `data-settings-page="${page}"`;
    return `<button type="button" class="settings-nav" ${target}>
      <span class="settings-nav-icon" aria-hidden="true"><svg><use href="#${icon}"/></svg></span>
      <span class="settings-nav-text">
        <span class="settings-nav-title">${esc(title)}</span>
        <span class="settings-nav-summary${accent ? ' is-accent' : ''}">${esc(summary)}</span>
      </span>
      <span class="settings-chevron" aria-hidden="true">›</span>
    </button>`;
  }

  /** Nagłówek strony z okrągłym „wstecz” — powrót do spisu treści. */
  function settingsPageHeader({ title, subtitle, back }) {
    return `<div class="settings-head">
      ${back ? `<button type="button" class="settings-back" data-settings-page="root" aria-label="Wstecz">
        <svg aria-hidden="true" focusable="false"><use href="#i-back"/></svg>
      </button>` : ''}
      <span class="settings-head-text">
        <span class="settings-head-title" id="sheetTitle">${esc(title)}</span>
        ${subtitle ? `<span class="settings-head-sub">${esc(subtitle)}</span>` : ''}
      </span>
    </div>`;
  }

  /** Wiersz „co / jaka wartość” — bez akcji, tylko odczyt. */
  function settingsInfoRow(title, value, hint) {
    return `<div class="settings-info">
      <span class="settings-info-line">
        <span class="settings-info-title">${esc(title)}</span>
        <span class="settings-info-value">${esc(value)}</span>
      </span>
      ${hint ? `<span class="settings-info-hint">${esc(hint)}</span>` : ''}
    </div>`;
  }

  /**
   * Wiersz akcji: tytuł + wyjaśnienie. `page` prowadzi na inną stronę panelu,
   * `attr` pozwala podpiąć dowolną akcję (np. otwarcie arkusza dodawania grup).
   */
  function settingsActionRow({ title, supporting, page, attr }) {
    const target = attr || `data-settings-page="${page}"`;
    return `<button type="button" class="settings-action" ${target}>
      <span class="settings-action-text">
        <span class="settings-action-title">${esc(title)}</span>
        ${supporting ? `<span class="settings-action-sub">${esc(supporting)}</span>` : ''}
      </span>
      <span class="settings-chevron" aria-hidden="true">›</span>
    </button>`;
  }

  /** Przełącznik ustawienia — cały wiersz jest przyciskiem, jak w APK. */
  function settingsSwitchRow({ title, supporting, checked, attr }) {
    return `<button type="button" class="settings-switch" ${attr} role="switch"
        aria-checked="${checked ? 'true' : 'false'}">
      <span class="settings-switch-text">
        <span class="settings-switch-title">${esc(title)}</span>
        <span class="settings-switch-sub">${esc(supporting)}</span>
      </span>
      <span class="switch" aria-hidden="true"></span>
    </button>`;
  }

  function styleLabelOf(styleId) {
    const found = STYLES.find((style) => style.id === normalizeStyle(styleId));
    return (found && found.label) || 'Liquid Glass 2';
  }

  /**
   * Kropka z kolorem akcentu palety — jak `StyleCatalog.palette(...).accent`
   * w wierszu stylu w APK. `auto` bierze paletę systemową, `custom` — wyliczoną
   * z kolorów użytkownika, tak jak podgląd.
   */
  function styleAccentOf(styleId) {
    const pal = paletteOf(styleId);
    return pal ? cssRgb(parseArgb(pal.accent)) : 'transparent';
  }

  /**
   * Edytor motywu „Własny”: dwa kolory, każdy natywnym wybierakiem (na telefonie
   * otwiera systemowy wybór koloru), z podglądem i wartością hex.
   *
   * Kolor zmienia motyw **od razu** (`input`), a zapis i przemalowanie listy
   * stylów idą po zamknięciu wybieraka (`change`) — inaczej lista traciłaby
   * zaznaczenie przy każdym ruchu palca.
   */
  function settingsCustomHtml() {
    const colors = normalizeCustom(state.custom.primary, state.custom.background);
    const active = normalizeStyle(state.styleId) === 'custom';
    const row = (id, labelId, title, sub, value) => `<label class="settings-color" for="${id}">
      <span class="settings-color-text">
        <span class="settings-color-title">${esc(title)}</span>
        <span class="settings-color-sub">${esc(sub)}</span>
      </span>
      <span class="settings-color-hex" id="${labelId}">${esc(value)}</span>
      <span class="settings-color-swatch" aria-hidden="true" style="background:${cssRgb(parseArgb(`FF${value.slice(1)}`))}"></span>
      <input type="color" id="${id}" class="settings-color-input" value="${esc(value)}"
             aria-label="${esc(title)} motywu">
    </label>`;
    return `<p class="settings-group-head">Własny motyw</p>
      ${settingsCard(`${row('customPrimary', 'customPrimaryHex', 'Kolor główny', 'akcent: przyciski, plakietki notatek', colors.primary)}
        ${settingsDivider()}
        ${row('customBackground', 'customBackgroundHex', 'Kolor tła', 'o jego jasności decyduje cały motyw', colors.background)}`)}
      <p class="settings-note">Motyw działa po wybraniu „Własny” z listy powyżej${active ? '' : ' — teraz wybrany jest inny styl'}.
        Jasność motywu wynika z koloru tła, a jasny akcent jest przyciemniany do czytelnego kontrastu.
        Widżety na pulpicie biorą te same dwa kolory.</p>`;
  }

  function settingsLookHtml() {
    const rows = STYLE_GROUPS.map((group) => {
      const entries = STYLES.filter((style) => style.group === group.key);
      if (!entries.length) return '';
      return `<p class="settings-group-head">${esc(group.label)}</p>`
        + settingsCard(entries.map((style, index) => {
          const selected = normalizeStyle(state.styleId) === style.id;
          return `${index > 0 ? settingsDivider() : ''}<button type="button" class="settings-style"
              data-settings-style="${esc(style.id)}" role="radio" aria-checked="${selected ? 'true' : 'false'}">
            <span class="settings-style-text">
              <span class="settings-style-title${selected ? ' is-selected' : ''}">${esc(style.label)}</span>
              <span class="settings-style-sub">${esc(style.hint)}</span>
            </span>
            <span class="settings-swatch" style="background:${styleAccentOf(style.id)}" aria-hidden="true"></span>
            <span class="radio-mark" aria-hidden="true"></span>
          </button>`;
        }).join(''));
    }).join('');
    return `${settingsPageHeader({
    title: 'Wygląd',
    subtitle: 'Ten sam wybór co w natywnej aplikacji — zmiana działa od razu.',
    back: true,
  })}${rows}${settingsCustomHtml()}`;
  }

  /**
   * Nasłuch wybieraków koloru. Arkusz Opcji rysuje się od nowa po każdym
   * wejściu na stronę, więc słuchacze podpinamy przy każdym renderze —
   * delegacja zdarzeń nie obsłuży `input` z `type="color"`.
   */
  function bindCustomColors(root) {
    if (!root) return;
    const fields = [
      { id: 'customPrimary', key: 'primary', label: 'customPrimaryHex' },
      { id: 'customBackground', key: 'background', label: 'customBackgroundHex' },
    ];
    fields.forEach(({ id, key, label }) => {
      const input = root.querySelector(`#${id}`);
      if (!input) return;
      const apply = () => {
        const hex = normalizeCustomHex(input.value);
        if (!hex) return;
        state.custom = normalizeCustom(
          key === 'primary' ? hex : state.custom.primary,
          key === 'background' ? hex : state.custom.background,
        );
        const text = root.querySelector(`#${label}`);
        if (text) text.textContent = state.custom[key];
        // Próbka w wierszu „Własny” musi pokazać nowy akcent od razu.
        const swatch = root.querySelector('[data-settings-style="custom"] .settings-swatch');
        if (swatch) swatch.style.background = cssRgb(parseArgb(paletteOf('custom').accent));
        applyStyle(state.styleId);
      };
      input.addEventListener('input', apply);
      input.addEventListener('change', () => {
        apply();
        writePrefs({
          customPrimary: state.custom.primary,
          customBackground: state.custom.background,
        });
      });
    });
  }

  function settingsRootHtml(now) {
    return `${settingsPageHeader({
    title: 'Ustawienia',
    subtitle: 'Plan, wygląd i aktualizacje aplikacji.',
  })}
      ${settingsCard(settingsNavRow({
    icon: 'i-month',
    title: 'Plan',
    summary: SettingsSummary.plan(groupLabel(), state.savedAt, now, state.offline),
    page: 'plan',
  }))}
      ${settingsCard(settingsNavRow({
    icon: 'i-look',
    title: 'Wygląd',
    summary: styleLabelOf(state.styleId),
    page: 'look',
  }))}
      ${settingsCard(settingsNavRow({
    icon: 'i-updates',
    title: 'Aktualizacje',
    summary: SettingsSummary.updates(APP_VERSION, state.update.available),
    page: 'updates',
    accent: state.update.available,
  }))}
      ${settingsCard(settingsNavRow({
    icon: 'i-install',
    title: 'Zainstaluj aplikację',
    summary: installSummary(),
    attr: 'data-install-guide',
  }))}
      ${settingsCard(settingsNavRow({
    icon: 'i-android',
    title: 'Aplikacja Android',
    summary: apkSummary(),
    page: 'android',
  }))}
      ${settingsCard(settingsNavRow({
    icon: 'i-feedback',
    title: 'Propozycje / błędy',
    summary: 'Zaproponuj nową funkcję albo zgłoś błąd',
    page: 'feedback',
  }))}
      <p class="settings-foot">Aplikacja zawsze otwiera się na dniu. Grupę i styl
        zapamiętujemy w tej przeglądarce, plan pochodzi z harmonogramu uczelni
        (ideis.mati-it.pl).</p>`;
  }

  /** Jednolinijkowy opis wyboru: „Informatyka · 2024/2025 · IAiSC · niestacjonarne”. */
  function selectionSummaryLine() {
    return [
      kierunekLabelOf(),
      state.sel.nabor ? naborLabel(state.sel.nabor) : '',
      specLabelOf(),
      state.sel.mode ? (MODE_LABELS[state.sel.mode] || state.sel.mode) : '',
    ].filter(Boolean).join(' · ');
  }

  function settingsPlanHtml(now) {
    const lastRefresh = state.savedAt > 0
      ? (Format.agoLabel(state.savedAt, now) || 'brak')
      : 'brak';
    const dataState = state.offline
      ? 'offline'
      : (!state.savedAt || state.savedAt <= 0
        ? 'brak'
        : (Format.stale(state.savedAt, now) ? 'starsze niż doba' : 'aktualne'));
    return `${settingsPageHeader({
    title: 'Plan',
    subtitle: 'Co składa się na plan i kiedy był odświeżony.',
    back: true,
  })}
      ${settingsCard(settingsActionRow({
    title: selectionSummaryLine() || 'Nie wybrano planu',
    supporting: 'rocznik → kierunek → specjalność → tryb · dotknij, aby zmienić',
    page: 'group',
  }))}
      ${planGroupsCard()}
      ${settingsCard(`${settingsActionRow({
    title: 'Dodaj grupy do planu',
    supporting: 'ćwiczenia, laboratoria, lektorat — wykłady są wliczone automatycznie',
    attr: 'data-add-plan-open',
  })}${settingsDivider()}${settingsInfoRow('Ostatnie odświeżenie', lastRefresh)}
        ${settingsDivider()}${settingsInfoRow(
    'Stan danych',
    dataState,
    state.offline ? 'Brak sieci — pokazujemy ostatni zapisany plan.' : null,
  )}`)}
      <button type="button" class="btn-tonal settings-refresh" data-plan-refresh
        ${state.refreshing ? 'disabled' : ''}>${state.refreshing ? 'Odświeżam…' : 'Odśwież plan'}</button>
      <p class="settings-note">Plan to suma grup: wykłady wspólne (wliczone automatycznie)
        i Twoje ćwiczenia, laboratoria oraz lektorat. Odświeżanie w tle porównuje odcisk
        treści planu, więc nie pobiera go bez potrzeby.</p>`;
  }

  /** Karta „Grupy w planie”: baza + dodane grupy, z usuwaniem. */
  function planGroupsCard() {
    const rows = state.planGroups.map((id, index) => {
      const group = groupById(id);
      const title = group ? (group.c || group.n || `grupa ${id}`) : `grupa ${id}`;
      const sub = group
        ? (index === 0 ? 'wykład — zajęcia wspólne, wliczone automatycznie' : groupSubtitle(group))
        : 'grupa spoza katalogu';
      return `<div class="plan-group-row">
        <span class="plan-group-text">
          <span class="plan-group-title">${esc(title)}${index === 0 ? ' <span class="plan-base">baza</span>' : ''}</span>
          <span class="plan-group-sub">${esc(sub)}</span>
        </span>
        ${index > 0
    ? `<button type="button" class="text-btn" data-plan-remove="${esc(id)}"
          aria-label="Usuń ${esc(title)} z planu">Usuń</button>`
    : ''}
      </div>`;
    }).join(settingsDivider());
    return `<p class="settings-group-head">Grupy w planie (${state.planGroups.length})</p>
      ${settingsCard(rows || '<p class="materials-hint">Plan nie ma jeszcze grup.</p>')}`;
  }

  function settingsUpdatesHtml(now) {
    const lastCheck = state.update.lastCheck
      ? (Format.agoLabel(state.update.lastCheck, now) || 'przed chwilą')
      : 'jeszcze nie sprawdzano';
    const available = state.update.available;
    const errorClass = state.update.error ? ' is-error' : '';
    return `${settingsPageHeader({
    title: 'Aktualizacje',
    subtitle: 'Wersja aplikacji i sprawdzanie nowej.',
    back: true,
  })}
      ${settingsCard(`${settingsInfoRow('Wersja aplikacji', APP_VERSION)}
        ${settingsDivider()}${settingsInfoRow('Ostatnie sprawdzenie', lastCheck)}
        ${settingsDivider()}${settingsInfoRow(
    'Dostępne wydanie',
    available ? 'nowa wersja pobrana' : 'brak nowszej wersji',
    available ? 'Odświeżenie włączy ją od razu.' : null,
  )}`)}
      <p class="settings-status${errorClass}">${esc(updateStatusText())}</p>
      ${available ? '<button type="button" class="btn-filled settings-refresh" data-update-apply>Odśwież aplikację</button>' : ''}
      <div class="settings-card">
        ${settingsSwitchRow({
    title: 'Sprawdzaj przy uruchomieniu',
    supporting: 'Przy każdym otwarciu aplikacji, bez blokowania startu.',
    checked: state.update.autoCheck,
    attr: 'data-update-toggle',
  })}
      </div>
      <div class="settings-actions-inline">
        <button type="button" class="text-btn" data-update-check
          ${state.update.checking ? 'disabled' : ''}>Sprawdź teraz</button>
      </div>
      <p class="settings-note">Nowa wersja pobiera się w tle i pojawia się po odświeżeniu —
        także wtedy, gdy aplikacja była zamknięta.</p>`;
  }

  /**
   * Podsumowanie kafelka „Aplikacja Android” w spisie treści.
   * Zanim znamy wydanie, nie zmyślamy numeru — mówimy po prostu, co robi kafelek.
   */
  function apkSummary() {
    const info = state.apk.info;
    if (info && info.versionName) {
      return info.sizeBytes
        ? `wersja ${info.versionName} · ${Format.fileSize(info.sizeBytes)}`
        : `wersja ${info.versionName}`;
    }
    if (state.apk.loading) return 'sprawdzam wersję…';
    if (state.apk.published === false) return 'jeszcze nie opublikowano';
    return 'pobierz plik APK';
  }

  /**
   * Strona „Aplikacja Android”: wersja i rozmiar z `/api/app/latest` oraz
   * przycisk pobierania. Adres jest stały (`/api/app/apk` przekierowuje na
   * plik z manifestu), więc publikacja nowego APK nie wymaga zmiany w kodzie.
   */
  function settingsAndroidHtml() {
    const info = state.apk.info;
    const published = info && info.publishedAt
      ? (Format.isoDateShort(info.publishedAt.slice(0, 10)) || '—')
      : '—';
    const status = state.apk.error
      ? `<p class="settings-status is-error">${esc(state.apk.error)}</p>`
      : '';
    // Brak wydania to normalny stan (aplikacja jeszcze nie opublikowana):
    // nie ma czego pobierać, więc nie pokazujemy martwego linku.
    const missing = state.apk.published === false && !state.apk.loading;
    const download = missing
      ? `<p class="settings-note">Aplikacja nie jest jeszcze opublikowana — link do
        pliku APK pojawi się, gdy wydanie zostanie opublikowane.</p>`
      : `<a class="btn-filled settings-refresh apk-download" href="/api/app/apk"
        download rel="noopener">Pobierz APK</a>
      <p class="settings-note">Instalacja poza sklepem: Android zapyta o zgodę na
        instalowanie z tego źródła. Aktualizacja instaluje się na poprzednią wersję,
        więc plan, grupa i materiały zostają.</p>`;
    return `${settingsPageHeader({
    title: 'Aplikacja Android',
    subtitle: 'Natywna wersja na telefon — z widżetami na ekran główny.',
    back: true,
  })}
      ${settingsCard(`${settingsInfoRow('Wersja', info ? info.versionName : '—')}
        ${settingsDivider()}${settingsInfoRow(
    'Plik',
    info && info.sizeBytes ? `${info.apkFile} · ${Format.fileSize(info.sizeBytes)}` : '—',
  )}
        ${settingsDivider()}${settingsInfoRow('Opublikowano', published)}`)}
      ${status}
      ${download}`;
  }

  /**
   * Sprawdza wydanie APK (lekkie `GET /api/app/latest`) i zapamiętuje je
   * w `localStorage`, żeby kafelek pokazywał wersję także bez sieci.
   */
  async function loadApkInfo() {
    if (state.apk.loading) return;
    state.apk.loading = true;
    try {
      const response = await fetch('/api/app/latest', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const info = {
        versionName: String(data.versionName || ''),
        versionCode: Number(data.versionCode) || 0,
        apkFile: String(data.apkFile || ''),
        sizeBytes: Number(data.sizeBytes) || 0,
        sha256: String(data.sha256 || ''),
        publishedAt: data.publishedAt ? String(data.publishedAt) : '',
      };
      state.apk.info = info.versionName ? info : null;
      // Serwer odpowiada 200 z `published: false`, gdy nie ma wydania —
      // to nie błąd, tylko brak publikacji (wcześniej było 404 w konsoli).
      state.apk.published = info.versionName ? true : (data.published === false ? false : null);
      state.apk.error = null;
      writePrefs({ apkInfo: state.apk.info });
    } catch (err) {
      state.apk.error = navigator.onLine
        ? 'Nie udało się sprawdzić wydania aplikacji Android.'
        : 'Brak sieci — sprawdź wydanie po połączeniu.';
    } finally {
      state.apk.loading = false;
      // Odświeżamy tylko wtedy, gdy ktoś patrzy na stronę z tymi danymi.
      if (state.sheetKind === 'settings' && state.settingsPage === 'android') {
        renderSettings({ keepScroll: true });
      }
    }
  }

  // ------------------------------- 9c. Instalacja aplikacji (PWA i APK)

  /**
   * Instalacja z przeglądarki. Są dwie drogi, bo tylko jedna jest automatyczna:
   *
   * - Chromium (Chrome, Edge, Opera — Android i desktop) wysyła
   *   `beforeinstallprompt`. Zatrzymujemy to zdarzenie i pokazujemy **własny**
   *   pasek „Zainstaluj”; klik wywołuje systemowe okno instalacji (`prompt()`),
   *   więc użytkownik nie musi szukać menu przeglądarki.
   * - Safari (iPhone/iPad) takiego zdarzenia nie ma i mieć nie będzie — tam
   *   jedyna droga to „Udostępnij → Dodaj do ekranu początkowego”, więc zamiast
   *   paska pokazujemy instrukcję.
   *
   * Instrukcja pojawia się **raz**, przy pierwszym wejściu (i zawsze jest
   * w Opcjach → „Zainstaluj aplikację”). W trybie standalone, czyli gdy ktoś
   * już otworzył zainstalowaną aplikację, nie zawracamy głowy.
   */
  const INSTALL_GUIDE_EPOCH = 1;
  /** Stały adres pobierania APK — serwer przekierowuje na plik z manifestu. */
  const APK_DOWNLOAD_URL = '/api/app/apk';

  /** Czy to już zainstalowana aplikacja (PWA w trybie standalone albo iOS). */
  function isStandalone() {
    if (window.navigator.standalone === true) return true;
    if (!window.matchMedia) return false;
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: minimal-ui)').matches;
  }

  /** `ios` | `android` | `desktop` — decyduje o treści instrukcji. */
  function installPlatform() {
    const ua = String(navigator.userAgent || '');
    const touch = (navigator.maxTouchPoints || 0) > 1;
    // iPadOS 13+ podaje się za Macintosha — odróżnia go dotyk.
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touch)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'desktop';
  }

  function canPromptInstall() {
    return Boolean(state.install.prompt);
  }

  function installGuideSeen() {
    return Number(readPrefs().installGuideEpoch) >= INSTALL_GUIDE_EPOCH;
  }

  /** Instrukcja jest jednorazowa — zapamiętujemy ją także po instalacji. */
  function markInstallGuideSeen() {
    writePrefs({ installGuideEpoch: INSTALL_GUIDE_EPOCH });
  }

  /** Numerowana lista kroków; `step` może zawierać znaczniki (jest nasz, nie z sieci). */
  function installSteps(steps) {
    return `<ol class="install-steps">${steps
      .map((step) => `<li class="install-step">${step}</li>`)
      .join('')}</ol>`;
  }

  /**
   * Ścieżka kliknięć nad krokami — ta sama droga w jednej linii, żeby dało się
   * ją przeczytać jednym spojrzeniem, bez czytania całej listy.
   */
  function installShortcut(path) {
    return `<p class="install-shortcut"><span class="install-shortcut-label">Skrót</span>${path}</p>`;
  }

  /** Wersja i rozmiar APK w instrukcji — o ile znamy wydanie (`/api/app/latest`). */
  function apkLabel() {
    const info = state.apk.info;
    return info && info.versionName ? `APK ${info.versionName}` : 'APK';
  }

  function installGuideHtml(platform) {
    if (platform === 'ios') {
      return `<p class="install-lead">Ważne! Na iPhonie nie ma przycisku „Zainstaluj” — instalacja idzie przez menu „Udostępnij” w Safari.</p>
        <div class="install-section">
          <p class="install-section-title">Jako PWA — strona w przeglądarce</p>
          ${installShortcut('Udostępnij → Dodaj do ekranu początkowego → Dodaj')}
          ${installSteps([
    'Otwórz tę stronę w <strong>Safari</strong>.',
    'Stuknij <strong>Udostępnij</strong> (kwadrat ze strzałką) → <strong>Dodaj do ekranu początkowego</strong>.',
    'Stuknij <strong>Dodaj</strong> — ikona otworzy plan bez paska adresu.',
  ])}
        </div>`;
    }
    if (platform === 'android') {
      return `<p class="install-lead">Ważne! Dwie drogi: PWA (strona w przeglądarce) albo APK (natywna aplikacja z widżetami).</p>
        <div class="install-section">
          <p class="install-section-title">Jako PWA — strona w przeglądarce</p>
          ${installShortcut('trzy kropki ⋮ w prawym górnym rogu → Zainstaluj i utwórz skrót → Zainstaluj')}
          ${installSteps([
    'Otwórz stronę w <strong>Chrome</strong> (także Edge, Opera).',
    'Menu <strong>⋮</strong> → <strong>Zainstaluj i utwórz skrót</strong> → <strong>Zainstaluj</strong>.',
    'Ikona <strong>Plan zajęć</strong> na ekranie głównym działa offline.',
  ])}
        </div>
        <div class="install-section">
          <p class="install-section-title">Natywna aplikacja ${apkLabel()} — z widżetami</p>
          ${installSteps([
    `Kliknij <strong>Pobierz aplikację</strong> poniżej (${apkLabel()}).`,
    'Otwórz plik z powiadomienia <strong>Pobrano</strong> → <strong>Zainstaluj</strong> (zezwól na nieznane źródła).',
    'Widżety: przytrzymaj pulpit → <strong>Widżety</strong> → <strong>Plan zajęć</strong>.',
  ])}
          <a class="install-apk" href="${APK_DOWNLOAD_URL}" download rel="noopener">Pobierz aplikację (${apkLabel()})</a>
        </div>`;
    }
    return `<p class="install-lead">Ważne! Na komputerze instalujesz aplikację prosto z paska adresu — bez sklepu.</p>
      <div class="install-section">
        <p class="install-section-title">Jako PWA — strona w przeglądarce</p>
        ${installShortcut('ikona instalacji w pasku adresu → Zainstaluj')}
        ${installSteps([
    'Kliknij <strong>ikonę instalacji</strong> w pasku adresu (monitor ze strzałką).',
    'Nie ma jej? Menu <strong>⋮</strong> → <strong>Zainstaluj Plan zajęć</strong> (Edge: „Aplikacje” → „Zainstaluj tę witrynę”).',
    'Potwierdź <strong>Zainstaluj</strong> — aplikacja otworzy się w osobnym oknie.',
  ])}
      </div>
      <p class="install-hint">APK z widżetami: Opcje → „Aplikacja Android”.</p>`;
  }

  /** Jednolinijkowy podpis wiersza w Opcjach. */
  function installSummary() {
    if (isStandalone()) return 'już zainstalowana';
    if (canPromptInstall()) return 'gotowe — jedno kliknięcie';
    const platform = installPlatform();
    if (platform === 'ios') return 'Safari: Udostępnij → Dodaj do ekranu początkowego';
    if (platform === 'android') return 'menu ⋮ → Zainstaluj i utwórz skrót';
    return 'ikona instalacji w pasku adresu';
  }

  /**
   * Instrukcja instalacji. `firstRun` zmienia tylko podpis przycisku zamykania:
   * przy pierwszym wejściu to potwierdzenie („Rozumiem”), z Opcji — zwykłe
   * „Zamknij”.
   */
  function showInstallGuide({ firstRun = false } = {}) {
    const canPrompt = canPromptInstall();
    $('dialogTitle').textContent = 'Zainstaluj aplikację';
    $('dialogText').innerHTML = installGuideHtml(installPlatform());
    const actions = $('dialogActions');
    actions.innerHTML = `${canPrompt
      ? '<button type="button" class="text-btn" data-install-prompt>Zainstaluj teraz</button>' : ''}
      <button type="button" class="text-btn" data-dialog-cancel>${firstRun ? 'Rozumiem' : 'Zamknij'}</button>`;
    markInstallGuideSeen();
    enterOverlay('dialog');
    const close = actions.querySelector('[data-dialog-cancel]');
    if (close) close.addEventListener('click', closeDialog);
    const now = actions.querySelector('[data-install-prompt]');
    if (now) {
      now.addEventListener('click', () => {
        closeDialog();
        promptInstall();
      });
    }
  }

  /** Pasek „Zainstaluj” — pokazywany tylko wtedy, gdy przeglądarka da się poprosić. */
  function ensureInstallBanner() {
    if (isStandalone()) return;
    if ($('installBanner')) return;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', ensureInstallBanner, { once: true });
      return;
    }
    const banner = document.createElement('div');
    banner.className = 'install-banner';
    banner.id = 'installBanner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Instalacja aplikacji');
    banner.innerHTML = `<span class="install-banner-text">
        <strong>Zainstaluj Plan zajęć</strong>
        <span>Ikona na ekranie głównym, bez paska adresu.</span>
      </span>
      <button type="button" class="install-banner-go" data-install-prompt>Zainstaluj</button>
      <button type="button" class="install-banner-close" data-install-later aria-label="Później">
        <svg aria-hidden="true" focusable="false"><use href="#i-close"/></svg>
      </button>`;
    document.body.appendChild(banner);
    banner.querySelector('[data-install-prompt]').addEventListener('click', promptInstall);
    banner.querySelector('[data-install-later]').addEventListener('click', hideInstallBanner);
  }

  function hideInstallBanner() {
    const banner = $('installBanner');
    if (banner) banner.remove();
  }

  /**
   * Systemowe okno instalacji. Zdarzenia nie da się użyć dwa razy, więc po
   * wywołaniu je zerujemy; gdy przeglądarka odmówi (albo zdarzenia nie ma),
   * zostaje instrukcja ręczna.
   */
  async function promptInstall() {
    const event = state.install.prompt;
    if (!event || typeof event.prompt !== 'function') {
      showInstallGuide();
      return;
    }
    state.install.prompt = null;
    hideInstallBanner();
    try {
      event.prompt();
      const choice = event.userChoice ? await event.userChoice : null;
      if (choice && choice.outcome === 'accepted') {
        markInstallGuideSeen();
      }
    } catch (err) {
      // Przeglądarka odmówiła (np. okno już wykorzystane) — zostaje instrukcja.
      showInstallGuide();
    }
  }

  /**
   * Pierwsze wejście: pokaż instrukcję — chyba że aplikacja jest już
   * zainstalowana albo ktoś już ją widział. Gdy na ekranie jest inny arkusz
   * („Co nowego”, Opcje), czekamy na jego zamknięcie (`flushPendingInstallGuide`).
   */
  function maybeShowInstallGuide() {
    if (isStandalone()) return;
    if (installGuideSeen()) return;
    // Najpierw plan: okno nad ekranem wyboru zasłaniałoby jedyną rzecz do zrobienia.
    if (state.needsGroup) {
      state.install.guidePending = true;
      return;
    }
    if (!$('sheet').hidden || !$('dialog').hidden) {
      state.install.guidePending = true;
      return;
    }
    showInstallGuide({ firstRun: true });
  }

  function flushPendingInstallGuide() {
    if (!state.install.guidePending) return;
    state.install.guidePending = false;
    if (!$('sheet').hidden || !$('dialog').hidden) return;
    maybeShowInstallGuide();
  }

  // Zdarzenia przeglądarki rejestrujemy od razu: `beforeinstallprompt` może
  // przyjść zanim skończy się `boot()`, a wtedy nie byłoby czego zapamiętać.
  window.addEventListener('beforeinstallprompt', (event) => {
    // Własny pasek zamiast banera przeglądarki — `prompt()` wołamy po kliknięciu.
    event.preventDefault();
    state.install.prompt = event;
    ensureInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    state.install.prompt = null;
    hideInstallBanner();
    markInstallGuideSeen();
    toast('Zainstalowano — ikona jest na ekranie głównym.');
  });

  /**
   * Strona „Wybór planu”: ten sam ekran wyboru co na ekranie powitalnym
   * (`pickerHtml`) — rocznik, kierunek, specjalność i tryb w jednym miejscu —
   * plus lista grup w planie i ręczny numer grupy.
   */
  function settingsGroupHtml() {
    return `${settingsPageHeader({
    title: 'Wybór planu',
    subtitle: 'Rocznik, kierunek, specjalność i tryb.',
    back: true,
  })}
      ${pickerHtml()}
      <div class="settings-actions-inline">
        <button type="button" class="text-btn" data-add-plan-open>Dodaj grupy</button>
      </div>
      <p class="settings-manual-label">Albo wpisz numer grupy</p>
      <div class="settings-manual">
        <label class="field">
          <input type="text" id="settingsManual" inputmode="numeric" autocomplete="off" maxlength="8"
                 placeholder=" " aria-label="Numer grupy" value="${esc(state.group)}">
          <span>Numer grupy</span>
        </label>
        <button type="button" class="btn-tonal" id="settingsManualGo">Ustaw</button>
      </div>`;
  }

  /**
   * Rysuje bieżącą stronę panelu. `direction` wybiera animację w bok —
   * wjazd z prawej przy wejściu głębiej, z lewej przy powrocie (`AnimatedContent`
   * w APK, 220 ms).
   *
   * Bez `direction` strona rysuje się **bez** animacji: to nie nawigacja, tylko
   * odświeżenie treści (wydanie APK, aktualizacja PWA, zmiana planu). Wcześniej
   * animacja odpalała się przy każdym przerysowaniu i panel „przesuwał się kilka
   * razy zamiast raz”.
   */
  function renderSettings({ keepScroll = false, direction = '' } = {}) {
    const body = $('sheetBody');
    const scroll = keepScroll ? body.scrollTop : 0;
    const now = Date.now();
    const page = SETTINGS_PAGES.includes(state.settingsPage) ? state.settingsPage : 'root';
    const pages = {
      root: settingsRootHtml(now),
      plan: settingsPlanHtml(now),
      look: settingsLookHtml(),
      updates: settingsUpdatesHtml(now),
      android: settingsAndroidHtml(),
      group: settingsGroupHtml(),
      feedback: settingsFeedbackHtml(),
    };
    const animate = direction === 'forward' || direction === 'back';
    body.innerHTML = `<div class="settings-page${animate ? (direction === 'back' ? ' is-back' : '') : ' is-still'}">${pages[page]}</div>`;
    state.sheetKind = 'settings';
    if (page === 'look') bindCustomColors(body);
    if (page === 'group') {
      bindSettingsManual();
      // Ta strona rysuje ten sam ekran wyboru co powitanie — lista roczników
      // musi się dociągnąć także tutaj (powitania nikt tu nie widział).
      ensurePickerData();
    }
    body.scrollTop = scroll;
  }

  function openSettings(page = 'root') {
    state.settingsPage = SETTINGS_PAGES.includes(page) ? page : 'root';
    renderSettings();
    $('sheetBody').scrollTop = 0;
    enterOverlay('sheet');
  }

  function goSettingsPage(page) {
    if (!SETTINGS_PAGES.includes(page) || page === state.settingsPage) return;
    state.settingsPage = page;
    renderSettings({ direction: page === 'root' ? 'back' : 'forward' });
    // Strona „Aplikacja Android” dociąga wydanie, jeśli jeszcze go nie znamy.
    if (page === 'android' && !state.apk.info) loadApkInfo();
  }

  /** Odświeża tylko treść otwartego panelu (bez zamykania go). */
  function refreshSettings() {
    if (state.sheetKind !== 'settings' || $('sheet').hidden) return;
    renderSettings({ keepScroll: true });
  }

  /** Pole „numer grupy” na stronie „Grupa” — jak `OutlinedTextField` w APK. */
  function bindSettingsManual() {
    const input = $('settingsManual');
    const go = $('settingsManualGo');
    if (!input || !go) return;
    const sync = () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 8);
      if (digits !== input.value) input.value = digits;
      go.disabled = digits.length < 2;
    };
    input.addEventListener('input', sync);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && input.value.length >= 2) {
        closeSheet();
        selectGroup(input.value);
      }
    });
    go.addEventListener('click', () => {
      if (input.value.length < 2) return;
      closeSheet();
      selectGroup(input.value);
    });
    sync();
  }

  // ------------------------------- 9c. Propozycje / błędy (APK 1.12)
  //
  // Zgłoszenia są anonimowe: nie ma kont, logowania ani adresu e-mail — tak jak
  // w całym API planu. Idą do `POST /api/feedback`, a lista jest widoczna pod
  // `/propozycje` (ta sama strona czyta je z `GET /api/feedback`).

  /** Rodzaje zgłoszeń — port `FeedbackKind` z `SettingsModel.kt`. */
  const FEEDBACK_KINDS = [
    {
      id: 'idea',
      label: 'Zaproponuj nową funkcję',
      hint: 'Pomysł na widok, widżet albo ustawienie',
      prompt: 'Co dodać do planu? Im konkretniej, tym łatwiej to zrobić.',
    },
    {
      id: 'bug',
      label: 'Zgłoś błąd',
      hint: 'Coś nie działa albo wygląda źle',
      prompt: 'Co nie działa? Napisz, co robiłeś i czego się spodziewałeś.',
    },
  ];

  const FEEDBACK_MAX = 2000;

  function feedbackRow(kind) {
    return `<button type="button" class="settings-action" data-feedback-kind="${esc(kind.id)}">
      <span class="settings-action-text">
        <span class="settings-action-title">${esc(kind.label)}</span>
        <span class="settings-action-sub">${esc(kind.hint)}</span>
      </span>
      <span class="settings-chevron" aria-hidden="true">›</span>
    </button>`;
  }

  function settingsFeedbackHtml() {
    return `${settingsPageHeader({
    title: 'Propozycje / błędy',
    subtitle: 'Anonimowo — bez logowania i bez adresu e-mail.',
    back: true,
  })}
      ${settingsCard(FEEDBACK_KINDS.map(feedbackRow).join(settingsDivider()))}
      <p class="settings-foot">Zgłoszenia trafiają prosto do autora planu — widać je na
        ${esc(location.host)}/propozycje. Nie zbieramy adresów e-mail ani
        identyfikatorów urządzenia; dopisujemy tylko wersję aplikacji, żeby wiedzieć,
        czego dotyczy problem.</p>`;
  }

  /**
   * Okno wysyłki zgłoszenia. Treść zostaje w polu po błędzie, żeby nic nie
   * przepadło; po sukcesie dialog pokazuje podziękowanie i jedno „Zamknij”.
   */
  function showFeedbackDialog(kind) {
    $('dialogTitle').textContent = kind.label;
    $('dialogText').innerHTML = `<p class="dialog-intro">${esc(kind.prompt)}</p>
      <label class="visually-hidden" for="feedbackText">Treść zgłoszenia</label>
      <textarea class="dialog-textarea" id="feedbackText" maxlength="${FEEDBACK_MAX}"
        placeholder="Treść zgłoszenia…"></textarea>
      <div class="dialog-foot">
        <p class="dialog-error" id="feedbackError" role="alert" hidden></p>
        <span class="dialog-counter" id="feedbackCount">0 / ${FEEDBACK_MAX}</span>
      </div>`;
    const actions = $('dialogActions');
    actions.innerHTML = `<button type="button" class="text-btn" data-dialog-cancel>Anuluj</button>
      <button type="button" class="text-btn" data-dialog-send disabled>Wyślij</button>`;
    enterOverlay('dialog');

    const text = $('feedbackText');
    const send = actions.querySelector('[data-dialog-send]');
    const cancel = actions.querySelector('[data-dialog-cancel]');
    const counter = $('feedbackCount');
    const errorBox = $('feedbackError');

    const sync = () => {
      counter.textContent = `${text.value.length} / ${FEEDBACK_MAX}`;
      send.disabled = text.value.trim().length < 3;
    };

    text.addEventListener('input', () => {
      errorBox.hidden = true;
      sync();
    });
    cancel.addEventListener('click', closeDialog);
    send.addEventListener('click', async () => {
      const message = text.value.trim();
      if (message.length < 3) return;
      send.disabled = true;
      cancel.disabled = true;
      send.textContent = 'Wysyłam…';
      try {
        await sendFeedback(kind, message);
        $('dialogText').innerHTML = '<p class="dialog-done">Dziękuję! Zgłoszenie jest już u autora planu.</p>';
        actions.innerHTML = '<button type="button" class="text-btn" data-dialog-cancel>Zamknij</button>';
        actions.querySelector('[data-dialog-cancel]').addEventListener('click', closeDialog);
      } catch (err) {
        errorBox.textContent = err.message || 'Nie udało się wysłać zgłoszenia.';
        errorBox.hidden = false;
        send.disabled = false;
        cancel.disabled = false;
        send.textContent = 'Wyślij';
      }
    });

    text.focus();
    sync();
  }

  /** `POST /api/feedback` — bez konta i tokenu; serwer pilnuje limitu na IP. */
  async function sendFeedback(kind, message) {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: kind.id, message, version: APP_VERSION, platform: 'web' }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error((data && data.error) || `Błąd serwera (${response.status})`);
    return data;
  }

  // ------------------------------- 9d. „Co nowego” (APK 1.12)

  /**
   * Dwa znaczniki w tekstach wydania: `**pogrubienie**` i `[etykieta](adres)`.
   * Najpierw escapujemy cały tekst, więc wpis nie wniesie własnego HTML-a;
   * adres przepuszczamy wyłącznie jako http(s) albo ścieżkę od „/”.
   */
  function whatsNewText(text) {
    return esc(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => (
        /^(https?:\/\/|\/)/i.test(href)
          ? `<a class="whats-new-link" href="${href}">${label}</a>`
          : label));
  }

  function whatsNewHtml(notes) {
    const newest = notes[0];
    const releases = notes.map((release) => `<div class="whats-new-release">
      <span class="whats-new-version">${esc(release.version)}</span>
      ${release.title ? `<p class="whats-new-title">${whatsNewText(release.title)}</p>` : ''}
      <ul class="whats-new-list">${release.items.map((item) => `<li>${whatsNewText(item)}</li>`).join('')}</ul>
    </div>`).join('');
    return `<h2 class="sheet-title" id="sheetTitle">Co nowego</h2>
      <p class="sheet-sub">Wersja ${esc(newest.version)} — najważniejsze zmiany.</p>
      ${releases}
      <button type="button" class="btn-filled whats-new-ok" data-whats-new-ok>Rozumiem</button>`;
  }

  /** Pokazuje arkusz tylko wtedy, gdy jest co pokazać (nowa wersja powłoki). */
  function openWhatsNew() {
    const notes = WhatsNew.pending(readPrefs().whatsNewSeen);
    if (!notes.length) return;
    openSheet(whatsNewHtml(notes));
    state.sheetKind = 'whats-new';
  }

  /** Zapis „widziałem tę wersję” — kolejne uruchomienia są już ciche. */
  function markWhatsNewSeen() {
    // Zapamiętujemy wersję **najnowszego wpisu**, nie `APP_VERSION`: gdy
    // podbijemy powłokę bez nowego wpisu, arkusz nie może wracać przy każdym
    // starcie (puste `pending` = cisza).
    const newest = WhatsNew.releases[0];
    writePrefs({ whatsNewSeen: newest ? newest.version : APP_VERSION });
  }

  /**
   * Raz na wydanie, po pierwszym malowaniu planu — nie opóźniamy startu,
   * a użytkownik najpierw widzi plan, potem arkusz.
   *
   * Pierwsze wejście kończy się wyborem grupy (`needsGroup`), więc arkusz
   * czeka i otwiera się dopiero po nim — wcześniej świeży użytkownik nie
   * zobaczył go wcale, tylko po ponownym uruchomieniu aplikacji.
   */
  let whatsNewQueued = false;

  function maybeShowWhatsNew() {
    if (whatsNewQueued) return;
    if (state.needsGroup) return;
    if (!WhatsNew.pending(readPrefs().whatsNewSeen).length) return;
    whatsNewQueued = true;
    let attempts = 0;
    const tryOpen = () => {
      // Czekamy na plan: arkusz nad „Pobieram plan…” wyglądałby jak błąd.
      // Po ~8 s pokazujemy go mimo wszystko (np. brak sieci i brak zapisu).
      if (!state.slots.length && attempts < 8) {
        attempts += 1;
        window.setTimeout(tryOpen, 1000);
        return;
      }
      // Ktoś zdążył otworzyć ustawienia albo szczegóły — nie przykrywamy tego.
      if (!$('sheet').hidden || !$('dialog').hidden) return;
      openWhatsNew();
    };
    window.setTimeout(tryOpen, 700);
  }

  function updateStatusText() {
    if (state.update.checking) return 'Sprawdzam…';
    if (state.update.error) return state.update.error;
    if (state.update.available) return 'Dostępna nowa wersja aplikacji.';
    return 'Masz najnowszą wersję.';
  }

  /** Sprawdza, czy service worker ma nowszą wersję (odpowiednik UpdateManager). */
  async function checkForUpdate() {
    if (!('serviceWorker' in navigator)) {
      state.update.error = 'Ta przeglądarka nie obsługuje aktualizacji w tle (PWA).';
      refreshSettings();
      return;
    }
    state.update.checking = true;
    state.update.error = null;
    refreshSettings();
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        // Nowa wersja to **oczekujący** worker. `installing` pojawia się także
        // przy pierwszej instalacji i dawał fałszywe „dostępna nowa wersja”.
        state.update.available = Boolean(registration.waiting);
      } else {
        await navigator.serviceWorker.register('/sw.js');
      }
      state.update.lastCheck = Date.now();
      writePrefs({ lastUpdateCheck: state.update.lastCheck });
    } catch (err) {
      state.update.error = 'Nie udało się sprawdzić aktualizacji.';
    } finally {
      state.update.checking = false;
      renderChrome();
      refreshSettings();
    }
  }

  /** Włącza czekającą wersję i przeładowuje stronę. */
  async function applyUpdate() {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && registration.waiting) {
        registration.waiting.postMessage('skip-waiting');
      }
    } catch (err) { /* i tak przeładowujemy */ }
    window.setTimeout(() => window.location.reload(), 300);
  }

  function markUpdateAvailable() {
    if (state.update.available) return;
    state.update.available = true;
    renderChrome();
    refreshSettings();
  }

  // ------------------------------------------------- 10. Szczegóły zajęć

  let detailSlot = null;
  let materials = { files: [], links: [], limits: null, loading: false, busy: false, notice: null, error: null };

  /**
   * Ostatnio widziane materiały tych zajęć (klucz `grupa|zajęcia`). Dzięki temu
   * arkusz szczegółów pokazuje pliki **w tej samej klatce** co resztę treści —
   * wcześniej dochodziły po odpowiedzi API, czyli po kilkudziesięciu–
   * kilkuset milisekundach. To odpowiednik pamięci `MaterialsViewModel` z APK.
   */
  const materialsCache = new Map();
  const MATERIALS_TTL_MS = 5 * 60 * 1000;

  function materialsKey(slotId) {
    return `${state.group}|${slotId}`;
  }

  function cachedMaterials(slotId) {
    const key = materialsKey(slotId);
    const entry = materialsCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > MATERIALS_TTL_MS) {
      materialsCache.delete(key);
      return null;
    }
    return entry;
  }

  function storeMaterials(slotId, data) {
    materialsCache.set(materialsKey(slotId), {
      at: Date.now(),
      files: data.attachments || [],
      links: data.links || [],
      limits: data.limits || null,
    });
  }

  function slotById(id) {
    return state.slots.find((slot) => slot.id === id) || null;
  }

  function openDetail(slot) {
    if (!slot) return;
    detailSlot = slot;
    const cached = cachedMaterials(slot.id);
    // Z pamięci rysujemy od razu; bez niej arkusz dostaje stan „Wczytuję…”
    // już w pierwszym zapisie HTML — żadnego drugiego renderu w tej klatce.
    materials = cached
      ? {
        files: cached.files,
        links: cached.links,
        limits: cached.limits,
        loading: false,
        busy: false,
        notice: null,
        error: null,
      }
      : { files: [], links: [], limits: null, loading: true, busy: false, notice: null, error: null };

    const form = slot.form
      ? '<span class="pill pill-secondary">' + esc(slot.form) + '</span>'
      : '';
    const mode = Format.modeLabel(slot.mode)
      ? '<span class="pill pill-tertiary">' + esc(Format.modeLabel(slot.mode)) + '</span>'
      : '';
    const duration = Format.duration(slot.durationMinutes);
    const pills = (form || mode || duration)
      ? `<div class="detail-pills">${form}${mode}${duration ? `<span class="pill">${esc(duration)}</span>` : ''}</div>`
      : '';

    const rows = [
      ['Termin', `${Format.dayTitle(slot.date)} · ${Format.clock(slot.startMinutes)}–${Format.clock(slot.endMinutes)}`],
      ['Sala', slot.room],
      ['Prowadzący', slot.lecturer],
      ['Grupa', slot.group],
      ['Uwagi', slot.notes],
    ].filter(([, value]) => value)
      .map(([label, value]) => `<div class="detail-row">
        <span class="detail-label">${esc(label)}</span>
        <span class="detail-value">${esc(value)}</span>
      </div>`).join('');

    openSheet(`<h2 class="detail-title" id="sheetTitle">${esc(slot.subject)}</h2>
      ${pills}
      <div class="detail-rows">${rows}</div>
      ${noteEditorHtml(slot)}
      <div class="detail-divider"></div>
      <div id="materialsBox">${materialsHtml()}</div>
      <div style="margin-top:10px">
        <button type="button" class="text-btn" data-close-sheet>Zamknij</button>
      </div>`);

    // Świeże dane dociągamy po cichu: treść już jest, więc nic nie „przeskakuje”.
    loadMaterials({ quiet: Boolean(cached) });
  }

  /** Maksymalna długość notatki — ta sama reguła co w serwerze i w APK. */
  const NOTE_MAX = 15;

  /** Notatka w jednej linii, maks. 15 znaków (emoji też liczy się jako jeden). */
  function clampNote(text) {
    return Array.from(String(text || '').replace(/\s+/g, ' ').trim())
      .slice(0, NOTE_MAX)
      .join('');
  }

  /**
   * Edytor notatki w szczegółach zajęć. Notatka jest wspólna, więc mówimy to
   * wprost: „widoczna dla wszystkich, którzy widzą te zajęcia”. Chipy
   * („Kolos”, „Egzamin”) zapisują jednym dotknięciem — to najczęstszy przypadek,
   * a własny tekst wpisuje się w polu obok.
   */
  function noteEditorHtml(slot) {
    const note = state.notes.get(slot.id) || '';
    return `<div class="note-editor">
      <div class="note-editor-head">
        <span class="note-editor-title">Notatka na kafelku</span>
        <span class="note-editor-hint">maks. ${NOTE_MAX} znaków</span>
      </div>
      <div class="note-editor-row">
        <input id="noteInput" class="note-input" type="text" maxlength="${NOTE_MAX}"
          value="${esc(note)}" placeholder="np. Kolos" autocomplete="off" spellcheck="false"
          aria-label="Notatka na kafelku, maksymalnie ${NOTE_MAX} znaków">
        <button type="button" class="text-btn" data-note-save>Zapisz</button>
      </div>
      <div class="note-editor-chips">
        <button type="button" class="note-chip" data-note-chip="Kolos">Kolos</button>
        <button type="button" class="note-chip" data-note-chip="Egzamin">Egzamin</button>
        <button type="button" class="note-chip is-clear" data-note-clear ${note ? '' : 'hidden'}>Usuń</button>
      </div>
      <p class="note-editor-status" id="noteStatus">Widoczna dla wszystkich, którzy widzą te zajęcia.</p>
    </div>`;
  }

  function setNoteStatus(text) {
    const status = $('noteStatus');
    if (status) status.textContent = text;
  }

  /** Po zapisie: pole i chip „Usuń” pokazują stan z serwera (może być przycięty). */
  function syncNoteEditor(text) {
    const input = $('noteInput');
    if (input) input.value = text;
    const clear = $('sheetBody') && $('sheetBody').querySelector('[data-note-clear]');
    if (clear) clear.hidden = !text;
  }

  let noteBusy = false;

  /**
   * Zapis notatki (pusta treść usuwa). Kafelek rysuje się od nowa od razu po
   * odpowiedzi serwera — bez czekania na kolejne odświeżenie planu.
   */
  async function saveNote(rawText) {
    if (!detailSlot || noteBusy) return;
    const slotId = detailSlot.id;
    const text = clampNote(rawText);
    noteBusy = true;
    setNoteStatus('Zapisuję…');
    try {
      // Grupy i rok akademicki muszą być w adresie: serwer sprawdza, czy takie
      // zajęcia naprawdę są w planie (notatka do wymyślonego ID = 404).
      const data = await getJson(apiUrl('/api/notes'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ classId: slotId, text }),
      });
      const saved = String((data && data.text) || '');
      if (saved) state.notes.set(slotId, saved);
      else state.notes.delete(slotId);
      syncNoteEditor(saved);
      setNoteStatus(saved ? 'Zapisano — notatka jest na kafelku.' : 'Notatka usunięta.');
      render();
    } catch (err) {
      setNoteStatus(err.message || 'Nie udało się zapisać notatki.');
    } finally {
      noteBusy = false;
    }
  }

  /** Cała sekcja materiałów jako jeden fragment HTML (także przy otwarciu arkusza). */
  function materialsHtml() {
    const busy = materials.busy || materials.loading;
    const notice = materials.notice
      ? `<p class="materials-notice">${esc(materials.notice)}</p>` : '';
    const error = materials.error
      ? `<div class="materials-error"><span>${esc(materials.error)}</span>
         <button type="button" class="text-btn" data-materials-ack>OK</button></div>` : '';

    let body;
    if (materials.loading) {
      body = '<p class="materials-hint">Wczytuję materiały…</p>';
    } else if (!materials.files.length && !materials.links.length) {
      body = '<p class="materials-hint">Brak materiałów. Dodaj plik lub link do notatek.</p>';
    } else {
      // Każdy materiał to karta (APK 1.10): plakietka typu, nazwa jako największy
      // tekst, `typ · rozmiar · data` w drugim planie i ikony pobierania/usuwania.
      // Cała karta pobiera — `<a download>` zostaje, bo tylko on zapisuje plik
      // bez podmieniania widoku aplikacji (przeglądarka, nie `location.href`).
      body = `<div class="material-list">${materials.files.map(materialCard).join('')
        + materials.links.map(materialLinkCard).join('')}</div>`;
    }

    // Licznik pod nagłówkiem: od razu widać, że do zajęć coś jest dołączone
    // (`Format.filesCount` / `linksCount` z APK 1.9).
    const counts = !materials.loading && (materials.files.length || materials.links.length)
      ? `<p class="materials-count">${esc([
        materials.files.length ? Format.filesCount(materials.files.length) : null,
        materials.links.length ? Format.linksCount(materials.links.length) : null,
      ].filter(Boolean).join(' · '))}</p>`
      : '';

    // Listy dozwolonych formatów i limitu nie ma — powtarzała się przy każdych
    // zajęciach, a limit i tak pilnuje serwer i zwraca konkretny komunikat (APK 1.10).
    return `<div class="materials-head">
        <h3 class="materials-title">Materiały i notatki</h3>
        <button type="button" class="text-btn" data-add-file ${busy ? 'disabled' : ''}>+ Plik</button>
        <button type="button" class="text-btn" data-add-link ${busy ? 'disabled' : ''}>+ Link</button>
      </div>
      ${counts}
      ${materials.busy ? '<div class="materials-progress"><span></span></div>' : ''}
      ${notice}${error}${body}`;
  }

  /** Przerysowuje samą sekcję materiałów w otwartym arkuszu. */
  function renderMaterials() {
    const box = $('materialsBox');
    if (!box) return;
    box.innerHTML = materialsHtml();
  }

  /** Plakietka typu pliku — `TypeBadge` z APK: maks. 4 znaki, bold, akcent. */
  const materialBadge = (text, modifier = '') => `<span class="material-badge${modifier}">${esc(text)}</span>`;

  /** Karta pliku: cała jest linkiem pobierającym, kosz siedzi obok. */
  function materialCard(file) {
    const ext = String(file.ext || '').toUpperCase();
    const meta = [ext, Format.fileSize(file.size), Format.isoDateShort(file.uploadedAt)]
      .filter(Boolean).join(' · ');
    return `<div class="material-card">
      <a class="material-card-link" href="${esc(file.url)}" download="${esc(file.name)}"
         aria-label="Pobierz ${esc(file.name)}">
        ${materialBadge(ext.slice(0, 4))}
        <span class="material-card-text">
          <span class="material-name">${esc(file.name)}</span>
          <span class="material-meta">${esc(meta)}</span>
        </span>
        <svg class="material-icon is-download" width="20" height="20" aria-hidden="true" focusable="false"><use href="#i-download"/></svg>
      </a>
      <button type="button" class="material-icon-btn" data-file-delete="${esc(file.id)}"
              aria-label="Usuń ${esc(file.name)}">
        <svg width="19" height="19" aria-hidden="true" focusable="false"><use href="#i-delete"/></svg>
      </button>
    </div>`;
  }

  /** Karta linku — ta sama karta, ale otwiera adres w przeglądarce. */
  function materialLinkCard(link) {
    return `<div class="material-card">
      <a class="material-card-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer"
         aria-label="Otwórz ${esc(link.title || link.url)}">
        <span class="material-badge is-link" aria-hidden="true">
          <svg width="20" height="20" focusable="false"><use href="#i-link"/></svg>
        </span>
        <span class="material-card-text">
          <span class="material-name">${esc(link.title || link.url)}</span>
          <span class="material-meta">${esc(link.host || link.url)}</span>
        </span>
      </a>
      <button type="button" class="material-icon-btn" data-link-delete="${esc(link.id)}"
              aria-label="Usuń ${esc(link.title || link.url)}">
        <svg width="19" height="19" aria-hidden="true" focusable="false"><use href="#i-delete"/></svg>
      </button>
    </div>`;
  }

  function materialsQuery() {
    // Rok akademicki też jest częścią zapytania: zajęcia starszego naboru nie
    // występują w bieżącym planie grupy, więc bez `ay` serwer by ich nie znalazł.
    const params = [`group=${encodeURIComponent(state.group)}`, `class=${encodeURIComponent(detailSlot.id)}`];
    if (state.ay) params.push(`ay=${encodeURIComponent(state.ay)}`);
    return params.join('&');
  }

  async function loadMaterials({ quiet = false } = {}) {
    if (!detailSlot) return;
    const slotId = detailSlot.id;
    if (!quiet) {
      materials.loading = true;
      materials.error = null;
      renderMaterials();
    }
    try {
      const data = await getJson(`/api/attachments?${materialsQuery()}`);
      storeMaterials(slotId, data);
      if (detailSlot && detailSlot.id === slotId) {
        materials.files = data.attachments || [];
        materials.links = data.links || [];
        materials.limits = data.limits || null;
        materials.error = null;
      }
    } catch (err) {
      // Przy danych z pamięci błąd jest niemy — to tylko nieudane odświeżenie
      // listy, którą użytkownik i tak widzi.
      if (!quiet) materials.error = err.message || 'Nie udało się wczytać materiałów.';
    } finally {
      if (detailSlot && detailSlot.id === slotId) {
        materials.loading = false;
        renderMaterials();
      }
    }
  }

  /**
   * Dociąga materiały zajęć z widocznego dnia, **zanim** ktoś w nie kliknie.
   * Pytamy tylko o zajęcia, o których indeks mówi, że mają materiały (bez
   * zbędnych żądań), maksymalnie o kilka i dopiero gdy przeglądarka ma wolny
   * czas — dzięki temu otwarcie szczegółów pokazuje pliki od razu.
   */
  const MATERIALS_PREFETCH_LIMIT = 6;

  function prefetchMaterials(slots) {
    if (navigator.onLine === false || !state.attachmentIds.size) return;
    const pending = slots
      .filter((slot) => state.attachmentIds.has(slot.id) && !cachedMaterials(slot.id))
      .slice(0, MATERIALS_PREFETCH_LIMIT);
    if (!pending.length) return;
    const run = () => {
      pending.forEach((slot) => {
        getJson(`/api/attachments?group=${encodeURIComponent(state.group)}`
          + `&class=${encodeURIComponent(slot.id)}`)
          .then((data) => storeMaterials(slot.id, data))
          .catch(() => undefined);
      });
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 1500 });
    else window.setTimeout(run, 400);
  }

  /** Po dodaniu/usunięciu materiału pamięć musi znać nowy stan (bez re-fetchu). */
  function syncMaterialsCache() {
    if (!detailSlot) return;
    materialsCache.set(materialsKey(detailSlot.id), {
      at: Date.now(),
      files: materials.files,
      links: materials.links,
      limits: materials.limits,
    });
  }

  async function uploadFile(file) {
    if (!detailSlot || !file) return;
    materials.busy = true;
    materials.error = null;
    materials.notice = null;
    renderMaterials();
    try {
      const response = await fetch(
        `/api/attachments?${materialsQuery()}&name=${encodeURIComponent(file.name)}`,
        {
          method: 'POST',
          headers: { 'x-plan-upload': '1', 'content-type': 'application/octet-stream' },
          body: file,
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error((data && data.error) || `Błąd serwera (${response.status})`);
      materials.files = (data && data.attachments) || materials.files;
      materials.links = (data && data.links) || materials.links;
      materials.limits = (data && data.limits) || materials.limits;
      materials.notice = `Dodano: ${file.name}`;
    } catch (err) {
      materials.error = err.message || 'Nie udało się dodać pliku.';
    } finally {
      materials.busy = false;
      renderMaterials();
      // Pamięć podręczna musi znać nowy stan, żeby ponowne otwarcie szczegółów
      // nie pokazało listy sprzed zmiany.
      syncMaterialsCache();
      // Spinacz na karcie musi wiedzieć o zmianie — indeks odświeżamy po każdej
      // operacji na materiałach (`onAttachmentsChanged` w APK 1.9).
      loadAttachmentIndex();
    }
  }

  async function deleteFile(id) {
    materials.busy = true;
    renderMaterials();
    try {
      const response = await fetch(`/api/attachments/${encodeURIComponent(id)}?${materialsQuery()}`, {
        method: 'DELETE',
        headers: { 'x-plan-upload': '1' },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error((data && data.error) || `Błąd serwera (${response.status})`);
      materials.files = (data && data.attachments) || [];
      materials.notice = 'Plik usunięty.';
    } catch (err) {
      materials.error = err.message || 'Nie udało się usunąć pliku.';
    } finally {
      materials.busy = false;
      renderMaterials();
      // Pamięć podręczna musi znać nowy stan, żeby ponowne otwarcie szczegółów
      // nie pokazało listy sprzed zmiany.
      syncMaterialsCache();
      // Spinacz na karcie musi wiedzieć o zmianie — indeks odświeżamy po każdej
      // operacji na materiałach (`onAttachmentsChanged` w APK 1.9).
      loadAttachmentIndex();
    }
  }

  async function deleteLink(id) {
    materials.busy = true;
    renderMaterials();
    try {
      const response = await fetch(`/api/attachments/links/${encodeURIComponent(id)}?${materialsQuery()}`, {
        method: 'DELETE',
        headers: { 'x-plan-upload': '1' },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error((data && data.error) || `Błąd serwera (${response.status})`);
      materials.links = (data && data.links) || [];
      materials.notice = 'Link usunięty.';
    } catch (err) {
      materials.error = err.message || 'Nie udało się usunąć linku.';
    } finally {
      materials.busy = false;
      renderMaterials();
      // Pamięć podręczna musi znać nowy stan, żeby ponowne otwarcie szczegółów
      // nie pokazało listy sprzed zmiany.
      syncMaterialsCache();
      // Spinacz na karcie musi wiedzieć o zmianie — indeks odświeżamy po każdej
      // operacji na materiałach (`onAttachmentsChanged` w APK 1.9).
      loadAttachmentIndex();
    }
  }

  async function addLink(url, title) {
    materials.busy = true;
    renderMaterials();
    try {
      const response = await fetch(`/api/attachments/links?${materialsQuery()}`, {
        method: 'POST',
        headers: { 'x-plan-upload': '1', 'content-type': 'application/json' },
        body: JSON.stringify(title ? { url, title } : { url }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error((data && data.error) || `Błąd serwera (${response.status})`);
      materials.links = (data && data.links) || [];
      materials.notice = 'Dodano link.';
    } catch (err) {
      materials.error = err.message || 'Nie udało się dodać linku.';
    } finally {
      materials.busy = false;
      renderMaterials();
      // Pamięć podręczna musi znać nowy stan, żeby ponowne otwarcie szczegółów
      // nie pokazało listy sprzed zmiany.
      syncMaterialsCache();
      // Spinacz na karcie musi wiedzieć o zmianie — indeks odświeżamy po każdej
      // operacji na materiałach (`onAttachmentsChanged` w APK 1.9).
      loadAttachmentIndex();
    }
  }

  // -------------------------------------------------------- 11. Dialogi

  function showDialog({ title, text, confirmLabel, cancelLabel = 'Anuluj', onConfirm, note }) {
    $('dialogTitle').textContent = title;
    $('dialogText').innerHTML = text || '';
    const actions = $('dialogActions');
    actions.innerHTML = `<button type="button" class="text-btn" data-dialog-cancel>${esc(cancelLabel)}</button>
      <button type="button" class="text-btn" data-dialog-confirm>${esc(confirmLabel || 'OK')}</button>`;
    if (note) {
      $('dialogText').insertAdjacentHTML('beforeend', `<p class="dialog-note">${esc(note)}</p>`);
    }
    enterOverlay('dialog');

    actions.querySelector('[data-dialog-cancel]').addEventListener('click', closeDialog);
    actions.querySelector('[data-dialog-confirm]').addEventListener('click', () => {
      const keepOpen = onConfirm ? onConfirm() : false;
      if (!keepOpen) closeDialog();
    });
  }

  function closeDialog() {
    $('dialog').hidden = true;
    $('dialogScrim').hidden = true;
    $('dialogText').innerHTML = '';
    $('dialogActions').innerHTML = '';
    // Arkusz pod spodem nadal blokuje tło.
    if ($('sheet').hidden) setBackgroundInert(false);
    restoreFocus('dialog');
    // Instrukcja instalacji czekała na zamknięcie tego okna (pierwsze wejście).
    flushPendingInstallGuide();
  }

  function confirmDelete(name, onConfirm) {
    showDialog({
      title: 'Usunąć materiał?',
      text: `<p>„${esc(name)}” zniknie dla wszystkich, którzy widzą te zajęcia. Tej operacji nie można cofnąć.</p>`,
      confirmLabel: 'Usuń',
      onConfirm,
    });
  }

  function showAddLinkDialog() {
    showDialog({
      title: 'Link do materiału',
      text: `<label class="field">
          <input type="url" id="linkUrl" inputmode="url" autocomplete="off" placeholder=" " aria-label="Adres (https://…)">
          <span>Adres (https://…)</span>
        </label>
        <label class="field">
          <input type="text" id="linkTitle" maxlength="120" autocomplete="off" placeholder=" " aria-label="Tytuł (opcjonalnie)">
          <span>Tytuł (opcjonalnie)</span>
        </label>`,
      confirmLabel: 'Dodaj',
      note: 'Link jest widoczny dla wszystkich, którzy widzą te zajęcia.',
      onConfirm: () => {
        const url = ($('linkUrl').value || '').trim();
        if (!isHttpUrl(url)) {
          $('linkUrl').focus();
          return true;
        }
        const title = ($('linkTitle').value || '').trim();
        addLink(url, title || null);
        return false;
      },
    });
  }

  function isHttpUrl(value) {
    const trimmed = String(value || '').trim();
    return (trimmed.startsWith('http://') || trimmed.startsWith('https://'))
      && trimmed.length > 8 && trimmed.indexOf(' ') === -1;
  }

  function toast(message) {
    const box = $('toast');
    box.textContent = message;
    box.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { box.hidden = true; }, 2600);
  }

  // ----------------------------------------------------- 12. Zdarzenia

  function shiftDay(days, direction) {
    const active = activeDay();
    if (!active) return;
    state.selectedDate = addDays(active, days);
    state.enter = { target: 'agenda', dir: direction > 0 ? 1 : -1 };
    render();
    viewport().scrollTop = 0;
  }

  function selectDate(iso) {
    if (!iso) return;
    // `activeDay()` to dzień, który użytkownik ma teraz na ekranie — bez tego
    // pierwszy wybór kafelka (brak `selectedDate`) przeskakiwał bez animacji.
    const previous = state.selectedDate || activeDay();
    state.selectedDate = iso;
    // Semestr jest przeglądem całego semestru: kafelek dnia otwiera **ten dzień**
    // w widoku „Dzień” (wcześniej kliknięcie tylko zaznaczało datę i nic się
    // nie działo, bo widok zostawał semestralny).
    if (state.view === 'semester') {
      state.view = 'day';
      state.enter = { target: 'view', dir: -1 };
      syncUrl();
      viewport().scrollTop = 0;
      render();
      return;
    }
    if (state.view === 'week') {
      state.weekAnchor = ScheduleViews.weekStart(iso);
      state.weekAnchorChanged = true;
    }
    if (state.view === 'month') state.monthKey = iso.slice(0, 7);
    if (state.view === 'day' && previous && iso !== previous) {
      state.enter = { target: 'agenda', dir: iso > previous ? 1 : -1 };
      viewport().scrollTop = 0;
    }
    render();
  }

  function onViewportClick(event) {
    const target = event.target.closest('[data-class-id],[data-select-date],[data-empty-action],[data-strip-shift],[data-week-shift],[data-week-today],[data-month-shift],[data-month-today]');
    if (!target) return;

    if (target.dataset.classId) {
      openDetail(slotById(target.dataset.classId));
      return;
    }
    if (target.dataset.selectDate) {
      selectDate(target.dataset.selectDate);
      return;
    }
    if (target.dataset.emptyAction) {
      const action = target.dataset.emptyAction;
      if (action === 'retry') load(true);
      else if (action === 'pick') openSettings('plan');
      else if (action.startsWith('select:')) selectDate(action.slice(7));
      return;
    }
    if (target.dataset.stripShift) {
      shiftDay(Number(target.dataset.stripShift), Number(target.dataset.stripShift) > 0 ? 1 : -1);
      return;
    }
    if (target.dataset.weekShift) {
      // Surowa wartość z atrybutu (`1`/`-1`) — kierunek rozpoznaje
      // `ScheduleViews.isForward()`, żeby strzałka „‹” naprawdę cofała okres.
      shiftWeek(target.dataset.weekShift);
      return;
    }
    if (target.hasAttribute('data-week-today')) {
      state.weekAnchor = ScheduleViews.weekStart(state.today);
      state.weekAnchorChanged = true;
      state.selectedDate = state.today;
      render();
      return;
    }
    if (target.dataset.monthShift) {
      shiftMonth(target.dataset.monthShift);
      return;
    }
    if (target.hasAttribute('data-month-today')) {
      state.monthKey = ScheduleViews.monthOf(state.today);
      state.selectedDate = state.today;
      render();
    }
  }

  /** Tydzień do przodu/do tyłu — wspólne dla strzałek i gestu. */
  function shiftWeek(forward) {
    const next = ScheduleViews.isForward(forward);
    state.weekAnchor = addDays(state.weekAnchor || ScheduleViews.weekStart(anchorDay()), next ? 7 : -7);
    state.weekAnchorChanged = true;
    state.selectedDate = state.weekAnchor;
    state.enter = { target: 'view', dir: next ? 1 : -1 };
    render();
  }

  /** Miesiąc do przodu/do tyłu — wspólne dla strzałek i gestu. */
  function shiftMonth(forward) {
    const next = ScheduleViews.isForward(forward);
    const [year, month] = (state.monthKey || ScheduleViews.monthOf(anchorDay())).split('-').map(Number);
    const total = (year * 12) + (month - 1) + (next ? 1 : -1);
    state.monthKey = `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
    state.enter = { target: 'view', dir: next ? 1 : -1 };
    render();
  }

  /** Semestr: przesunięcie gestem przewija do kolejnej karty miesiąca. */
  function scrollSemester(forward) {
    const cards = Array.from(viewport().querySelectorAll('.semester-card'));
    if (!cards.length) return;
    const scroll = viewport().scrollTop;
    const tops = cards.map((card) => card.offsetTop);
    let index;
    if (forward) {
      index = tops.findIndex((top) => top > scroll + 4);
      if (index < 0) index = cards.length - 1;
    } else {
      index = 0;
      for (let i = tops.length - 1; i >= 0; i -= 1) {
        if (tops[i] < scroll - 4) { index = i; break; }
      }
    }
    viewport().scrollTo({ top: tops[index], behavior: 'smooth' });
  }

  /** Jedno miejsce decydujące, co znaczy „przesunięcie w bok” w danym widoku. */
  function swipeTo(forward) {
    if (state.view === 'day') {
      const active = activeDay();
      if (!active) return;
      const target = ScheduleViews.neighborDate(state.dates, active, forward);
      if (!target) return;
      state.selectedDate = target;
      state.enter = { target: 'agenda', dir: forward ? 1 : -1 };
      render();
      viewport().scrollTop = 0;
      return;
    }
    if (state.view === 'week') {
      shiftWeek(forward);
      return;
    }
    if (state.view === 'month') {
      shiftMonth(forward);
      return;
    }
    scrollSemester(forward);
  }

  /**
   * Przesuwanie w bok: element idzie za palcem (albo kursorem), a po puszczeniu
   * albo wraca na miejsce, albo przełącza dzień/tydzień/miesiąc — jak
   * `AnimatedContent` + `periodSwipe` w natywnej aplikacji.
   */
  function attachSwipe(element) {
    const START_SLOP = 8;
    const DRAG_GAIN = 0.7;
    // Prędkość liczymy z końcówki ruchu (ostatnie 100 ms), jak `VelocityTracker`
    // w `Modifier.periodSwipe` — decyduje „pstryknięcie”, nie cała droga palca.
    const VELOCITY_WINDOW_MS = 100;
    let active = false;
    let decided = null;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let surface = null;
    let guardClick = 0;
    let samples = [];

    const remember = (x) => {
      const now = performance.now();
      samples.push({ t: now, x });
      while (samples.length > 2 && now - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();
    };

    /** Prędkość końcówki gestu w px/s (dodatnia = palec w prawo). */
    const velocityOf = () => {
      if (samples.length < 2) return 0;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.t - first.t;
      if (dt < 8) return 0;
      return ((last.x - first.x) / dt) * 1000;
    };

    const draggableSurface = () => (
      state.view === 'day'
        ? (element.querySelector('.agenda') || element.firstElementChild)
        : element.firstElementChild
    );

    const resetSurface = (animate) => {
      if (!surface) return;
      if (animate) {
        surface.style.transition = 'transform .22s cubic-bezier(.2, .8, .2, 1)';
        surface.style.transform = '';
        const node = surface;
        window.setTimeout(() => { node.style.transition = ''; }, 240);
      } else {
        surface.style.transition = '';
        surface.style.transform = '';
      }
      surface.classList.remove('dragging');
      surface = null;
    };

    const begin = (x, y) => {
      if (state.loading || !state.dates.length) return;
      active = true;
      decided = null;
      dx = 0;
      startX = x;
      startY = y;
      samples = [];
      remember(x);
      surface = draggableSurface();
    };

    const move = (x, y) => {
      if (!active) return false;
      dx = x - startX;
      const dy = y - startY;
      if (!decided) {
        if (Math.abs(dx) < START_SLOP && Math.abs(dy) < START_SLOP) return false;
        decided = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
        if (decided === 'y') {
          active = false;
          resetSurface(false);
          return false;
        }
        if (surface) {
          surface.style.transition = 'none';
          surface.classList.add('dragging');
        }
      }
      if (decided !== 'x') return false;
      remember(x);
      const limit = (element.clientWidth || 360) * 0.45;
      const offset = Math.sign(dx) * Math.min(Math.abs(dx) * DRAG_GAIN, limit);
      if (surface) surface.style.transform = `translateX(${offset}px)`;
      return true;
    };

    const finish = () => {
      if (!active) return;
      active = false;
      const moved = decided === 'x';
      const travel = dx;
      const velocity = velocityOf();
      decided = null;
      samples = [];
      // Decyzję podejmuje czysta funkcja: pokonany próg odległości **albo**
      // szybkie pchnięcie przy ruchu co najmniej `SWIPE_MIN` (APK 1.8).
      const forward = moved
        ? ScheduleViews.swipeForward({
          deltaX: travel,
          threshold: SWIPE_THRESHOLD,
          velocity,
          velocityThreshold: SWIPE_VELOCITY,
          min: SWIPE_MIN,
        })
        : null;
      // Za krótki gest albo drgnięcie — treść wraca na miejsce.
      if (forward === null) {
        resetSurface(true);
        return;
      }
      // Decyzja: zostawiamy przesunięcie palca i przekazujemy je animacji
      // przejścia, żeby ruch nie zawrócił w połowie (to było „skakanie”).
      const limit = (element.clientWidth || 360) * 0.45;
      state.swipeOffset = Math.sign(travel) * Math.min(Math.abs(travel) * DRAG_GAIN, limit);
      surface = null;
      // Po przeciągnięciu przeglądarka wygeneruje jeszcze `click` na karcie —
      // tłumimy go, żeby gest nie otwierał przypadkiem szczegółów zajęć.
      guardClick = Date.now() + 350;
      swipeTo(forward);
    };

    const cancel = () => {
      if (!active) return;
      active = false;
      decided = null;
      resetSurface(true);
    };

    // Dotyk: zdarzenia touch są odporne na `pointercancel`, które przeglądarka
    // wysyła, gdy uzna gest za przewijanie listy.
    element.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) return cancel();
      if (event.target.closest('.week-scroll')) return;
      begin(event.touches[0].clientX, event.touches[0].clientY);
    }, { passive: true });

    element.addEventListener('touchmove', (event) => {
      if (event.touches.length !== 1) return;
      if (move(event.touches[0].clientX, event.touches[0].clientY) && event.cancelable) {
        event.preventDefault();
      }
    }, { passive: false });

    element.addEventListener('touchend', finish, { passive: true });
    element.addEventListener('touchcancel', cancel, { passive: true });

    // Mysz i rysik: to samo zachowanie, żeby dało się sprawdzić gest na komputerze.
    element.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      if (event.target.closest('.week-scroll')) return;
      begin(event.clientX, event.clientY);
    }, { passive: true });

    element.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      if (event.buttons === 0) return;
      if (move(event.clientX, event.clientY)) {
        document.body.style.userSelect = 'none';
      }
    }, { passive: true });

    const pointerEnd = () => {
      document.body.style.userSelect = '';
      finish();
    };
    element.addEventListener('pointerup', pointerEnd, { passive: true });
    element.addEventListener('pointercancel', () => {
      document.body.style.userSelect = '';
      cancel();
    }, { passive: true });

    // Faza przechwytywania: zablokuj klik zaraz po geście, zanim dojdzie do kart.
    element.addEventListener('click', (event) => {
      if (Date.now() >= guardClick) return;
      event.stopPropagation();
      event.preventDefault();
    }, true);
  }

  function attachPullToRefresh(element) {
    let startY = null;
    let distance = 0;
    const indicator = $('pullIndicator');
    const ring = indicator ? indicator.firstElementChild : null;

    element.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || element.scrollTop > 0) return;
      startY = event.clientY;
      distance = 0;
    }, { passive: true });

    element.addEventListener('pointermove', (event) => {
      if (startY === null) return;
      distance = Math.max(0, event.clientY - startY);
      if (indicator && ring) {
        if (distance > 8) {
          indicator.hidden = false;
          const progress = Math.min(1, distance / 90);
          ring.style.transform = `scale(${(0.6 + progress * 0.6).toFixed(2)}) rotate(${Math.round(progress * 220)}deg)`;
        } else {
          indicator.hidden = true;
        }
      }
    }, { passive: true });

    const finish = () => {
      if (startY === null) return;
      const pulled = distance > 80 && element.scrollTop <= 0;
      startY = null;
      distance = 0;
      if (indicator) indicator.hidden = true;
      if (pulled) load(true);
    };

    element.addEventListener('pointerup', finish, { passive: true });
    element.addEventListener('pointercancel', finish, { passive: true });
  }

  function bindEvents() {
    $('btnRefresh').addEventListener('click', () => load(true));
    // Plan zmienia się **tylko** z Opcji (Plan → „Wybór planu”): w nagłówku nie
    // ma już skrótu, żeby nie konkurował z odświeżaniem (APK 1.8).
    $('btnOptions').addEventListener('click', () => openSettings('root'));

    $('tabs').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-view]');
      if (button) selectView(button.dataset.view);
    });

    viewport().addEventListener('click', onViewportClick);
    attachSwipe(viewport());
    attachPullToRefresh(viewport());

    $('sheetScrim').addEventListener('click', closeSheet);
    $('dialogScrim').addEventListener('click', closeDialog);

    $('sheetBody').addEventListener('click', (event) => {
      const target = event.target.closest(`[data-settings-page],[data-settings-group],[data-settings-style],`
        + '[data-plan-refresh],[data-close-sheet],[data-whats-new-ok],[data-install-guide],[data-feedback-kind],'
        + '[data-add-file],[data-add-link],[data-file-download],[data-file-delete],[data-link-delete],[data-materials-ack],'
        + '[data-note-save],[data-note-chip],[data-note-clear],'
        + '[data-update-check],[data-update-apply],[data-update-toggle],'
        + `${PICK_SELECTOR},`
        + '[data-add-plan-open],[data-add-plan-skip],[data-add-plan-apply],[data-plan-pick],[data-plan-remove]');
      if (!target) return;

      // --- ekran wyboru (ten sam co na ekranie powitalnym) ---
      if (pickerClick(target)) return;

      // --- grupy w planie ---
      if (target.hasAttribute('data-add-plan-open')) {
        // `sheetKind` mówi, czy przyszliśmy z Opcji → Plan (wtedy tam wracamy).
        openAddPlanSheet({ fromSettings: state.sheetKind === 'settings' });
        return;
      }
      if (target.hasAttribute('data-add-plan-skip')) {
        closeAddPlanSheet();
        return;
      }
      if (target.hasAttribute('data-add-plan-apply')) {
        applyPendingGroups();
        return;
      }
      if (target.dataset.planPick) {
        const id = target.dataset.planPick;
        const pending = state.wizard.pendingAdd || new Set();
        if (pending.has(id)) pending.delete(id);
        else pending.add(id);
        state.wizard.pendingAdd = pending;
        renderAddPlanSheet();
        return;
      }
      if (target.dataset.planRemove) {
        removePlanGroup(target.dataset.planRemove);
        if (state.sheetKind === 'settings') renderSettings({ keepScroll: true });
        return;
      }

      if (target.hasAttribute('data-whats-new-ok')) {
        closeSheet();
        return;
      }
      if (target.hasAttribute('data-install-guide')) {
        showInstallGuide();
        return;
      }
      if (target.dataset.feedbackKind) {
        const kind = FEEDBACK_KINDS.find((item) => item.id === target.dataset.feedbackKind);
        if (kind) showFeedbackDialog(kind);
        return;
      }
      if (target.hasAttribute('data-update-check')) {
        checkForUpdate();
        return;
      }
      if (target.hasAttribute('data-update-apply')) {
        applyUpdate();
        return;
      }
      if (target.hasAttribute('data-update-toggle')) {
        state.update.autoCheck = !state.update.autoCheck;
        writePrefs({ autoUpdateCheck: state.update.autoCheck });
        refreshSettings();
        return;
      }
      if (target.hasAttribute('data-plan-refresh')) {
        closeSheet();
        load(true);
        return;
      }
      if (target.dataset.settingsPage) {
        // Strony panelu zmieniają się w miejscu — arkusz zostaje otwarty.
        goSettingsPage(target.dataset.settingsPage);
        return;
      }
      if (target.dataset.settingsGroup) {
        closeSheet();
        selectGroup(target.dataset.settingsGroup);
        return;
      }
      if (target.dataset.settingsStyle) {
        // Zmiana stylu działa od razu, bez zamykania panelu (jak w APK 1.7).
        selectStyle(target.dataset.settingsStyle);
        refreshSettings();
        return;
      }
      if (target.hasAttribute('data-close-sheet')) {
        closeSheet();
        return;
      }
      if (target.hasAttribute('data-note-save')) {
        const input = $('noteInput');
        saveNote(input ? input.value : '');
        return;
      }
      if (target.dataset.noteChip) {
        // Chip zapisuje od razu — jedno dotknięcie zamiast „wpisz i zapisz”.
        syncNoteEditor(target.dataset.noteChip);
        saveNote(target.dataset.noteChip);
        return;
      }
      if (target.hasAttribute('data-note-clear')) {
        syncNoteEditor('');
        saveNote('');
        return;
      }
      if (target.hasAttribute('data-add-file')) {
        $('filePicker').click();
        return;
      }
      if (target.hasAttribute('data-add-link')) {
        showAddLinkDialog();
        return;
      }
      if (target.dataset.materialsAck !== undefined) {
        materials.error = null;
        renderMaterials();
        return;
      }
      if (target.dataset.fileDelete) {
        const file = materials.files.find((item) => item.id === target.dataset.fileDelete);
        if (file) confirmDelete(file.name, () => { deleteFile(file.id); return false; });
        return;
      }
      if (target.dataset.linkDelete) {
        const link = materials.links.find((item) => item.id === target.dataset.linkDelete);
        if (link) confirmDelete(link.title || link.url, () => { deleteLink(link.id); return false; });
      }
    });

    // Pole „Szukaj kierunku” filtruje tylko listę (nie cały ekran wyboru),
    // więc fokus i wpisany tekst zostają przy każdej literze. Nasłuch wisi na
    // `document`, bo to samo pole jest na ekranie powitalnym i w Opcjach.
    document.addEventListener('input', (event) => {
      if (!event.target.matches('#wizSearch')) return;
      state.wizard.query = event.target.value;
      renderKierunekList();
    });

    // Notatka: Enter zapisuje, tak jak przycisk „Zapisz”. Escape zostaje dla
    // zamykania arkusza, żeby nie zabierać standardowego zachowania.
    document.addEventListener('keydown', (event) => {
      if (!event.target.matches('#noteInput') || event.key !== 'Enter') return;
      event.preventDefault();
      saveNote(event.target.value);
    });

    document.addEventListener('keydown', (event) => {
      if (!event.target.matches('#wizSearch')) return;
      // Pierwszy Escape czyści wpisane litery, drugi zamyka arkusz (niżej).
      if (event.key === 'Escape' && state.wizard.query) {
        event.stopPropagation();
        state.wizard.query = '';
        event.target.value = '';
        renderKierunekList();
        return;
      }
      // Enter bierze pierwszy wynik — na telefonie to klawisz „szukaj”.
      if (event.key !== 'Enter') return;
      const first = document.querySelector('[data-wiz-kierunek]');
      if (!first) return;
      event.preventDefault();
      wizChooseKierunek(first.dataset.wizKierunek);
    });

    $('filePicker').addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (file) uploadFile(file);
    });

    // Ekran powitalny
    // Wybór planu leży **poza arkuszem**, więc ma własny nasłuch — ten sam
    // `pickerClick`, co ekran w Opcjach (wcześniej klikały się tylko wiersze
    // w arkuszu, a na telefonie wybór kierunku po prostu nie reagował).
    $('welcomePicker').addEventListener('click', (event) => {
      const target = event.target.closest(PICK_SELECTOR);
      if (target) pickerClick(target);
    });

    $('welcomeManual').addEventListener('input', (event) => {
      const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
      if (digits !== event.target.value) event.target.value = digits;
      $('welcomeManualGo').disabled = digits.length < 2;
    });

    $('welcomeManualGo').addEventListener('click', () => {
      const value = $('welcomeManual').value;
      if (value.length < 2) return;
      selectGroup(value);
    });

    // Ręczny numer grupy chowamy za linkiem — na starcie ma być widać wybór.
    $('welcomeManualToggle').addEventListener('click', () => {
      const box = $('welcomeManualBox');
      const open = box.hidden;
      box.hidden = !open;
      $('welcomeManualToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
      $('welcomeManualToggle').textContent = open ? 'Schowaj numer grupy' : 'Mam numer grupy';
      if (open) $('welcomeManual').focus();
    });

    // Pułapka fokusa: Tab w otwartym oknie nie wychodzi na stronę pod spodem.
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      if (!$('dialog').hidden) {
        trapFocus($('dialog'), event);
        return;
      }
      if (!$('sheet').hidden) trapFocus($('sheet'), event);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!$('dialog').hidden) {
        closeDialog();
        return;
      }
      if ($('sheet').hidden) return;
      // Na stronie tematycznej „Escape” wraca do spisu treści, a dopiero drugie
      // naciśnięcie zamyka panel — jak systemowy „wstecz” w APK 1.7.
      if (state.sheetKind === 'settings' && state.settingsPage !== 'root') {
        goSettingsPage('root');
        return;
      }
      closeSheet();
    });

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        applyStyle(state.styleId);
        positionTabIndicator(false);
        // Po zwężeniu okna nazwy przedmiotów i prostokąt dnia liczą się od nowa:
        // bez tego zostawały w rozmiarze sprzed obrotu ekranu.
        if (state.view === 'day') {
          const highlight = document.querySelector('.strip-highlight');
          const selected = document.querySelector('.strip-day.is-selected');
          if (highlight && selected) {
            // Bez animacji, ale zapamiętany prostokąt musi znać nowy układ —
            // inaczej następne przejście startowałoby ze starej pozycji.
            state.stripHighlight = positionStripHighlight(highlight, selected, null);
          }
        }
        fitSubjects(viewport());
        fitNotes(viewport());
      }, 120);
    });

    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    if (darkQuery.addEventListener) {
      darkQuery.addEventListener('change', () => {
        if (normalizeStyle(state.styleId) === 'auto') applyStyle(state.styleId);
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      state.today = todayIso();
      // Materiały mogły dojść z innego telefonu — spinacze odświeżamy zawsze
      // (odpowiednik `refreshAttachmentIndex()` w `onResume` z APK).
      loadAttachmentIndex();
      if (Date.now() - state.lastLoadAt > RESUME_REFRESH_MS) load(false);
      else {
        render();
        // Powrót do karty to dobra chwila na lekkie „czy plan się zmienił”
        // — odpowiednik `RefreshWorker` z APK, tylko bez czekania na interwał.
        checkPlanVersion();
      }
    });

    // Sieć wróciła po trybie offline — dociągnij świeży plan w tle.
    window.addEventListener('online', () => {
      if (state.offline) load(false);
      // Wejścia odłożone w trybie offline dogrywamy dopiero teraz.
      if (visitTracker) visitTracker.flush();
    });

    // Plan u uczelni zmienia się w ciągu dnia, a aplikacja bywa otwarta
    // godzinami. Bez tego sprawdzenia użytkownik widziałby stary plan do
    // przeładowania strony (APK ma w tym miejscu `RefreshWorker`).
    window.setTimeout(() => { checkPlanVersion(); }, VERSION_POLL_START_MS);
    window.setInterval(() => { checkPlanVersion(); }, VERSION_POLL_MS);

    // Plakietka „teraz” na kartach bez przeskakiwania listy. Status planu
    // („zaktualizowano …”) jest teraz w arkuszu „Opcje”, więc odświeżamy też
    // jego treść, jeśli jest otwarty.
    setInterval(() => {
      state.nowMinute = new Date().getHours() * 60 + new Date().getMinutes();
      const key = state.slots
        .filter((slot) => slot.date === state.today && isOngoing(slot))
        .map((slot) => slot.id)
        .join('|');
      if (key !== state.ongoingKey) render();
    }, 30000);
  }

  // --------------------------------------------------------- licznik wejść
  //
  // Jedno otwarcie aplikacji = jedno `POST /api/visit`. Kolejkę i dogrywanie
  // po powrocie sieci trzyma `visit-ping.js` (`PlanVisits`) — dzięki temu ten
  // sam kod testuje `node scripts/self-test.js`, bez przeglądarki.
  // Strona z wynikiem: `plany.mati-it.pl/licznik`.
  let visitTracker = null;

  function createVisitTracker() {
    const api = window.PlanVisits;
    if (!api) return null;

    return api.createTracker({
      storage: api.safeStorage(window),
      source: api.detectSource(window),
      isOnline: () => navigator.onLine !== false,
      post: async (source) => {
        try {
          const res = await fetch('/api/visit', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ source }),
            credentials: 'same-origin',
            keepalive: true,
          });
          // 4xx to błąd trwały (zła konfiguracja) — nie kolejkujemy go w kółko.
          return res.ok || (res.status >= 400 && res.status < 500);
        } catch {
          return false;
        }
      },
    });
  }

  // ------------------------------------------------------------ 13. Start

  function readQuery() {
    const params = new URLSearchParams(window.location.search);
    return {
      group: params.get('group'),
      groups: params.get('groups'),
      ay: params.get('ay'),
      style: params.get('style'),
      view: params.get('view'),
    };
  }

  function boot() {
    const prefs = readPrefs();
    const query = readQuery();

    const queryGroups = String(query.groups || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => /^\d{2,8}$/.test(id));
    const storedGroups = Array.isArray(prefs.planGroups)
      ? prefs.planGroups.map(String).filter((id) => /^\d{2,8}$/.test(id))
      : [];
    // Kolejność: link `?groups=`, potem `?group=` (stary link), potem pamięć.
    state.planGroups = queryGroups.length
      ? queryGroups
      : (query.group ? [String(query.group)] : storedGroups);
    state.group = state.planGroups[0] || String(query.group || prefs.groupId || '21188').trim() || '21188';
    if (!state.planGroups.length) state.planGroups = [state.group];
    if (prefs.site && typeof prefs.site === 'object') {
      state.site = { ...state.site, ...prefs.site };
    }
    // Wybór w pickerze i rok akademicki planu. `?group=` bez `?ay=` to stary
    // link — wymiary dobierzemy z katalogu po jego wczytaniu.
    if (prefs.sel && typeof prefs.sel === 'object') {
      for (const key of ['nabor', 'field', 'spec', 'year', 'degree', 'mode', 'sem']) {
        if (typeof prefs.sel[key] === 'string') state.sel[key] = prefs.sel[key];
      }
    }
    // Odnośnik z grupą jest ważniejszy od zapamiętanego wyboru: link ma otwierać
    // dokładnie tę grupę, więc wymiary bierzemy z katalogu, a nie z pamięci.
    if (query.group || query.groups) {
      state.sel = { nabor: '', field: '', spec: '', year: '', degree: '', mode: '', sem: '' };
    }
    const queryAy = /^\d{4}$/.test(String(query.ay || '')) ? String(query.ay) : null;
    // `?group=` bez `?ay=` to stary link — plan ma być bieżący, więc NIE bierzemy
    // zapisanego roku akademickiego z poprzedniej grupy.
    const storedAy = /^\d{4}$/.test(String(prefs.ay || '')) ? String(prefs.ay) : null;
    state.ay = queryAy || (query.group || query.groups ? null : storedAy);
    // Styl zapisany przez **starą** wersję (ten sam `STORAGE_KEY`) obowiązuje
    // tylko wtedy, gdy pochodzi z tej powłoki — inaczej po przebudowie wracał
    // czyjś dawny motyw zamiast domyślnego Liquid Glass 2. `?style=` nadal
    // wygrywa, bo to świadomy odnośnik.
    const styleFromThisShell = Number(prefs.styleEpoch) === STYLE_EPOCH;
    state.styleId = normalizeStyle(
      query.style || (styleFromThisShell ? prefs.styleId || prefs.theme : null) || DEFAULT_STYLE,
    );
    if (!styleFromThisShell) {
      // Nadpisujemy też zapisany motyw, inaczej kolejne uruchomienie wróciłoby
      // do wyboru ze starej wersji.
      writePrefs(query.style
        ? { styleEpoch: STYLE_EPOCH }
        : { styleEpoch: STYLE_EPOCH, styleId: state.styleId, theme: state.styleId, themePicked: false });
    }
    // Motyw „Własny”: dwa kolory użytkownika. Czytamy je **przed** `applyStyle`,
    // bo paleta „custom” liczy się dopiero z nich.
    state.custom = normalizeCustom(prefs.customPrimary, prefs.customBackground);
    // Aplikacja otwiera się na dniu — zawsze. Wybór kafelka jest stanem sesji,
    // nie ustawieniem: zapamiętany „Semestr” wracał po restarcie i plan startował
    // na widoku, którego nikt nie chciał (APK 1.7). `?view=` zostaje, bo to
    // świadomy odnośnik, a nie pamięć poprzedniej sesji.
    state.view = ['day', 'week', 'month', 'semester'].includes(query.view) ? query.view : 'day';
    // Link z planem (`?group=` albo `?groups=`) znaczy „ten plan jest wybrany” —
    // bez tego świeża przeglądarka otwierała kreator i kasowała parametr
    // z adresu, mimo że aplikacja sama takie adresy produkuje.
    state.needsGroup = !prefs.hasChosenGroup && !query.group && !queryGroups.length;
    state.today = todayIso();
    state.nowMinute = new Date().getHours() * 60 + new Date().getMinutes();
    state.update.lastCheck = Number(prefs.lastUpdateCheck) || 0;
    state.update.autoCheck = prefs.autoUpdateCheck !== false;
    // Ostatnio znane wydanie APK — kafelek w Opcjach pokazuje wersję od razu,
    // a `loadApkInfo()` odświeża ją w tle.
    state.apk.info = prefs.apkInfo && prefs.apkInfo.versionName ? prefs.apkInfo : null;

    if (query.group || queryGroups.length) {
      // Plan z adresu jest świadomym wyborem — zapisujemy go, żeby odświeżenie
      // strony (już bez parametrów) pokazało ten sam plan, a nie kreator.
      writePrefs({
        groupId: state.group,
        planGroups: state.planGroups,
        hasChosenGroup: true,
      });
    }

    applyStyle(state.styleId);
    bindEvents();

    // Plan z pamięci rysujemy PRZED pierwszym malowaniem — ikona otwiera plan
    // od razu, bez migającego ekranu „Wczytuję…”.
    const cached = readCachedPlan();
    if (cached) applyPlan(cached.plan, cached.savedAt);
    render();
    load(false);
    maybeShowWhatsNew();
    // Instrukcję instalacji pokazujemy po starcie planu i chwilę po „Co nowego”:
    // dwa okna naraz to zły pierwszy ekran, więc pierwszeństwo ma nowe wydanie.
    window.setTimeout(() => { maybeShowInstallGuide(); }, 2200);
    // Wydanie APK sprawdzamy po planie — kafelek w Opcjach ma wersję i rozmiar.
    window.setTimeout(() => { loadApkInfo(); }, 1200);

    registerServiceWorker();

    // Wejście liczymy po starcie planu — POST nie może opóźniać pierwszego
    // malowania. `record()` tylko dopisuje do kolejki, wysyłka idzie w tle.
    visitTracker = createVisitTracker();
    if (visitTracker) visitTracker.record();
  }

  /**
   * Service worker + śledzenie nowej wersji. To odpowiednik `UpdateManager`
   * z APK: wersja pobiera się sama, a arkusz „Opcje” pokazuje, że czeka.
   */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // `updateViaCache: 'none'` — Cloudflare nadaje sw.js własny Cache-Control,
    // a bez tego przeglądarka mogłaby sprawdzać aktualizację na starym pliku.
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      if (registration.waiting) markUpdateAvailable();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            markUpdateAvailable();
          }
        });
      });
      if (state.update.autoCheck) {
        window.setTimeout(() => { checkForUpdate(); }, 1500);
      }
    }).catch(() => undefined);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
