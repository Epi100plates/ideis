package pl.matiit.planzajec.widget

import java.time.LocalDate
import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.ui.theme.CustomColors
import pl.matiit.planzajec.ui.theme.StyleCatalog

/**
 * Motyw widżetu ma być motywem aplikacji — dla **obu** widżetów i podglądów.
 *
 * Ten test pilnuje regresji, przez którą widżet „Dzień” miał zaszyty visionOS:
 * jego paleta nie zależała od stylu wybranego w aplikacji i zawsze wychodziła
 * ciemna.
 */
class WidgetThemeTest {

    private val today = LocalDate.of(2026, 11, 16)

    @Test
    fun `widzet bierze styl wybrany w aplikacji niezaleznie od tonacji systemu`() {
        // Jasny motyw aplikacji + noc w systemie: widżet zostaje jasny.
        val light = WidgetTheme.palette("light", night = true)

        assertEquals("light", light.id)
        assertFalse(light.isDark)
    }

    @Test
    fun `motyw auto idzie za tonacja systemu`() {
        assertEquals("dark", WidgetTheme.palette("auto", night = true).id)
        assertEquals("light", WidgetTheme.palette("auto", night = false).id)
    }

    @Test
    fun `kazdy motyw aplikacji daje palete widzetu`() {
        StyleCatalog.styles
            .filter { it.id != "auto" }
            .forEach { style ->
                val palette = WidgetTheme.palette(style.id, night = style.isDark)
                assertEquals("widżet: ${style.id}", style.id, palette.id)
            }
    }

    @Test
    fun `nieznany styl w widzecie wraca do domyslnego`() {
        assertEquals(
            StyleCatalog.DEFAULT_STYLE,
            WidgetTheme.palette("nie-ma-takiego", night = false).id,
        )
        assertEquals(StyleCatalog.DEFAULT_STYLE, WidgetTheme.palette(null, night = true).id)
    }

    @Test
    fun `odcisk widzetu zawiera styl aplikacji`() {
        val light = WidgetTheme.contentKey(today, "light", night = true, modelFingerprint = "plan")
        val dark = WidgetTheme.contentKey(today, "dark", night = true, modelFingerprint = "plan")
        val mixed = WidgetTheme.contentKey(today, "mix-dark", night = false, modelFingerprint = "plan")

        assertNotEquals("zmiana motywu musi przerysować widżet", light, dark)
        assertNotEquals(mixed, dark)
        assertTrue(light.startsWith("$today|light|true|"))
    }

    @Test
    fun `odcisk widzetu normalizuje brak stylu do domyslnego`() {
        assertEquals(
            WidgetTheme.contentKey(today, StyleCatalog.DEFAULT_STYLE, night = true, modelFingerprint = "p"),
            WidgetTheme.contentKey(today, null, night = true, modelFingerprint = "p"),
        )
    }

    /**
     * Motyw „Własny” w widżecie: paleta liczona z dwóch kolorów użytkownika,
     * a zmiana samej barwy musi unieważnić odcisk (inaczej widżet zostałby
     * w starych kolorach, bo `styleId` się nie zmienia).
     */
    @Test
    fun `widzet liczy palete motywu wlasnego z kolorow uzytkownika`() {
        val violet = WidgetTheme.palette(
            "custom",
            night = false,
            custom = CustomColors("#7C5CFF", "#0C0A18"),
        )
        val emerald = WidgetTheme.palette(
            "custom",
            night = false,
            custom = CustomColors("#10B981", "#04120C"),
        )

        assertEquals("custom", violet.id)
        assertTrue("ciemne tło to ciemny motyw", violet.isDark)
        assertEquals(Color(0xFF0C0A18), violet.page)
        assertNotEquals(violet.accent, emerald.accent)
        assertNotEquals(violet.page, emerald.page)
        assertEquals(
            WidgetTheme.contentKey(today, "custom", night = false, modelFingerprint = "p", custom = CustomColors("#7C5CFF", "#0C0A18")),
            WidgetTheme.contentKey(today, "custom", night = false, modelFingerprint = "p"),
        )
        assertNotEquals(
            WidgetTheme.contentKey(today, "custom", night = false, modelFingerprint = "p", custom = CustomColors("#7C5CFF", "#0C0A18")),
            WidgetTheme.contentKey(today, "custom", night = false, modelFingerprint = "p", custom = CustomColors("#10B981", "#04120C")),
        )
    }
}
