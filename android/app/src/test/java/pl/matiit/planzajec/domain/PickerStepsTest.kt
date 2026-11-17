package pl.matiit.planzajec.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.data.model.CohortDto
import pl.matiit.planzajec.data.model.SelectionItemDto

/**
 * Ekran wyboru planu: kolejność kroków, roczniki wydziału i szukanie kierunku.
 * Te same reguły co `public/wizard.js` (`stepsFor`, `cohortIndex`,
 * `kierunkiInCohort`, `rankKierunki`) — inaczej panel w APK i w PWA rozjechałby
 * się, a użytkownik widziałby inne listy w zależności od tego, gdzie kliknie.
 */
class PickerStepsTest {

    private fun kierunek(
        id: String,
        label: String,
        field: String = label,
        nabory: List<CohortDto> = listOf(CohortDto("2026", 10)),
    ) = SelectionItemDto(id = id, label = label, field = field, groups = 10, nabory = nabory)

    private val kierunki = listOf(
        kierunek("1", "Informatyka", nabory = listOf(CohortDto("2026", 12), CohortDto("2025", 4))),
        kierunek("2", "Administracja", nabory = listOf(CohortDto("2026", 7))),
        kierunek("3", "Inżynieria biomedyczna", nabory = listOf(CohortDto("2025", 3))),
        kierunek("4", "Budownictwo", nabory = emptyList()),
    )

    @Test
    fun `kroki pojawiaja sie po kolei jak w webie`() {
        val empty = PlanSelection()
        assertEquals(listOf(WizardStep.NABOR), PickerSteps.visible(empty))

        val withNabor = empty.copy(nabor = "2026")
        assertEquals(
            listOf(WizardStep.NABOR, WizardStep.KIERUNEK),
            PickerSteps.visible(withNabor),
        )

        val withField = withNabor.copy(field = "Informatyka")
        assertEquals(
            listOf(WizardStep.NABOR, WizardStep.KIERUNEK, WizardStep.SPECJALNOSC, WizardStep.TRYB),
            PickerSteps.visible(withField),
        )

        val withMode = withField.copy(mode = "N")
        assertEquals(
            listOf(
                WizardStep.NABOR,
                WizardStep.KIERUNEK,
                WizardStep.SPECJALNOSC,
                WizardStep.TRYB,
                WizardStep.PLAN,
            ),
            PickerSteps.visible(withMode),
        )
    }

    @Test
    fun `podpisy krokow sa takie same jak w PWA`() {
        assertEquals("Rocznik", WizardStep.NABOR.label)
        assertEquals("Kierunek", WizardStep.KIERUNEK.label)
        assertEquals("Specjalność", WizardStep.SPECJALNOSC.label)
        assertEquals("Tryb", WizardStep.TRYB.label)
        assertEquals("Plan", WizardStep.PLAN.label)
    }

    @Test
    fun `roczniki wydzialu sumuja grupy i ida od najnowszego`() {
        val index = PickerSteps.cohortIndex(kierunki)
        assertEquals(listOf("2026", "2025"), index.map { it.value })
        assertEquals(19, index[0].groups) // 12 + 7
        assertEquals(7, index[1].groups) // 4 + 3
    }

    @Test
    fun `kierunki w roczniku to tylko te z grupami, alfabetycznie`() {
        val rows = PickerSteps.kierunkiInCohort(kierunki, "2026")
        assertEquals(listOf("Administracja", "Informatyka"), rows.map { it.label })
        // Liczba grup pochodzi z rocznika, nie z całego katalogu.
        assertEquals(12, rows.first { it.label == "Informatyka" }.groups)
        assertTrue(PickerSteps.kierunkiInCohort(kierunki, "").isEmpty())
        assertTrue(PickerSteps.kierunkiInCohort(kierunki, "2019").isEmpty())
    }

    @Test
    fun `szukanie kierunku ignoruje ogonki i stawia poczatek nazwy wyzej`() {
        // Bez ogonków i wielkości liter trafia w „Inżynieria”.
        val inzynieria = PickerSteps.rankKierunki(
            PickerSteps.kierunkiInCohort(kierunki, "2025"),
            "inzyn",
        )
        assertEquals(listOf("Inżynieria biomedyczna"), inzynieria.map { it.label })

        // Początek nazwy (3) bije trafienie w środku wyrazu (1).
        val ranked = PickerSteps.rankKierunki(
            listOf(
                kierunek("a", "Automatyka i robotyka"),
                kierunek("b", "Informatyka stosowana"),
                kierunek("c", "Informatyka"),
            ),
            "infor",
        )
        assertEquals(listOf("Informatyka", "Informatyka stosowana"), ranked.map { it.label })
    }

    @Test
    fun `puste zapytanie nie filtruje listy`() {
        val all = PickerSteps.rankKierunki(kierunki, "")
        assertEquals(kierunki.size, all.size)
    }

    @Test
    fun `pierwszy brakujacy krok prowadzi od rocznika do planu`() {
        assertEquals(
            WizardStep.NABOR,
            PickerSteps.firstIncomplete(
                PlanSelection(), specDecided = false, specsKnown = false, specsAvailable = false,
            ),
        )
        assertEquals(
            WizardStep.KIERUNEK,
            PickerSteps.firstIncomplete(
                PlanSelection(nabor = "2026"), specDecided = false, specsKnown = false, specsAvailable = false,
            ),
        )
        // Lista specjalności nie przyszła — nie zgadujemy, pokazujemy krok.
        assertEquals(
            WizardStep.SPECJALNOSC,
            PickerSteps.firstIncomplete(
                PlanSelection(nabor = "2026", field = "Informatyka"),
                specDecided = false,
                specsKnown = false,
                specsAvailable = false,
            ),
        )
        // Rocznik bez specjalności: krok znika sam.
        assertEquals(
            WizardStep.TRYB,
            PickerSteps.firstIncomplete(
                PlanSelection(nabor = "2026", field = "Informatyka"),
                specDecided = false,
                specsKnown = true,
                specsAvailable = false,
            ),
        )
        assertEquals(
            WizardStep.TRYB,
            PickerSteps.firstIncomplete(
                PlanSelection(nabor = "2026", field = "Informatyka"),
                specDecided = true,
                specsKnown = true,
                specsAvailable = true,
            ),
        )
        assertEquals(
            WizardStep.PLAN,
            PickerSteps.firstIncomplete(
                PlanSelection(nabor = "2026", field = "Informatyka", mode = "N"),
                specDecided = true,
                specsKnown = true,
                specsAvailable = true,
            ),
        )
    }
}
