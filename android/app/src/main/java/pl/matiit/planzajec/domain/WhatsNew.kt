package pl.matiit.planzajec.domain

/**
 * „Co nowego” — lista zmian każdego wydania aplikacji, trzymana **w aplikacji**.
 *
 * Dzięki temu ekran działa bez sieci i zawsze pokazuje to samo, niezależnie od
 * tego, czy manifest aktualizacji jest dostępny. Po pokazaniu ekranu zapisujemy
 * `whatsNewSeenVersion`, więc kolejne uruchomienia tej samej wersji są ciche.
 */
data class ReleaseNotes(
    val versionCode: Int,
    val versionName: String,
    val items: List<String>,
)

object WhatsNew {

    /** Od najnowszego wydania. Kolejne wpisy dopisujemy przy publikacji. */
    val releases: List<ReleaseNotes> = listOf(
        ReleaseNotes(
            versionCode = 19,
            versionName = "1.13",
            items = listOf(
                "Picker motywu „Własny” od nowa: gotowe pary (Fiolet na czerni, Papier, Lawenda…), próbki akcentów i teł oraz kwadrat nasycenie/jasność z paskiem barwy zamiast trzech suwaków bez podglądu",
                "Zmiana koloru od razu włącza motyw „Własny” — wcześniej kolor nie działał, dopóki nie zaznaczyło się motywu na liście powyżej",
                "Pod podglądem kafelka jest zdanie o kontraście: czy akcent został przyciemniony i do jakiej wartości",
            ),
        ),
        ReleaseNotes(
            versionCode = 18,
            versionName = "1.12",
            items = listOf(
                "Plakietka notatki na kafelku jest przezroczysta: delikatne podbarwienie akcentem i cienka krawędź zamiast litego prostokąta",
                "Nowy motyw „Własny” w Opcjach → Wygląd: wybierasz kolor główny i kolor tła, a resztę motywu dobiera aplikacja",
                "Jasność motywu wynika z koloru tła, a jasny akcent jest przyciemniany do czytelnego kontrastu",
                "Widżety pokazują notatki z kafelków („Kolos”, „Egzamin”) i wyglądają w motywie własnym",
            ),
        ),
        ReleaseNotes(
            versionCode = 16,
            versionName = "1.10",
            items = listOf(
                "Notatka na kafelku ma ścięty lewy brzeg (chorągiewka) — jak w projekcie, zamiast łuku",
            ),
        ),
        ReleaseNotes(
            versionCode = 15,
            versionName = "1.9",
            items = listOf(
                "Notatki na kafelkach zajęć: „Kolos”, „Egzamin” i własny tekst do 15 znaków",
                "Notatka stoi na kafelku jako plakietka w kolorze wybranego motywu — dopasowuje rozmiar tekstu",
                "Dodajesz ją w szczegółach zajęć: dotknij kafelka i wybierz chip albo wpisz własną",
                "Notatka jest wspólna — widzą ją wszyscy, którzy widzą te zajęcia (także w wersji web)",
            ),
        ),
        ReleaseNotes(
            versionCode = 14,
            versionName = "1.8",
            items = listOf(
                "W prawym górnym rogu został tylko „Odśwież” — skrót do zmiany planu zniknął",
                "Plan zmieniasz w Opcjach: Plan → podpis wyboru → „Wybór planu” (ten sam panel co w webie)",
            ),
        ),
        ReleaseNotes(
            versionCode = 13,
            versionName = "1.7",
            items = listOf(
                "Wybór i zarządzanie planem wygląda jak w wersji web: jeden ekran, wybrane kroki zwijają się do wiersza",
                "Kolejność kroków jak w PWA: rocznik → kierunek → specjalność → tryb → plan",
                "Pole „Szukaj kierunku” przy dłuższej liście i roczniki całego wydziału z liczbą roku studiów",
                "„Zacznij od nowa” czyści wybór, a plan na ekranie zostaje",
                "Ekran startowy mówi jednym kolorem, a wybór motywu ma kółka i próbki jak w webie",
            ),
        ),
        ReleaseNotes(
            versionCode = 12,
            versionName = "1.6",
            items = listOf(
                "Widżety wyglądają jak aplikacja — także „Plan dnia”, który wcześniej zawsze był ciemny",
                "Zmiana motywu przemalowuje widżet od razu, a nowy widżet przejmuje bieżący styl",
                "Widżet sam przerysowuje się po zmianie trybu jasny/ciemny w systemie",
                "Trzy nowe motywy: Fiolet, Róż i Połączony (fiolet przechodzący w róż)",
                "Widżet nie zostaje z pustym tygodniem po dodaniu grup do planu",
            ),
        ),
        ReleaseNotes(
            versionCode = 9,
            versionName = "1.5",
            items = listOf(
                "Kierunek → rocznik → specjalność → tryb: rocznik jest przed specjalnością",
                "Roczniki pokazują tylko te, które mają grupy na kierunku — z podpisem roku studiów",
                "Specjalności i tryby tylko takie, które mają grupy w wybranym roczniku",
                "Wybór widać w kółku przy opcji, a nie na całym kafelku — jak w wersji web",
                "Wybór planu jest teraz kartą z czterema wierszami, a kroki otwierają się w arkuszu",
                "Opcje → Plan: podpis wyboru, „Dodaj grupy do planu” i typ zajęć przy każdej grupie",
                "Przycisk „Dodaj” jest nad listą grup — nie trzeba przewijać do końca",
            ),
        ),
        ReleaseNotes(
            versionCode = 8,
            versionName = "1.4",
            items = listOf(
                "Po pierwszym planie pytanie „Dodaj swoje grupy / Pomiń” — bez szukania w Opcjach",
                "Nagłówek planu pokazuje grupę bazową i liczbę dodanych grup („PGK 1st 5sem Wyk +1”)",
                "Plan wielogrupowy korzysta z katalogu także wtedy, gdy serwer nie zna nazwy grupy",
            ),
        ),
        ReleaseNotes(
            versionCode = 5,
            versionName = "1.4",
            items = listOf(
                "Wybór planu jak na stronie uczelni: kierunek → specjalność (z „Pomiń specjalność”) → nabór → tryb",
                "Wydział Studiów Stosowanych we Wrocławiu jest wybierany automatycznie",
                "Specjalności pochodzą z formularza uczelni i są odświeżane przy każdym wyborze",
                "Do planu dodasz swoją grupę ćwiczeniową, laboratoria i lektorat — plan złoży je w jeden",
                "Wykłady są wliczone automatycznie",
                "Opcje → Plan: lista grup w planie i przycisk „Dodaj kolejny plan”",
                "Licznik wejść web/PWA/aplikacja pod /licznik",
            ),
        ),
        ReleaseNotes(
            versionCode = 4,
            versionName = "1.3",
            items = listOf(
                "„Pokaż plan” i numer grupy w stałym pasku na dole — nie trzeba przewijać listy",
            ),
        ),
        ReleaseNotes(
            versionCode = 3,
            versionName = "1.2",
            items = listOf(
                "Picker nie prowadzi w ślepą uliczkę: sam dobiera rok do naboru i mówi, co ustawił",
                "Gdy wybór wyklucza cały kierunek (np. I stopnia dla Psychologii), pole jest luzowane z wyjaśnieniem",
            ),
        ),
        ReleaseNotes(
            versionCode = 2,
            versionName = "1.1",
            items = listOf(
                "Wybór naboru, kierunku, specjalności, roku i typu studiów — cały katalog uczelni",
                "Plany wszystkich roczników: ten sam numer grupy ma inny plan w każdym naborze",
                "Specjalność jest opcjonalna — na 1. roku plan wyświetla się bez niej",
            ),
        ),
    )

    /**
     * Co pokazać po starcie.
     *
     * - `seenVersionCode <= 0` (pierwsze uruchomienie z tą funkcją): tylko
     *   najnowsze wydanie, żeby nie zasypać nikogo historią zmian,
     * - w przeciwnym razie wszystkie wydania nowsze od zapamiętanego,
     * - zawsze od najnowszego.
     *
     * `releases` jest parametrem, żeby dało się sprawdzić reguły na kilku
     * wydaniach, nie zaśmiecając historii zmian aplikacji wpisami testowymi.
     */
    fun pending(
        seenVersionCode: Int,
        currentVersionCode: Int,
        releases: List<ReleaseNotes> = this.releases,
    ): List<ReleaseNotes> {
        if (currentVersionCode <= 0) return emptyList()
        val known = releases
            .filter { it.versionCode <= currentVersionCode }
            .sortedByDescending { it.versionCode }
        if (known.isEmpty()) return emptyList()
        if (seenVersionCode <= 0) return known.take(1)
        return known.filter { it.versionCode > seenVersionCode }
    }
}
