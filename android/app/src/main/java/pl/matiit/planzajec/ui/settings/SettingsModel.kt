package pl.matiit.planzajec.ui.settings

import pl.matiit.planzajec.domain.Format

/**
 * Strony panelu ustawień. Panel ma dwa poziomy: spis treści ([ROOT]) i trzy
 * strony tematyczne. Wcześniej wszystko było jedną długą listą mieszającą
 * informacje, przełączniki i przyciski, więc nie dało się w niej odnaleźć.
 */
enum class SettingsPage(val title: String) {
    ROOT("Ustawienia"),
    PLAN("Plan"),
    LOOK("Wygląd"),
    UPDATES("Aktualizacje"),
    GROUP("Grupa"),
    ADD("Dodaj plan"),
    WIDGETS("Widżety"),
    FEEDBACK("Propozycje / błędy"),
    ;

    val isRoot: Boolean get() = this == ROOT
}

/**
 * Rodzaj zgłoszenia z panelu ustawień. `id` trafia do `kind` w API propozycji
 * (`idea` / `bug`), a etykiety są tym, co widzi użytkownik.
 */
enum class FeedbackKind(
    val id: String,
    val label: String,
    val hint: String,
    val prompt: String,
) {
    IDEA(
        id = "idea",
        label = "Zaproponuj nową funkcję",
        hint = "Pomysł na widok, widżet albo ustawienie",
        prompt = "Co dodać do planu? Im konkretniej, tym łatwiej to zrobić.",
    ),
    BUG(
        id = "bug",
        label = "Zgłoś błąd",
        hint = "Coś nie działa albo wygląda źle",
        prompt = "Co nie działa? Napisz, co robiłeś i czego się spodziewałeś.",
    ),
}

/**
 * Podsumowania wierszy spisu treści — czysta logika, więc testowana na JVM.
 * Każde mieści się w jednej–dwóch linijkach nagłówka i mówi, co jest w środku
 * **teraz**, bez wchodzenia na stronę.
 */
object SettingsSummary {

    /** np. „Ćw (gr. 2) · aktualne” albo „Ćw (gr. 2) · offline”. */
    fun plan(
        groupLabel: String,
        savedAtMillis: Long,
        nowMillis: Long,
        offline: Boolean,
    ): String {
        val state = when {
            offline -> "offline, dane z pamięci"
            savedAtMillis <= 0L -> "brak danych"
            Format.staleLabel(savedAtMillis, nowMillis) -> "dane starsze niż doba"
            else -> "aktualne"
        }
        return listOf(groupLabel, state).filter { it.isNotEmpty() }.joinToString(" · ")
    }

    /** np. „1.6 (7) · dostępna 1.7” albo „1.6 (7) · najnowsza”. */
    fun updates(versionLabel: String, availableVersionName: String?): String =
        if (availableVersionName != null) {
            "$versionLabel · dostępna $availableVersionName"
        } else {
            "$versionLabel · najnowsza"
        }
}
