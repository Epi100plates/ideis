package pl.matiit.planzajec.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Treść podglądu widżetu. Podgląd rysują te same komponenty co prawdziwy
 * widżet, więc przykładowe dane muszą przejść przez formatowanie tak samo:
 * gdyby model był pusty, launcher znów pokazałby pusty kafel.
 */
class WidgetPreviewTest {

    @Test
    fun `podglad tygodnia ma dni z zajęciami`() {
        val model = WidgetPreview.weekModel()

        assertEquals(2, model.days.size)
        assertEquals(2, model.totalClasses)
        assertFalse(model.isEmpty)
        assertTrue(model.groupLabel.isNotBlank())
        assertTrue(model.rangeLabel.isNotBlank())
    }

    @Test
    fun `podglad dnia ma zajecia i etykiete dnia`() {
        val model = WidgetPreview.dayModel()

        assertEquals(3, model.rows.size)
        assertFalse(model.isEmpty)
        assertTrue(model.dayLabel.isNotBlank())
    }

    @Test
    fun `wiersze podgladu pokazuja typ, sale i dlugosc zajec`() {
        val row = WidgetPreview.rows.first()

        assertEquals("10:45–12:15", row.timeRange)
        assertEquals("Ćw", row.formLabel)
        assertEquals("s. 204", row.roomLabel)
        assertEquals("1h 30m", row.durationLabel)
        assertEquals("Ćw · s. 204 · 1h 30m", row.metaLabel)
    }

    @Test
    fun `zajecia zdalne w podgladzie nie maja sali`() {
        val row = WidgetPreview.rows[1]

        assertEquals(null, row.roomLabel)
        assertEquals("zdalnie", row.placeLabel)
        assertEquals("Wyk", row.formLabel)
    }

    @Test
    fun `podglad nie zalezy od zegara`() {
        val first = WidgetPreview.weekModel().fingerprint()

        assertEquals(first, WidgetPreview.weekModel().fingerprint())
        assertEquals(WidgetPreview.dayModel().fingerprint(), WidgetPreview.dayModel().fingerprint())
    }

    /**
     * Regresja: miniaturka w okienku przypinania była obcinana do wysokości
     * widżetu (a przy 110 dp nie mieścił się ani jeden wiersz). Dziś zawartość
     * jest przewijaną listą bez limitu, więc podgląd pokazuje wszystkie
     * przykładowe zajęcia.
     */
    @Test
    fun `podglad tygodnia ma na liscie wszystkie przykladowe zajecia`() {
        val items = WidgetScroll.weekItems(WidgetPreview.weekModel().days)

        assertEquals(2, items.count { it is WidgetListItem.Day })
        assertEquals(2, items.count { it is WidgetListItem.ClassRow })
    }

    @Test
    fun `podglad dnia pokazuje wszystkie przykladowe zajecia`() {
        val items = WidgetScroll.dayItems(WidgetPreview.dayModel().rows)

        assertEquals(WidgetPreview.dayModel().rows.size, items.size)
        assertEquals(
            WidgetPreview.dayModel().rows.map { it.subject },
            items.filterIsInstance<WidgetListItem.ClassRow>().map { it.row.subject },
        )
    }
}
