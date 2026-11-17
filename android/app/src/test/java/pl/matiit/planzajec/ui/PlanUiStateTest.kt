package pl.matiit.planzajec.ui

import org.junit.Assert.assertEquals
import org.junit.Test
import pl.matiit.planzajec.data.model.GroupDto
import pl.matiit.planzajec.domain.PlanSelection

/**
 * Szkic pickera nie może udawać wyboru, który opisuje plan.
 *
 * Testy pilnują dwóch miejsc, w których to było widać: karty „Plan”
 * ([selectionSummary]) i listy „Dodaj grupy” ([PlanUiState.addableGroups]).
 */
class PlanUiStateTest {

    private val applied = PlanSelection(
        nabor = "2024",
        field = "Informatyka",
        year = "2",
        degree = "1st",
        mode = "N",
    )

    /** Ten sam kierunek, inny rocznik — to jest szkic, który użytkownik porzucił. */
    private val draft = applied.copy(nabor = "2025", year = "1")

    private fun group(id: String, nabor: Int, year: Int, kind: String, number: String) = GroupDto(
        id = id,
        code = "$kind$number",
        field = "Informatyka",
        year = year,
        nabory = listOf(nabor),
        semester = 1,
        mode = "N",
        degree = "1st",
        kind = kind,
        number = number,
    )

    private val groups = listOf(
        group("200", 2024, 2, "Wyk", "01"),
        group("201", 2024, 2, "Ćw", "02"),
        group("301", 2025, 1, "Ćw", "01"),
    )

    @Test
    fun `podpis planu bierze wybor zapisany a nie szkic`() {
        val state = PlanUiState(
            selection = draft,
            appliedSelection = applied,
            appliedSite = SiteSelection(
                kierunekLabel = "Administracja",
                specLabel = "Administracja publiczna",
            ),
        )

        assertEquals(
            "Administracja · 2024/2025 · Administracja publiczna · niestacjonarne",
            state.selectionSummary(),
        )
    }

    @Test
    fun `po restarcie podpis planu powstaje z wartosci katalogu`() {
        // Etykiety z formularza nie są zapisywane — zostaje wybór z ustawień.
        val state = PlanUiState(
            selection = draft,
            appliedSelection = applied.copy(field = "Prawo", spec = PlanSelection.NONE, mode = "S"),
        )

        assertEquals("Prawo · 2024/2025 · stacjonarne", state.selectionSummary())
    }

    @Test
    fun `dodawanie grup filtruje po roczniku planu`() {
        val state = PlanUiState(
            groups = groups,
            planGroups = listOf("200"),
            selection = draft,
            appliedSelection = applied,
        )

        assertEquals(listOf("201"), state.addableGroups.map { it.id })
    }

    @Test
    fun `lista grup w pickerze nadal idzie za szkicem`() {
        // Krok „plan” ma pokazywać to, co użytkownik wybiera w pickerze —
        // dopiero zatwierdzenie zmienia plan.
        val state = PlanUiState(
            groups = groups,
            planGroups = listOf("200"),
            selection = draft,
            appliedSelection = applied,
        )

        assertEquals(listOf("301"), state.matchingGroups.map { it.id })
    }
}
