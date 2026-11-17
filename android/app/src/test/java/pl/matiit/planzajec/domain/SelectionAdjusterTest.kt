package pl.matiit.planzajec.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.data.model.GroupDto

/**
 * Korygowanie wyboru w pickerze — te same reguły, które w wersji web pilnują,
 * żeby lista grup nie została pusta („ustawiono rok: 2…”, „poluzowano: …”).
 */
class SelectionAdjusterTest {

    private fun group(
        id: String,
        field: String = "Informatyka",
        degree: String? = "1st",
        mode: String? = "N",
        year: Int? = 1,
        nabory: List<Int> = listOf(2026),
    ) = GroupDto(
        id = id,
        code = "Infor. 1st ${year ?: 1}sem",
        name = "Informatyka, 1st ${year ?: 1}sem N",
        field = field,
        degree = degree,
        mode = mode,
        year = year,
        nabory = nabory,
    )

    @Test
    fun `zmiana roku nie przeskakuje na inny rok akademicki`() {
        // Oglądany plan to 2026/2027; 2. rok studiów = nabór 2025.
        val groups = listOf(
            group("1", year = 1, nabory = listOf(2026)),
            group("2", year = 2, nabory = listOf(2025)),
        )

        val result = SelectionAdjuster.adjust(
            groups = groups,
            selection = PlanSelection(field = "Informatyka", year = "2"),
            dimension = Dimension.YEAR,
            currentAcademicYear = 2026,
        )

        assertEquals("2025", result.selection.nabor)
        assertTrue(PlanSelectionLogic.filter(groups, result.selection).isNotEmpty())
    }

    @Test
    fun `zmiana naboru bez grup dobiera rok, ktory je ma`() {
        val groups = listOf(
            group("1", year = 1, nabory = listOf(2026)),
            group("2", year = 2, nabory = listOf(2025)),
        )

        // Nabór 2025 nie ma 1. roku w tym kierunku — schodzimy na 2. rok.
        val result = SelectionAdjuster.adjust(
            groups = groups,
            selection = PlanSelection(nabor = "2025", field = "Informatyka", year = "1"),
            dimension = Dimension.NABOR,
            currentAcademicYear = 2026,
        )

        assertEquals("2025", result.selection.nabor)
        assertEquals("2", result.selection.year)
        assertTrue(result.note.orEmpty().contains("ustawiono rok"))
    }

    @Test
    fun `typ studiow wykluczajacy kierunek jest luzowany`() {
        // Psychologia jest w katalogu tylko jako jednolite magisterskie.
        val groups = listOf(group("1", field = "Psychologia", degree = "jmgr", mode = "N"))

        val result = SelectionAdjuster.adjust(
            groups = groups,
            selection = PlanSelection(field = "Psychologia", degree = "1st"),
            dimension = Dimension.DEGREE,
            currentAcademicYear = 2026,
        )

        assertEquals(PlanSelection.ANY, result.selection.degree)
        assertTrue(result.note.orEmpty().contains("poluzowano"))
        assertEquals(1, PlanSelectionLogic.filter(groups, result.selection).size)
    }

    @Test
    fun `wybor z grupami zostaje bez zmian i bez noty`() {
        val groups = listOf(group("1"), group("2"))

        val result = SelectionAdjuster.adjust(
            groups = groups,
            selection = PlanSelection(field = "Informatyka", year = "1", degree = "1st"),
            dimension = Dimension.FIELD,
            currentAcademicYear = 2026,
        )

        assertNull(result.note)
        assertEquals("Informatyka", result.selection.field)
    }

    @Test
    fun `pusty katalog nie jest korygowany`() {
        val selection = PlanSelection(field = "Informatyka", degree = "1st")

        val result = SelectionAdjuster.adjust(
            groups = emptyList(),
            selection = selection,
            dimension = Dimension.DEGREE,
            currentAcademicYear = 2026,
        )

        assertEquals(selection, result.selection)
        assertNull(result.note)
    }
}
