package pl.matiit.planzajec.widget

import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetLookTest {

    @Test
    fun `domyslny wyglad to vision`() {
        assertEquals(WidgetLook.Vision, WidgetLook.default)
        assertEquals(WidgetLook.Vision, WidgetLook.fromId(null))
        assertEquals(WidgetLook.Vision, WidgetLook.fromId(""))
    }

    @Test
    fun `nieznany identyfikator nie psuje widzetu`() {
        assertEquals(WidgetLook.Vision, WidgetLook.fromId("nie-ma-takiego"))
        assertEquals(WidgetLook.Vision, WidgetLook.fromId("VISION"))
    }

    @Test
    fun `kazdy wariant da sie zapisac i odczytac`() {
        WidgetLook.entries.forEach { look ->
            assertEquals(look, WidgetLook.fromId(look.id))
        }
    }

    @Test
    fun `identyfikatory sa unikalne i stabilne`() {
        assertEquals(
            listOf("vision", "minimal", "accent", "timeline", "tiles", "compact", "glass"),
            WidgetLook.entries.map { it.id },
        )
        assertEquals(
            WidgetLook.entries.size,
            WidgetLook.entries.map { it.id }.toSet().size,
        )
    }

    @Test
    fun `kafelkowy wariant jest dostepny i zapisywany`() {
        assertEquals(WidgetLook.Tiles, WidgetLook.fromId("tiles"))
        assertEquals("tiles", WidgetLook.Tiles.id)
    }

    @Test
    fun `nowe warianty kompakt i szklo sa zapisywane`() {
        assertEquals(WidgetLook.Compact, WidgetLook.fromId("compact"))
        assertEquals(WidgetLook.Glass, WidgetLook.fromId("glass"))
        assertEquals("compact", WidgetLook.Compact.id)
        assertEquals("glass", WidgetLook.Glass.id)
    }
}
