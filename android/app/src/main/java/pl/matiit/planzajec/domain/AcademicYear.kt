package pl.matiit.planzajec.domain

import java.time.LocalDate

/**
 * Rok akademicki w rozumieniu uczelni: zaczyna się 1 września, więc „2026”
 * to rok 2026/2027. Serwer ideis trzyma plany per rok akademicki — parametr
 * `ay` w API to właśnie ten numer.
 */
object AcademicYear {

    /** Rok rozpoczęcia bieżącego roku akademickiego (listopad 2026 → 2026). */
    fun currentStart(today: LocalDate = LocalDate.now()): Int =
        if (today.monthValue >= 9) today.year else today.year - 1

    /** „2026” → „2026/2027”. */
    fun label(start: Int): String = "$start/${start + 1}"

    /** „2026/2027” → 2026 (null, gdy zapis jest inny). */
    fun start(label: String?): Int? {
        val match = Regex("""^(\d{4})\s*/\s*(\d{4})$""").find(label?.trim().orEmpty()) ?: return null
        return match.groupValues[1].toIntOrNull()
    }
}
