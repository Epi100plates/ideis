package pl.matiit.planzajec.data

import pl.matiit.planzajec.domain.AcademicYear

/**
 * Co użytkownik ogląda: **lista grup** i rok akademicki planu.
 *
 * Pierwsza grupa jest bazowa (wykład), kolejne to własne ćwiczenia, laboratoria
 * i lektorat — serwer scala ich zajęcia i odsiewa cudze grupy. Ten sam numer
 * grupy ma inny plan w każdym naborze, dlatego rok akademicki jest częścią
 * tożsamości wpisu (cache, wersje, widżet, załączniki).
 *
 * Klucz: „21613+21614” (bieżący rok) albo „21613+21614@2025” (starszy nabór).
 * Pojedyncza grupa zostaje przy starym kluczu „21188”, żeby nie stracić cache
 * i widżetów zapisanych przed wprowadzeniem planów wielogrupowych.
 */
data class PlanTarget(
    val groupId: String,
    /** Rok rozpoczęcia roku akademickiego (2025 = 2025/2026); null = bieżący. */
    val academicYear: Int? = null,
    /** Grupy planu w kolejności: baza (wykład), potem ćwiczenia/laby/lektorat. */
    val groups: List<String> = emptyList(),
) {

    /** Grupy planu — bez listy zostaje sama grupa bazowa (stare zapisy). */
    val orderedGroups: List<String>
        get() = groups.filter { it.isNotBlank() }.ifEmpty { listOf(groupId) }

    /** Klucz wpisu: bieżący rok bez sufiksu, inny rok z „@RRRR”. */
    fun key(currentYearStart: Int = AcademicYear.currentStart()): String {
        val base = orderedGroups.joinToString("+")
        return if (academicYear == null || academicYear == currentYearStart) {
            base
        } else {
            "$base@$academicYear"
        }
    }

    /** Parametr `ay` dla API — null, gdy plan ma dotyczyć bieżącego roku. */
    val ayParam: Int?
        get() = academicYear

    companion object {
        /** Wpis z klucza rejestru: „21613+21614@2025” → grupy + rok 2025. */
        fun ofKey(key: String): PlanTarget {
            val parts = key.split('@', limit = 2)
            val groups = parts[0].split('+').filter { it.isNotBlank() }
            return PlanTarget(
                groupId = groups.firstOrNull() ?: parts[0],
                academicYear = parts.getOrNull(1)?.toIntOrNull(),
                groups = groups,
            )
        }
    }
}
