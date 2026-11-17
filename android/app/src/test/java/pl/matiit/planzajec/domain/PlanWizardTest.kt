package pl.matiit.planzajec.domain

import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.data.model.GroupDto

/**
 * Kreator wyboru planu: semestr z naboru i daty oraz plan bazowy/grupy do
 * dodania. Te same reguły co `public/wizard.js` w wersji web (sprawdzane
 * w `scripts/self-test.js`), więc oba klienty wybierają identyczne grupy.
 */
class PlanWizardTest {

    private val now = LocalDate.of(2026, 11, 15)
    private val summer = LocalDate.of(2027, 4, 10)

    @Test
    fun `semestr liczy sie z naboru i daty`() {
        assertEquals(
            PlanWizard.Semester(3, 5, PlanWizard.Season.WINTER),
            PlanWizard.semesterFor(2026, "2024", now),
        )
        assertEquals(
            PlanWizard.Semester(3, 6, PlanWizard.Season.SUMMER),
            PlanWizard.semesterFor(2026, "2024", summer),
        )
        assertEquals(
            PlanWizard.Semester(1, 1, PlanWizard.Season.WINTER),
            PlanWizard.semesterFor(2026, "2026", now),
        )
        assertNull(PlanWizard.semesterFor(2026, "2030", now))
        assertNull(PlanWizard.semesterFor(null, "2024", now))
        assertNull(PlanWizard.semesterFor(2026, "", now))
    }

    @Test
    fun `wybor dostaje rok i semestr, a bez naboru zostaje bez filtra`() {
        val base = PlanSelection(nabor = "2025")
        val withSemester = PlanWizard.withSemester(base, 2026, now)
        assertEquals("2", withSemester.year)
        assertEquals("3", withSemester.sem)
        val empty = PlanWizard.withSemester(PlanSelection(nabor = ""), 2026, now)
        assertEquals(PlanSelection.ANY, empty.sem)
        assertEquals(PlanSelection.ANY, empty.year)
    }

    @Test
    fun `plan bazowy to grupa wykladowa z biezacego semestru`() {
        val groups = listOf(
            group(id = "1", kind = "Wyk", sem = 5),
            group(id = "2", kind = "Ćw", sem = 5, number = "1"),
            group(id = "3", kind = "Wyk", sem = 6),
        )
        val selection = PlanSelection(
            nabor = "2024", field = "Informatyka", year = "3", degree = "1st", mode = "N", sem = "5",
        )
        assertEquals(listOf("1"), PlanWizard.baseCandidates(groups, selection).map { it.id })
    }

    @Test
    fun `bez wykladu plan bazowy bierze pierwsze pasujace grupy`() {
        val groups = listOf(group(id = "7", kind = "Ćw", sem = 5))
        val selection = PlanSelection(field = "Informatyka", year = "3", sem = "5", mode = "N")
        assertEquals(listOf("7"), PlanWizard.baseCandidates(groups, selection).map { it.id })
    }

    @Test
    fun `do planu dodaje sie tylko nie-wyklady i niepowtorzone grupy`() {
        val groups = listOf(
            group(id = "1", kind = "Wyk", sem = 5),
            group(id = "2", kind = "Ćw", sem = 5, number = "2"),
            group(id = "3", kind = "Lab", sem = 5, number = "1A"),
            group(id = "4", kind = "Lab", sem = 6, number = "2A"),
        )
        val selection = PlanSelection(field = "Informatyka", year = "3", sem = "5", mode = "N")
        assertEquals(listOf("2", "3"), PlanWizard.addableGroups(groups, selection, listOf("1")).map { it.id })
        assertEquals(listOf("3"), PlanWizard.addableGroups(groups, selection, listOf("1", "2")).map { it.id })
        assertTrue(PlanWizard.addableGroups(groups, selection, emptyList()).none { it.kind == "Wyk" })
    }

    @Test
    fun `semestr zawęża grupy takze w dopasowaniu`() {
        val groups = listOf(
            group(id = "1", kind = "Wyk", sem = 5),
            group(id = "2", kind = "Wyk", sem = 6),
        )
        val selection = PlanSelection(field = "Informatyka", year = "3", sem = "5", mode = "N")
        assertEquals(listOf("1"), PlanSelectionLogic.filter(groups, selection).map { it.id })
        assertEquals(2, PlanSelectionLogic.filter(groups, selection.copy(sem = PlanSelection.ANY)).size)
    }

    @Test
    fun `rok studiow liczy sie z rocznika i roku akademickiego`() {
        assertEquals(3, PlanWizard.cohortYear(2026, "2024"))
        assertEquals(1, PlanWizard.cohortYear(2026, "2026"))
        assertNull(PlanWizard.cohortYear(2026, "2010"))
        assertNull(PlanWizard.cohortYear(null, "2024"))
        assertNull(PlanWizard.cohortYear(2026, ""))
    }

    @Test
    fun `pusty semestr luzuje filtr i plan wchodzi z innego semestru`() {
        val groups = listOf(
            group(id = "1", kind = "Wyk", sem = 4),
            group(id = "2", kind = "Ćw", sem = 4, number = "1"),
        )
        // Wybór mówi semestr 5, a katalog ma tylko grupy z semestru 4.
        val selection = PlanSelection(
            nabor = "2024", field = "Informatyka", year = "3", degree = "1st", mode = "N", sem = "5",
        )
        val (prepared, candidates) = PlanWizard.planStep(groups, selection)
        assertEquals(PlanSelection.ANY, prepared.sem)
        assertEquals(listOf("1"), candidates.map { it.id })
        // Grupy do dodania muszą używać tego samego, poluzowanego wyboru.
        assertEquals(listOf("2"), PlanWizard.addableGroups(groups, prepared, listOf("1")).map { it.id })
        // Gdy semestr pasuje, wybór zostaje bez zmian.
        val exact = selection.copy(sem = "4")
        assertEquals("4", PlanWizard.planStep(groups, exact).first.sem)
    }

    private fun group(
        id: String,
        kind: String,
        sem: Int,
        number: String? = null,
        field: String = "Informatyka",
        mode: String = "N",
        year: Int = 3,
    ) = GroupDto(
        id = id,
        code = "grupa $id",
        name = "grupa $id",
        field = field,
        degree = "1st",
        mode = mode,
        year = year,
        nabory = listOf(2024, 2025),
        semester = sem,
        kind = kind,
        number = number,
    )
}
