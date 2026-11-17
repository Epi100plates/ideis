package pl.matiit.planzajec.ui.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Podsumowania w spisie treści panelu ustawień. Każdy wiersz musi dać się
 * przeczytać bez wchodzenia na stronę, więc pilnujemy treści i kolejności.
 */
class SettingsSummaryTest {

    private val now = 1_700_000_000_000L
    private val minute = 60_000L

    @Test
    fun `plan pokazuje grupe i swiezosc danych`() {
        assertEquals(
            "Ćw (gr. 2) · aktualne",
            SettingsSummary.plan("Ćw (gr. 2)", now - 5 * minute, now, offline = false),
        )
    }

    @Test
    fun `plan ostrzega o starych danych`() {
        val summary = SettingsSummary.plan("Wyk", now - 30 * 60 * minute, now, offline = false)

        assertTrue(summary, summary.endsWith("dane starsze niż doba"))
    }

    @Test
    fun `plan pokazuje offline zamiast swiezosci`() {
        val summary = SettingsSummary.plan("Wyk", now - minute, now, offline = true)

        assertEquals("Wyk · offline, dane z pamięci", summary)
    }

    @Test
    fun `plan bez danych nie udaje ze sa`() {
        assertEquals("Wyk · brak danych", SettingsSummary.plan("Wyk", 0L, now, offline = false))
    }

    @Test
    fun `pusta nazwa grupy nie zostawia separatora`() {
        assertEquals("aktualne", SettingsSummary.plan("", now, now, offline = false))
    }

    @Test
    fun `aktualizacje mowia czy jest nowsza wersja`() {
        assertEquals("1.6 (7) · najnowsza", SettingsSummary.updates("1.6 (7)", null))
        assertEquals("1.6 (7) · dostępna 1.7", SettingsSummary.updates("1.6 (7)", "1.7"))
    }

    @Test
    fun `kazda strona ma tytul i tylko spis tresci jest korzeniem`() {
        assertEquals("Ustawienia", SettingsPage.ROOT.title)
        assertEquals(
            listOf("Plan", "Wygląd", "Aktualizacje", "Grupa", "Dodaj plan", "Widżety", "Propozycje / błędy"),
            SettingsPage.entries.filterNot { it.isRoot }.map { it.title },
        )

        assertTrue(SettingsPage.ROOT.isRoot)
        assertTrue(SettingsPage.entries.filterNot { it.isRoot }.none { it.isRoot })
    }
}
