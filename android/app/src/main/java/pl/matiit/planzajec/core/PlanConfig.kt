package pl.matiit.planzajec.core

import pl.matiit.planzajec.BuildConfig
import pl.matiit.planzajec.domain.PlanSelection

/** Stale wartości aplikacji; wszystko w jednym miejscu, bez odczytu z plików przy starcie. */
object PlanConfig {

    /** Bazowy adres publicznego API planu (nadpisywalny przez -Pplanzajec.apiBase). */
    const val API_BASE: String = BuildConfig.API_BASE

    /** Grupa pokazywana przy pierwszym uruchomieniu (Informatyka 1st 1sem Ćw2 N). */
    const val DEFAULT_GROUP: String = "21188"

    /**
     * Wybór startowy, gdy serwer nie poda własnego (`defaults` w /api/groups):
     * Informatyka, 1. rok, I stopnia, niestacjonarne. Specjalność pusta, bo na
     * 1. roku zwykle jej nie ma — wybór specjalności jest opcjonalny.
     */
    val DEFAULT_SELECTION: PlanSelection = PlanSelection(
        nabor = PlanSelection.ANY,
        field = "Informatyka",
        spec = PlanSelection.ANY,
        year = "1",
        degree = "1st",
        mode = "N",
    )

    /** Przed tym czasem plan z dysku uznajemy za świeży i nie pytamy sieci. */
    const val FOREGROUND_FRESH_MS: Long = 10 * 60 * 1000L

    /** Katalog grup zmienia się rzadko — odświeżamy go raz na dobę. */
    const val GROUPS_TTL_MS: Long = 24 * 60 * 60 * 1000L

    /** Ile dni pokazuje widok tygodnia i widżet. */
    const val WINDOW_DAYS: Int = 7

    /** Minimalny odstęp między automatycznymi odświeżeniami w tle. */
    const val BACKGROUND_INTERVAL_MINUTES: Long = 60L
}
