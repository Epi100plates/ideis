package pl.matiit.planzajec.widget

/**
 * Rodzaj widżetu: dwa odbiorniki, dwa warianty treści.
 *
 * `id` trafia do kluczy stanu i nie zmienia się; etykiety są tym, co widzi
 * użytkownik w panelu ustawień.
 */
enum class WidgetKind(val id: String, val title: String, val hint: String) {
    WEEK(
        id = "week",
        title = "Plan tygodnia",
        hint = "Siedem dni: godziny, przedmiot, typ i sala",
    ),
    DAY(
        id = "day",
        title = "Plan dnia",
        hint = "Jeden dzień — dziś albo najbliższy z zajęciami",
    ),
}

/** Jedna kopia widżetu na pulpicie: identyfikator systemowy i wybrany wygląd. */
data class WidgetInstance(
    val appWidgetId: Int,
    val kind: WidgetKind,
    val look: WidgetLook,
)

/**
 * Lista widżetów stojących na pulpicie — czysta logika, więc testowana na JVM.
 * Warstwa Android dostarcza tylko identyfikatory i zapisany wygląd.
 */
object WidgetInstances {

    /**
     * Najpierw tygodnie, potem dni, w kolejności identyfikatorów (launcher
     * nadaje je rosnąco, więc lista odpowiada kolejności dodawania).
     *
     * Brak zapisanego wyglądu (np. widżet dodany przed jego wyborem) oznacza
     * domyślny wariant, a nie błąd — tak samo rysuje go widżet.
     */
    fun build(
        weekIds: List<Int>,
        dayIds: List<Int>,
        lookOf: (WidgetKind, Int) -> WidgetLook?,
    ): List<WidgetInstance> =
        weekIds.distinct().sorted().map { id ->
            WidgetInstance(id, WidgetKind.WEEK, lookOf(WidgetKind.WEEK, id) ?: WidgetLook.default)
        } + dayIds.distinct().sorted().map { id ->
            WidgetInstance(id, WidgetKind.DAY, lookOf(WidgetKind.DAY, id) ?: WidgetLook.default)
        }

    /** Podsumowanie wiersza w spisie treści ustawień. */
    fun summary(count: Int): String = when {
        count <= 0 -> "brak na pulpicie"
        count == 1 -> "1 na pulpicie"
        else -> "$count na pulpicie"
    }
}
