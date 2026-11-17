package pl.matiit.planzajec.update

/**
 * Ustawienia mechanizmu aktualizacji.
 *
 * Osobny interfejs od [pl.matiit.planzajec.data.local.PlanSettings], bo to inny
 * obszar decyzji: tam plan i wygląd, tutaj wersje aplikacji. Oba trzyma ten sam
 * plik SharedPreferences, więc odczyt jest równie tani.
 */
interface UpdateSettings {

    /** Automatyczne sprawdzanie nowej wersji (w tle i przy uruchomieniu). */
    var updatesAutoCheck: Boolean

    /** Pobieranie APK od razu, gdy telefon jest w zasięgu Wi-Fi. */
    var updatesAutoDownload: Boolean

    /** Wydanie, które użytkownik wybrał jako „pomiń” (0 = brak). */
    var updatesSkippedVersion: Int

    /** Ostatnie sprawdzenie (ms) — podstawa odstępu między sprawdzeniami. */
    var updatesLastCheckAt: Long

    /** Ostatnie pytanie o aktualizację (ms) — żeby nie pytać przy każdym starcie. */
    var updatesLastPromptAt: Long

    /** Wersja, o którą ostatnio pytaliśmy. */
    var updatesLastPromptVersion: Int

    /** Ostatnio widziany manifest (JSON) — ekran działa też bez sieci. */
    var updatesLatest: String?
}
