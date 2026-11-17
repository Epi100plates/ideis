package pl.matiit.planzajec.ui.theme

import androidx.compose.ui.graphics.toArgb
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Dane pickera motywu „Własny”: gotowe pary, próbki akcentów i teł.
 *
 * Ten test pilnuje dwóch rzeczy, których nie widać w kodzie na pierwszy rzut oka:
 *  - pary **nie duplikują** kolorów, tylko biorą je z palet w [StyleCatalog],
 *  - każda próbka na każdym tle po regule kontrastu jest czytelna (≥ 4,0:1),
 *    więc picker nie proponuje użytkownikowi zestawu „nie do odczytania”.
 */
class CustomPairsTest {

    @Test
    fun `gotowe pary istnieja i wskazuja na palety katalogu`() {
        val ids = CustomPairs.pairs.map { it.styleId }
        assertEquals(6, CustomPairs.pairs.size)
        assertEquals(ids.size, ids.toSet().size)
        ids.forEach { id ->
            assertTrue("brak palety $id w katalogu", StyleCatalog.styles.any { it.id == id })
        }
    }

    @Test
    fun `kolory pary pochodza z palety`() {
        val pair = CustomPairs.pairs.first { it.styleId == "violet-dark" }
        val palette = StyleCatalog.palette(pair.styleId, systemDark = false)
        val colors = CustomPairs.colors(pair)

        assertEquals(hexOf(rgbOf(palette.accent.toArgb())), colors.primary)
        assertEquals(hexOf(rgbOf(palette.page.toArgb())), colors.background)
        assertEquals("#C4B5FD", colors.primary)
        assertEquals("#07040F", colors.background)
    }

    @Test
    fun `probki sa poprawnymi kolorami`() {
        assertEquals(8, CustomPairs.accents.size)
        assertEquals(6, CustomPairs.backgrounds.size)
        assertEquals(CustomPairs.accents.size, CustomPairs.accents.toSet().size)
        assertEquals(CustomPairs.backgrounds.size, CustomPairs.backgrounds.toSet().size)
        (CustomPairs.accents + CustomPairs.backgrounds).forEach { hex ->
            assertEquals("zły zapis $hex", hex, CustomColors.normalizeHex(hex))
        }
    }

    @Test
    fun `kazda probka na kazdym tle ma czytelny akcent`() {
        CustomPairs.accents.forEach { accent ->
            CustomPairs.backgrounds.forEach { background ->
                val palette = CustomTheme.palette(CustomColors(accent, background))
                val ratio = contrast(rgbOf(palette.accent.toArgb()), rgbOf(palette.page.toArgb()))
                assertTrue(
                    "$accent na $background: kontrast ${"%.2f".format(java.util.Locale.ROOT, ratio)}",
                    ratio >= CustomTheme.ACCENT_CONTRAST_TARGET - 0.01,
                )
            }
        }
    }

    @Test
    fun `na ciemnym tle akcent zostaje bez zmian`() {
        CustomPairs.accents.forEach { accent ->
            val report = CustomTheme.report(CustomColors(accent, "#0C0A18"))
            assertFalse("$accent nie powinien być poprawiany na ciemnym tle", report.corrected)
            assertEquals(accent, report.applied)
            assertTrue(report.dark)
        }
    }

    @Test
    fun `na jasnym tle raport mowi o przyciemnieniu`() {
        val report = CustomTheme.report(CustomColors("#7C5CFF", "#F4F5F8"))

        assertTrue(report.corrected)
        assertNotEquals(report.picked, report.applied)
        assertFalse(report.dark)
        assertTrue("kontrast ${report.contrast}", report.contrast >= CustomTheme.ACCENT_CONTRAST_TARGET - 0.01)
        // Ten sam wynik co `customAccentReport` w `public/styles.js`.
        assertEquals("#6B4FDB", report.applied)
    }
}
