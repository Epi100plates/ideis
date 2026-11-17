package pl.matiit.planzajec.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Motyw „Własny”: dwa kolory użytkownika → cała paleta.
 *
 * Ten test pilnuje reguł, które muszą być **identyczne w wersji web**
 * (`public/styles.js`, `customPalette`): tonacja z tła, czytelny tekst
 * i dociąganie akcentu do kontrastu. Bez tego jasne tło dostałoby biały tekst,
 * a jasny akcent — nieczytelną plakietkę notatki.
 */
class CustomThemeTest {

    @Test
    fun `domyslna para kolorow to fiolet na granatowym tle`() {
        assertEquals("#7C5CFF", CustomColors.DEFAULT.primary)
        assertEquals("#0C0A18", CustomColors.DEFAULT.background)
    }

    @Test
    fun `tonacja wynika z jasnosci tla`() {
        val dark = CustomTheme.palette(CustomColors("#7C5CFF", "#0C0A18"))
        val light = CustomTheme.palette(CustomColors("#7C5CFF", "#F7F7FB"))

        assertTrue(dark.isDark)
        assertFalse(light.isDark)
        // Kolor tła jest dosłownie tłem strony, a nie „czymś podobnym”.
        assertEquals(Color(0xFF0C0A18), dark.page)
        assertEquals(Color(0xFFF7F7FB), light.page)
    }

    @Test
    fun `tekst jest jasny na ciemnym tle a ciemny na jasnym`() {
        val dark = CustomTheme.palette(CustomColors("#7C5CFF", "#0C0A18"))
        val light = CustomTheme.palette(CustomColors("#7C5CFF", "#F7F7FB"))

        assertTrue(dark.text.luminance() > dark.page.luminance())
        assertTrue(light.text.luminance() < light.page.luminance())
        // Ten sam próg, co `TEXT_ON_DARK`/`TEXT_ON_LIGHT` w Kotlinie i JS.
        assertEquals(Color(0xFFF2F5FF), dark.text)
        assertEquals(Color(0xFF12141B), light.text)
    }

    @Test
    fun `akcent jest dociagany do czytelnego kontrastu na tle`() {
        // Biały akcent na białym tle — bez korekty byłyby niewidoczne przyciski.
        val white = CustomTheme.palette(CustomColors("#FFFFFF", "#FAFAFA"))
        val ratio = contrast(rgbOf(white.accent.toArgb()), rgbOf(white.page.toArgb()))

        assertTrue("kontrast akcentu $ratio", ratio >= CustomTheme.ACCENT_CONTRAST_TARGET - 0.5)
        assertNotEquals(Color.White, white.accent)
    }

    @Test
    fun `tekst na akcencie ma przeciwny kolor niz akcent`() {
        val darkAccent = CustomTheme.palette(CustomColors("#8B5CF6", "#0C0A18"))
        val lightAccent = CustomTheme.palette(CustomColors("#FFE066", "#0C0A18"))

        assertEquals(Color(0xFFFFFFFF), darkAccent.accentOn)
        assertEquals(Color(0xFF10131A), lightAccent.accentOn)
    }

    @Test
    fun `paleta ma wszystkie elementy motywu`() {
        val palette = CustomTheme.palette(CustomColors("#22D3EE", "#08121A"))

        assertEquals("custom", palette.id)
        assertEquals("Własny", palette.label)
        assertEquals(26, palette.radius.value.toInt())
        assertTrue(palette.pageGradient.size >= 2)
        assertEquals(2, palette.blobs.size)
        // Panele i krawędzie są półprzezroczyste — to motyw „szklany”.
        assertTrue(palette.panel.alpha < 1f)
        assertTrue(palette.edge.alpha < 1f)
        assertTrue(palette.accentSoft.alpha < 1f)
    }

    @Test
    fun `zapis kolorow jest odporny na smieci i wielkosc liter`() {
        assertEquals(
            CustomColors("#7C5CFF", "#0C0A18"),
            CustomColors.normalize("#7c5cff", "#0c0a18"),
        )
        assertEquals(CustomColors.DEFAULT, CustomColors.normalize("nie-kolor", null))
        assertEquals("#AABBCC", CustomColors.normalizeHex("#abc"))
        assertEquals("#112233", CustomColors.normalizeHex("112233"))
        assertEquals(null, CustomColors.normalizeHex("#12345"))
        // Ten sam zapis, inna wielkość liter = ten sam odcisk (widżet się nie przerysuje).
        assertEquals(
            CustomColors("#7C5CFF", "#0C0A18").fingerprint(),
            CustomColors("#7c5cff", "#0C0A18").fingerprint(),
        )
    }

    @Test
    fun `katalog wystawia motyw wlasny jako styl`() {
        val def = StyleCatalog.def("custom")

        assertEquals("Własny", def.label)
        assertEquals(StyleGroup.WLASNY, def.group)
        // Paleta zależy od kolorów, więc ten sam identyfikator daje różne tła.
        val violet = StyleCatalog.palette("custom", false, CustomColors("#7C5CFF", "#0C0A18"))
        val emerald = StyleCatalog.palette("custom", false, CustomColors("#10B981", "#04120C"))
        assertNotEquals(violet.page, emerald.page)
        assertNotEquals(violet.accent, emerald.accent)
        // Bez podanych kolorów wraca para domyślna (nie wysypuje motywu).
        assertEquals(
            StyleCatalog.palette("custom", false, CustomColors.DEFAULT),
            StyleCatalog.palette("custom", false),
        )
    }
}
