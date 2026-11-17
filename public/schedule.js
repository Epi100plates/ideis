'use strict';

/* ============================================================================
   Logika domenowa — port `domain/Format.kt` i `domain/ScheduleViews.kt`.

   Zero DOM i zero `fetch`: dzięki temu te same funkcje testuje
   `node scripts/self-test.js` (polska odmiana, siatki miesięcy, kolumny
   nakładających się zajęć), a `app.js` tylko je wyświetla.
   ========================================================================== */

(function (global) {
// ---------------------------------------------------------------- Format

const WEEKDAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Niedz'];
const WEEKDAYS_FULL = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const MONTHS_NOMINATIVE = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const MONTHS_GENITIVE = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

const pad2 = (n) => String(n).padStart(2, '0');

/** Polska odmiana liczebnika: 1 plik, 3 pliki, 5 plików (jak `Format.plural` w APK). */
function plural(count, one, few, many) {
  if (count === 1) return `1 ${one}`;
  const mod100 = count % 100;
  if (mod100 >= 12 && mod100 <= 14) return `${count} ${many}`;
  const mod10 = count % 10;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

function parseIso(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toIso(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(iso, days) {
  const date = parseIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/** 1 = poniedziałek … 7 = niedziela (DayOfWeek.value). */
function dayOfWeek(iso) {
  const wd = parseIso(iso).getDay();
  return wd === 0 ? 7 : wd;
}

const todayIso = () => toIso(new Date());

const Format = {
  weekdayShort: (iso) => WEEKDAYS[dayOfWeek(iso) - 1],
  weekdayFull: (iso) => WEEKDAYS_FULL[dayOfWeek(iso) - 1],
  dateShort(iso) {
    const date = parseIso(iso);
    return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}`;
  },
  dayTitle: (iso) => `${Format.weekdayShort(iso)} ${Format.dateShort(iso)}`,
  dateWithYear(iso) {
    const date = parseIso(iso);
    return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]} ${date.getFullYear()}`;
  },
  dayLong: (iso) => `${Format.weekdayFull(iso)}, ${Format.dateWithYear(iso)}`,
  relativeDay(iso, today) {
    if (iso === today) return 'dziś';
    if (iso === addDays(today, 1)) return 'jutro';
    return null;
  },
  clock: (minutes) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`,
  minutesLabel(total) {
    if (total <= 0) return '0 min';
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    if (hours > 0 && minutes > 0) return `${hours} h ${minutes} min`;
    if (hours > 0) return `${hours} h`;
    return `${minutes} min`;
  },
  duration(minutes) {
    if (minutes <= 0) return '';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours > 0 && rest > 0) return `${hours}h ${rest}m`;
    if (hours > 0) return `${hours}h`;
    return `${rest}m`;
  },
  modeLabel(mode) {
    if (!mode) return null;
    if (/zdaln/i.test(mode)) return 'zdalnie';
    if (/stacjonarn/i.test(mode)) return 'stacjonarnie';
    return mode;
  },
  updatedLabel(savedAt, now) {
    if (!savedAt) return '';
    const minutes = Math.max(0, Math.floor((now - savedAt) / 60000));
    if (minutes < 1) return 'zaktualizowano przed chwilą';
    if (minutes < 60) return `zaktualizowano ${minutes} min temu`;
    if (minutes < 24 * 60) return `zaktualizowano ${Math.floor(minutes / 60)} godz. temu`;
    if (minutes < 48 * 60) return 'zaktualizowano wczoraj';
    return `zaktualizowano ${Math.floor(minutes / (24 * 60))} dni temu`;
  },
  /** Format.agoLabel — „przed chwilą”, „5 min temu”, „wczoraj”, „3 dni temu”. */
  agoLabel(millis, now) {
    if (!millis || millis <= 0) return null;
    const minutes = Math.max(0, Math.floor((now - millis) / 60000));
    if (minutes < 1) return 'przed chwilą';
    if (minutes < 60) return `${minutes} min temu`;
    if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} godz. temu`;
    if (minutes < 48 * 60) return 'wczoraj';
    return `${Math.floor(minutes / (24 * 60))} dni temu`;
  },
  stale: (savedAt, now) => savedAt > 0 && now - savedAt > 24 * 60 * 60 * 1000,
  classesCount(count) {
    if (count === 1) return '1 zajęcie';
    const mod100 = count % 100;
    const mod10 = count % 10;
    if (mod100 >= 12 && mod100 <= 14) return `${count} zajęć`;
    if (mod10 >= 2 && mod10 <= 4) return `${count} zajęcia`;
    return `${count} zajęć`;
  },
  /** Liczba materiałów: „1 plik”, „3 pliki”, „5 plików”. */
  filesCount: (count) => plural(count, 'plik', 'pliki', 'plików'),
  /** Liczba linków: „1 link”, „3 linki”, „5 linków”. */
  linksCount: (count) => plural(count, 'link', 'linki', 'linków'),
  fileSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const kb = bytes / 1024;
    if (bytes < 1024) return `${bytes} B`;
    if (kb < 1024) return `${kb.toFixed(1).replace('.', ',')} kB`;
    return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
  },
  isoDateShort(iso) {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}`;
  },
  monthLabel(yearMonth) {
    const [year, month] = yearMonth.split('-').map(Number);
    return `${MONTHS_NOMINATIVE[month - 1]} ${year}`;
  },
  dateRange(from, to) {
    if (from === to) return Format.dayTitle(from);
    const a = parseIso(from);
    const b = parseIso(to);
    if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
      return `${a.getDate()}–${b.getDate()} ${MONTHS_GENITIVE[b.getMonth()]} ${b.getFullYear()}`;
    }
    if (a.getFullYear() === b.getFullYear()) {
      return `${a.getDate()} ${MONTHS_GENITIVE[a.getMonth()]} – `
        + `${b.getDate()} ${MONTHS_GENITIVE[b.getMonth()]} ${b.getFullYear()}`;
    }
    return `${Format.dateShort(from)}–${Format.dateShort(to)}`;
  },
  shortGroupName(name) {
    const match = /(?:Wyk|Ćw|Lab|Sem|Proj)[^,]*/.exec(String(name || ''));
    if (!match) return name;
    return match[0].replace(/\s+[NS]$/, '').trim();
  },
};

// ---------------------------------------------------- ScheduleViews (port)

const ScheduleViews = {
  /**
   * Czy przesunięcie okresu idzie do przodu? Jeden parse dla strzałek (`1`/`-1`)
   * i gestu (`true`/`false`) — wcześniej `-1` było „prawdą”, więc „‹” w
   * tygodniu i miesiącu przesuwało okres **do przodu**, a animacja zawsze
   * wjeżdżała z tej samej strony.
   */
  isForward(value) {
    return value === true || Number(value) > 0;
  },
  weekStart(iso) {
    return addDays(iso, -(dayOfWeek(iso) - 1));
  },
  weekDates(anchor) {
    const start = ScheduleViews.weekStart(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  },
  monthWeeks(yearMonth) {
    const [year, month] = yearMonth.split('-').map(Number);
    const first = new Date(year, month - 1, 1);
    const leading = ((first.getDay() + 6) % 7);
    const length = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = 0; i < leading; i += 1) cells.push(null);
    for (let day = 1; day <= length; day += 1) {
      cells.push(`${year}-${pad2(month)}-${pad2(day)}`);
    }
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      const row = cells.slice(i, i + 7);
      while (row.length < 7) row.push(null);
      rows.push(row);
    }
    return rows;
  },
  months(dates) {
    if (!dates.length) return [];
    const from = dates[0].slice(0, 7);
    const to = dates[dates.length - 1].slice(0, 7);
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    const count = (ty - fy) * 12 + (tm - fm);
    return Array.from({ length: count + 1 }, (_, i) => {
      const total = (fm - 1) + i;
      const year = fy + Math.floor(total / 12);
      const month = (total % 12) + 1;
      return `${year}-${pad2(month)}`;
    });
  },
  monthOf: (iso) => iso.slice(0, 7),
  daysInMonth(dates, yearMonth) {
    return dates.filter((iso) => iso.slice(0, 7) === yearMonth);
  },
  neighborDate(dates, current, forward) {
    if (forward) {
      const next = dates.filter((iso) => iso > current);
      return next.length ? next[0] : null;
    }
    const prev = dates.filter((iso) => iso < current);
    return prev.length ? prev[prev.length - 1] : null;
  },
  initialDay(dates, today) {
    if (!dates.length) return null;
    if (dates.indexOf(today) >= 0) return today;
    const after = dates.find((iso) => iso > today);
    return after || dates[dates.length - 1];
  },
  /**
   * Kierunek gestu w bok — port `ScheduleViews.swipeForward` z APK 1.8.
   *
   * Gest jest czuły na dwa sposoby: wystarczy pokonanie progu odległości
   * (`threshold`) **albo** krótkie, ale szybkie pchnięcie (prędkość ≥
   * `velocityThreshold`) przy ruchu co najmniej `min`. Wcześniej liczyła się
   * tylko odległość, więc zwykłe „pstryknięcie” palcem przepadało.
   *
   * Zwraca `true` = następny okres (palec w lewo), `false` = poprzedni,
   * `null` = przypadkowe muśnięcie. `min` chroni przed drgnięciem palca przy
   * dotknięciu.
   */
  swipeForward({
    deltaX,
    threshold,
    velocity = 0,
    velocityThreshold = Infinity,
    min = 0,
  }) {
    const travelled = Math.abs(deltaX);
    if (travelled < Math.max(0, min)) return null;
    const fastFlick = Math.abs(velocity) >= velocityThreshold;
    if (travelled < threshold && !fastFlick) return null;
    const direction = travelled > 0 ? deltaX : velocity;
    return direction < 0;
  },
  totalMinutes(classes) {
    return classes.reduce((sum, slot) => sum + slot.durationMinutes, 0);
  },
  /** Port layoutDay: bloki w jednym klastrze dzielą szerokość. */
  timetable(classes) {
    if (!classes.length) return [];
    const sorted = classes.slice().sort((a, b) => {
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      return b.endMinutes - a.endMinutes;
    });
    const result = [];
    let cluster = [];
    let clusterEnd = -1;

    const flush = () => {
      if (!cluster.length) return;
      const columnEnds = [];
      const placed = [];
      cluster.forEach((slot) => {
        let column = -1;
        for (let i = 0; i < columnEnds.length; i += 1) {
          if (columnEnds[i] <= slot.startMinutes) {
            columnEnds[i] = slot.endMinutes;
            column = i;
            break;
          }
        }
        if (column === -1) {
          columnEnds.push(slot.endMinutes);
          column = columnEnds.length - 1;
        }
        placed.push({ slot, column });
      });
      const columns = Math.max(1, columnEnds.length);
      placed.forEach(({ slot, column }) => {
        result.push({
          slot,
          startMinute: slot.startMinutes,
          endMinute: slot.endMinutes,
          column,
          columns,
        });
      });
      cluster = [];
      clusterEnd = -1;
    };

    sorted.forEach((slot) => {
      if (clusterEnd !== -1 && slot.startMinutes >= clusterEnd) flush();
      cluster.push(slot);
      clusterEnd = Math.max(clusterEnd, slot.endMinutes);
    });
    flush();
    return result;
  },
  hourBounds(classes) {
    if (!classes.length) return { first: 7, last: 21 };
    const minStart = Math.min(...classes.map((slot) => Math.floor(slot.startMinutes / 60)));
    const maxEnd = Math.max(...classes.map((slot) => (
      slot.endMinutes % 60 > 0 ? Math.floor(slot.endMinutes / 60) + 1 : Math.floor(slot.endMinutes / 60)
    )));
    return {
      first: Math.max(6, minStart),
      last: Math.min(23, Math.max(maxEnd, minStart + 3)),
    };
  },
};


// ---------------------------------------------------------------- „Co nowego”

/**
 * Lista zmian każdego wydania powłoki — port `domain/WhatsNew.kt` z APK 1.12.
 *
 * Trzymamy ją **w aplikacji**, nie na serwerze: ekran „Co nowego” działa bez
 * sieci i zawsze pokazuje to samo, niezależnie od tego, czy manifest
 * aktualizacji jest dostępny. Nowe wpisy dopisujemy z góry przy każdym
 * podbiciu `APP_VERSION` w `app.js`.
 */
const WHATS_NEW = [
  {
    version: 'v38',
    title: 'Arkusze zjeżdżają w dół pod palcem',
    items: [
      'Pasek na górze arkusza (Opcje, szczegóły zajęć, notatka, „Co nowego”) działa jak uchwyt: przeciągnij w dół, żeby go schować',
      'Puszczenie poniżej progu albo szybkim ruchem zamyka arkusz; krótkie drgnięcie wraca na miejsce',
      'Gdy treść jest przewinięta na samą górę, wystarczy pociągnąć w dół w dowolnym miejscu arkusza',
      'Działa palcem, rysikiem i myszą — wcześniej pasek był tylko ozdobą i arkusz zamykał się wyłącznie dotknięciem tła',
    ],
  },
  {
    version: 'v37',
    title: 'Picker kolorów, który wreszcie tłumaczy, co robi',
    items: [
      'Opcje → Wygląd → „Gotowe motywy”: jedno dotknięcie daje gotową parę kolorów (Fiolet na czerni, Papier, Lawenda…)',
      'Pod wierszem koloru są próbki: osiem akcentów i sześć teł — wybór „na oko” zamiast wpisywania kodu koloru',
      'Zmiana koloru od razu włącza motyw „Własny” — wcześniej trzeba było zaznaczyć go osobno i kolor „nie działał”',
      'Pod spodem podgląd kafelka w finalnej palecie i zdanie o kontraście: czy akcent został przyciemniony i do jakiej wartości',
    ],
  },
  {
    version: 'v36',
    title: 'Motywy: własne dwa kolory i notatki na kafelkach jak szkło',
    items: [
      'Opcje → Wygląd → „Własny”: wybierz kolor główny (akcent) i kolor tła — reszta motywu dobiera się sama',
      'Jasność motywu wynika z koloru tła, a jasny akcent jest przyciemniany do czytelnego kontrastu',
      'Ta sama para kolorów działa w natywnej aplikacji i w widżetach na pulpicie',
      'Plakietka notatki („Kolos”, „Egzamin”) jest teraz przezroczysta: delikatne podbarwienie akcentem i cienka krawędź zamiast litego prostokąta',
    ],
  },
  {
    version: 'v35',
    title: 'Notatki na kafelkach zajęć: „Kolos”, „Egzamin” — widoczne dla wszystkich',
    items: [
      'Dotknij zajęć, a w szczegółach znajdziesz pole „Notatka na kafelku” (maks. 15 znaków)',
      'Chipy „Kolos” i „Egzamin” zapisują notatkę jednym dotknięciem; „Usuń” ją zdejmuje',
      'Notatka pojawia się na kafelku jako kolorowa plakietka — w kolorze wybranego motywu',
      'Każdy może ją zmienić, bo notatka jest wspólna dla wszystkich, którzy widzą te zajęcia',
    ],
  },
  {
    version: 'v34',
    title: 'Trzy nowe motywy w wersji web: fiolet, róż i połączony — razem 20 stylów',
    items: [
      'Opcje → Wygląd ma nową grupę „Kolorowe”: Fiolet, Róż i Połączony (fiolet przechodzący w róż)',
      'Każdy z nich w wersji ciemnej i jasnej — te same palety, które zna natywna aplikacja',
      'Zmiana działa od razu, bez przeładowania; wybór pamięta się przy następnym wejściu',
    ],
  },
  {
    version: 'v33',
    title: 'Instalacja aplikacji jednym kliknięciem — PWA i natywna wersja z widżetami',
    items: [
      'Chrome i Edge pokazują pasek „Zainstaluj Plan zajęć” nad dolnymi kafelkami — jedno kliknięcie i ikona jest na ekranie głównym',
      'iPhone i iPad: instrukcja Safari (Udostępnij → Dodaj do ekranu początkowego), bo Safari nie ma przycisku instalacji',
      'Na Androidzie okno instalacji mówi też o natywnej aplikacji APK z widżetami (wersja web widżetów nie obsługuje)',
      'Instrukcja jest zawsze w Opcjach → „Zainstaluj aplikację”; przy pierwszym wejściu pokazuje się sama',
    ],
  },
  {
    version: 'v32',
    title: 'Panel Opcji przestał „przesuwać się” kilka razy i kafelki semestru działają',
    items: [
      'Wejście w Opcje animuje się raz — odświeżenie treści (wydanie APK, aktualizacja, zmiana planu) nie powtarza ruchu w bok',
      'Kliknięcie kafelka dnia w widoku „Semestr” otwiera ten dzień w widoku „Dzień”',
    ],
  },
  {
    version: 'v31',
    title: 'Wczytywanie planu trwa do końca — także przy dodawaniu kilku grup',
    items: [
      'Animacja nie znika po pierwszym planie: czeka, aż wczytają się wszystkie wybrane grupy',
      'Przy dodawaniu grup nie mignie już plan bez nowych zajęć',
    ],
  },
  {
    version: 'v30',
    title: 'Plan sam się odświeża, gdy zmieni się u uczelni',
    items: [
      'Aplikacja sprawdza w tle, czy plan się zmienił — bez przeładowania strony',
      'Zmianę rozpoznajemy po treści planu, a nie po numerze wersji, więc widać ją także po restarcie serwera',
      'Link z całym planem (?groups=…) otwiera plan także na nowym urządzeniu',
      'Tydzień i miesiąc startują na tym samym dniu, co widok dnia',
    ],
  },
  {
    version: 'v29',
    title: 'Wybór planu jednym ciągiem: rocznik, potem kolejne kroki same',
    items: [
      'Na starcie widać tylko rocznik — kierunek, specjalność i tryb pojawiają się po kolei',
      'Wybrane kroki zwijają się do jednego wiersza („Rocznik · 2024/2025”) i można je zmienić dotknięciem',
      'Bez paska kroków i bez arkusza — cały wybór dzieje się na jednym ekranie',
      'Numer grupy do wpisania jest schowany pod linkiem „Mam numer grupy”',
    ],
  },
  {
    version: 'v28',
    title: 'Wybór planu od rocznika — z szukaniem kierunku po kilku literach',
    items: [
      'Rocznik → kierunek → specjalność → tryb: rocznik jest pierwszy, bo zawęża listę kierunków',
      'Kierunek można wpisać: „inz” znajduje „Inżynieria…”, bez przewijania całej listy',
      'Specjalność i tryb pokazują się tylko wtedy, gdy jest z czego wybierać — reszta przechodzi sama',
      'Krótsze listy: bez opisów pod spodem, tylko nazwy i rok studiów przy roczniku',
      'Przycisk „Od nowa” czyści wybór i wraca do rocznika',
    ],
  },
  {
    version: 'v26',
    title: 'Kierunek → rocznik → specjalność → tryb, każda lista tylko z dostępnych',
    items: [
      'Rocznik jest przed specjalnością: specjalności pokazują się tylko dla wybranego roku',
      'Roczniki pokazują tylko te, które mają grupy na kierunku — z podpisem roku studiów',
      'Tryby studiów tylko te, które mają grupy w tym roczniku i specjalności',
      'Zaznaczenie widać w kółku, a nie na całym kafelku',
      'Opcje → Plan: „Dodaj grupy do planu”, podpis wyboru i typ zajęć przy każdej grupie',
      'Pasek „Dodaj” jest przyklejony na dole arkusza — nie trzeba przewijać listy do końca',
    ],
  },
  {
    version: 'v23',
    title: 'Wybór planu jak na stronie uczelni + własne grupy ćwiczeń i labów',
    items: [
      'Kierunek → specjalność (z „Pomiń specjalność”) → nabór → tryb studiów',
      'Wydział Studiów Stosowanych we Wrocławiu jest wybierany automatycznie',
      'Specjalności pochodzą z formularza uczelni i są odświeżane przy każdym wyborze',
      'Do planu dodasz swoją grupę ćwiczeniową, laboratoria i lektorat — plan złoży je w jeden',
      'Wykłady są wliczone automatycznie',
      'Opcje → Plan: lista grup w planie i przycisk dodawania grup',
      'Nowy licznik wejść — przeglądarka, PWA i aplikacja Android — pod /licznik',
    ],
  },
  {
    version: 'v22',
    title: 'Cały katalog uczelni: nabór, kierunek, rok, typ i tryb',
    items: [
      'Wybór grupy ma teraz sześć pól — jak w aplikacji Android',
      'Specjalność jest opcjonalna: na 1. roku plan wyświetla się bez niej',
      'Ten sam numer grupy ma inny plan w każdym naborze — dlatego wybór roku jest osobny',
      'Natywna aplikacja na Androida pobiera się z Opcji → „Aplikacja Android”',
    ],
  },
  {
    version: 'v20',
    title: 'Zmiany, zmiany, zmiany...',
    items: [
      'Apka od planu została przebudowana',
      'Teraz działa zdecydowanie płynniej',
      'Przy każdych wykładach jest link do nagrania z nim',
      '**Została wydana NATYWNA wersja na Androida ze wsparciem widżetów!!**',
      'Link do apk — [pobierz plik](/api/app/apk)',
    ],
  },
  {
    version: 'v17',
    items: [
      'Nowa ikona aplikacji — szklany kalendarz w kolorach aplikacji',
      'Ta sama ikona w launcherze i na karcie przeglądarki',
    ],
  },
  {
    version: 'v16',
    items: [
      'Czcionka o 8% mniejsza — bliżej gęstości natywnej aplikacji',
      'Układ bez zmian: odstępy, wysokości kart i promienie zostały te same',
    ],
  },
  {
    version: 'v15',
    items: [
      'Kliknięcie dnia albo zakładki jedzie tą samą animacją co przesuwanie palcem',
      'Stara treść zjeżdża z ekranu, zamiast stać nad nową do końca ruchu',
    ],
  },
  {
    version: 'v14',
    items: [
      'Podświetlenie dnia w górnym pasku jedzie z aktualnego kafelka, nie z lewej krawędzi',
      'Przesuwanie dni nie odsłania już tła za krawędzią ekranu po zatrzymaniu',
    ],
  },
  {
    version: 'v13',
    items: [
      'Przesuwanie dni jedzie sprężyną dolną — bez skoku i bez mrugania',
      'Po geście treść rusza dalej z miejsca, w którym puścił palec',
    ],
  },
  {
    version: 'v12',
    items: [
      'Strzałki „‹” i „›” w tygodniu i miesiącu cofają okres — wcześniej obie szły do przodu',
      'Przejścia widoków: stara treść odjeżdża w bok, więc w trakcie animacji nie ma pustego tła',
    ],
  },
  {
    version: 'v11',
    items: [
      'Po obrocie ekranu nazwy przedmiotów i podświetlenie dnia ustawiają się od nowa',
      'Kropka „nowa wersja” nie pojawia się już przy pierwszej instalacji aplikacji',
    ],
  },
  {
    version: 'v10',
    items: [
      'Propozycje i błędy: wyślij pomysł albo zgłoszenie z Opcji — bez logowania i bez e-maila',
      'Ekran „Co nowego” po pierwszym uruchomieniu nowej wersji',
      'Nazwy przedmiotów w jednej linii — czcionka dopasowuje się do szerokości',
      'Status „teraz” przeniesiony do linii metadanych — karty są niższe',
      'Materiały do zajęć są widoczne od razu po otwarciu szczegółów',
    ],
  },
  {
    version: 'v9',
    items: [
      'Materiały jako karty: typ, rozmiar i data w jednym miejscu',
      'Cała karta pobiera plik, a linki otwierają się w nowej karcie',
    ],
  },
];

const WhatsNew = {
  releases: WHATS_NEW,

  /**
   * Co pokazać po starcie:
   * - pierwsze uruchomienie z tą funkcją (brak zapamiętanej wersji): tylko
   *   najnowsze wydanie, żeby nie zasypać nikogo historią zmian,
   * - wersja spoza listy (starsza niż najniższa znana): też najnowsze,
   * - inaczej: wszystko nowsze od zapamiętanego, od najnowszego.
   */
  pending(seenVersion) {
    if (!WHATS_NEW.length) return [];
    const seen = String(seenVersion || '');
    const index = WHATS_NEW.findIndex((release) => release.version === seen);
    if (index === 0) return [];
    if (index < 0) return [WHATS_NEW[0]];
    return WHATS_NEW.slice(0, index);
  },
};

  global.PlanSchedule = {
    Format,
    ScheduleViews,
    WhatsNew,
    WEEKDAYS,
    WEEKDAYS_FULL,
    MONTHS_NOMINATIVE,
    MONTHS_GENITIVE,
    pad2,
    parseIso,
    toIso,
    addDays,
    dayOfWeek,
    todayIso,
  };
}(typeof window !== 'undefined' ? window : globalThis));
