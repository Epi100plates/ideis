package pl.matiit.planzajec.domain

import pl.matiit.planzajec.data.model.GroupDto

/**
 * Korygowanie wyboru w pickerze tak, żeby nigdy nie kończył się pustą listą.
 *
 * Port zachowania z wersji web (`public/app.js`, obsługa `change` pól):
 *
 * 1. Zmiana roku studiów nie przeskakuje na inny rok akademicki — nabór jest
 *    dobierany tak, żeby oglądany plan został ten sam (2. rok przy planie
 *    2026/2027 to nabór 2025).
 * 2. Ten sam kierunek ma grupy tylko w niektórych naborach, więc zmiana roku
 *    albo naboru bez grup przeskakuje na najbliższy nabór/rok, który je ma.
 * 3. Inne pola (typ studiów, tryb, specjalność) też mogą wykluczyć kierunek —
 *    np. Psychologia jest tylko jednolita magisterska. Luzujemy je po kolei
 *    i mówimy, co zostało poluzowane.
 */
object SelectionAdjuster {

    /** Wynik korekty: nowy wybór i zdanie dla użytkownika (null = bez zmian). */
    data class AdjustResult(
        val selection: PlanSelection,
        val note: String? = null,
    )

    /**
     * @param groups cały katalog (bez filtra)
     * @param selection wybór po zmianie jednego pola
     * @param dimension pole, które użytkownik właśnie zmienił (null = np. „Wyczyść”)
     * @param currentAcademicYear rok akademicki właśnie oglądanego planu
     */
    fun adjust(
        groups: List<GroupDto>,
        selection: PlanSelection,
        dimension: Dimension?,
        currentAcademicYear: Int?,
    ): AdjustResult {
        if (groups.isEmpty()) return AdjustResult(selection)
        var current = selection
        var note: String? = null

        // 1. Rok studiów zmieniamy w obrębie oglądanego roku akademickiego.
        if (dimension == Dimension.YEAR && current.year.isNotEmpty() && current.year != PlanSelection.NONE) {
            val ay = currentAcademicYear
                ?: current.academicYear()
                ?: (current.nabor.toIntOrNull()?.let { start ->
                    current.year.toIntOrNull()?.let { year -> start + year - 1 }
                })
            val year = current.year.toIntOrNull()
            if (ay != null && year != null && year >= 1) {
                val start = ay - (year - 1)
                if (start >= 2000) current = current.copy(nabor = start.toString())
            }
        }

        if (PlanSelectionLogic.filter(groups, current).isNotEmpty()) {
            return AdjustResult(current, note)
        }

        // 2. Przeskok na najbliższy nabór/rok, który ma grupy.
        if (dimension == Dimension.YEAR || dimension == Dimension.NABOR) {
            val partner = if (dimension == Dimension.YEAR) Dimension.NABOR else Dimension.YEAR
            val candidates = PlanSelectionLogic.facets(groups, current).of(partner)
            for (candidate in candidates) {
                if (candidate == null) continue
                val attempt = current.with(partner, candidate)
                if (PlanSelectionLogic.filter(groups, attempt).isNotEmpty()) {
                    current = attempt
                    note = "ustawiono ${partnerName(partner)}: " +
                        "${SelectionLabels.value(partner, candidate)}, bo poprzedni nie ma grup na tym roku"
                    return AdjustResult(current, note)
                }
            }
        }

        // 3. Luzowanie pozostałych pól — od najbardziej „zawężających”.
        val relaxed = mutableListOf<String>()
        for (key in listOf(Dimension.DEGREE, Dimension.MODE, Dimension.SPEC, Dimension.YEAR, Dimension.NABOR)) {
            if (current.value(key).isEmpty()) continue
            current = current.with(key, PlanSelection.ANY)
            relaxed += SelectionLabels.fieldLabel(key)
            if (PlanSelectionLogic.filter(groups, current).isNotEmpty()) break
        }
        if (relaxed.isNotEmpty()) note = "poluzowano: ${relaxed.joinToString(", ")} — ten wybór nie ma grup"

        return AdjustResult(current, note)
    }

    private fun partnerName(dimension: Dimension): String = when (dimension) {
        Dimension.NABOR -> "nabór"
        Dimension.YEAR -> "rok"
        else -> SelectionLabels.fieldLabel(dimension).lowercase()
    }
}
