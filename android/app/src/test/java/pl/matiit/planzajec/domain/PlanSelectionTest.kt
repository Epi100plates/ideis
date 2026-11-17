package pl.matiit.planzajec.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.data.model.GroupDto

/**
 * Reguła dopasowania grup do wyboru — odpowiednik testów `public/selection.js`
 * w wersji web. Te same przypadki muszą dawać ten sam wynik w APK.
 */
class PlanSelectionTest {

    private fun group(
        id: String,
        field: String? = "Informatyka",
        spec: String? = null,
        degree: String? = "1st",
        mode: String? = "N",
        year: Int? = 1,
        nabory: List<Int> = listOf(2026),
    ) = GroupDto(
        id = id,
        code = "Infor. 1st ${year ?: 1}sem Ćw$id",
        name = "Informatyka, 1st 1sem Ćw (gr. $id) N",
        field = field,
        spec = spec,
        degree = degree,
        mode = mode,
        year = year,
        nabory = nabory,
    )

    @Test
    fun `pierwszy rok informatyki nie wymaga specjalnosci`() {
        val groups = listOf(
            group("21186"),
            group("21187"),
            group("21188"),
        )

        // Specjalność „dowolna” — pole puste, bo na 1. roku jej nie ma.
        val selection = PlanSelection(field = "Informatyka", year = "1", degree = "1st", mode = "N")

        assertEquals(3, PlanSelectionLogic.filter(groups, selection).size)
    }

    @Test
    fun `pusta specjalnosc przepuszcza grupy z specjalnoscia i bez niej`() {
        val withSpec = group("1", spec = "Psychologia kliniczna i zdrowia", field = "Psychologia")
        val withoutSpec = group("2", field = "Psychologia")
        val selection = PlanSelection(field = "Psychologia")

        assertTrue(selection.matches(withSpec))
        assertTrue(selection.matches(withoutSpec))
    }

    @Test
    fun `specjalnosc bez wartosci pokazuje tylko grupy bez specjalnosci`() {
        val withSpec = group("1", spec = "Prawo w biznesie", field = "Administracja")
        val withoutSpec = group("2", field = "Administracja")
        val selection = PlanSelection(field = "Administracja", spec = PlanSelection.NONE)

        assertFalse(selection.matches(withSpec))
        assertTrue(selection.matches(withoutSpec))
    }

    @Test
    fun `konkretna specjalnosc zawęża do jednej wartości`() {
        val a = group("1", spec = "UX design", field = "Informatyka")
        val b = group("2", spec = "Data Science", field = "Informatyka")
        val selection = PlanSelection(field = "Informatyka", spec = "UX design")

        assertTrue(selection.matches(a))
        assertFalse(selection.matches(b))
    }

    @Test
    fun `rok akademicki planu to nabor plus rok studiow minus jeden`() {
        assertEquals(2025, PlanSelection(nabor = "2024", year = "2").academicYear())
        assertEquals(2026, PlanSelection(nabor = "2026", year = "1").academicYear())
        assertEquals(2024, PlanSelection(nabor = "2024").academicYear())
        assertNull(PlanSelection(year = "2").academicYear())
        assertNull(PlanSelection().academicYear())
    }

    @Test
    fun `nabory zawężają grupy do wybranego rocznika`() {
        val starszy = group("1", nabory = listOf(2024, 2025))
        val nowy = group("2", nabory = listOf(2026))

        assertTrue(PlanSelection(nabor = "2025").matches(starszy))
        assertFalse(PlanSelection(nabor = "2026").matches(starszy))
        assertTrue(PlanSelection(nabor = "2026").matches(nowy))
    }

    @Test
    fun `opcje roku i naboru nie zubażają się wzajemnie`() {
        val groups = listOf(
            group("1", year = 1, nabory = listOf(2026)),
            group("2", year = 2, nabory = listOf(2025)),
        )

        // Wybrany nabór 2026 nie może zablokować roku 2 — te wymiary liczą się razem.
        val facets = PlanSelectionLogic.facets(groups, PlanSelection(nabor = "2026"))
        assertEquals(listOf("2", "1"), facets.year)

        val byYear = PlanSelectionLogic.facets(groups, PlanSelection(year = "2"))
        assertEquals(listOf("2026", "2025"), byYear.nabor)
    }

    @Test
    fun `lista kierunkow nigdy się nie zawęża`() {
        val groups = listOf(
            group("1", field = "Informatyka", degree = "1st", nabory = listOf(2026)),
            group("2", field = "Psychologia", degree = "jmgr", nabory = listOf(2026)),
        )

        val facets = PlanSelectionLogic.facets(groups, PlanSelection(degree = "1st"))

        // Kierunek jest nawigacją po katalogu: przy „I stopnia” musi dać się
        // przejść na kierunek z samymi jednolitymi magisterskimi.
        assertEquals(listOf("Informatyka", "Psychologia"), facets.field)
        // Lista typów studiów nie gubi wartości, którą użytkownik właśnie wybrał.
        assertEquals(listOf("1st", "jmgr"), facets.degree)
    }

    @Test
    fun `wybrana wartosc zostaje na liscie opcji`() {
        val groups = listOf(group("1", field = "Informatyka"), group("2", field = "Prawo"))
        val selection = PlanSelection(field = "Prawo")

        val facets = PlanSelectionLogic.facets(groups, selection)

        assertEquals(listOf("Informatyka", "Prawo"), facets.field)
    }

    @Test
    fun `nabór grupy bez wybranego roku bierze najnowszy dostepny`() {
        val group = group("1", nabory = listOf(2023, 2024, 2025))

        assertEquals("2025", PlanSelectionLogic.pickNabor(group, ""))
        assertEquals("2024", PlanSelectionLogic.pickNabor(group, "2024"))
    }

    @Test
    fun `opis wyboru czyta sie jak zdanie`() {
        val selection = PlanSelection(
            nabor = "2026",
            field = "Informatyka",
            year = "1",
            degree = "1st",
            mode = "N",
        )

        assertEquals(
            "nabór 2026/2027 · Informatyka · 1. rok · I stopnia · niestacjonarne",
            SelectionLabels.describe(selection),
        )
    }

    @Test
    fun `opis wyboru pokazuje brak specjalnosci wprost`() {
        val selection = PlanSelection(field = "Informatyka", spec = PlanSelection.NONE)

        assertTrue(SelectionLabels.describe(selection).contains("bez specjalności"))
    }
}
