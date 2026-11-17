package pl.matiit.planzajec.ui.theme

import androidx.compose.ui.graphics.luminance
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StyleCatalogTest {

    @Test
    fun `kazdy styl ma unikalny identyfikator i czytelny podpis`() {
        val ids = StyleCatalog.styles.map { it.id }

        assertEquals(21, ids.size)
        assertEquals(ids.size, ids.distinct().size)
        assertTrue(StyleCatalog.styles.all { it.label.isNotBlank() && it.hint.isNotBlank() })
    }

    @Test
    fun `kazdy styl daje palete`() {
        StyleCatalog.styles.forEach { style ->
            val palette = StyleCatalog.palette(style.id, systemDark = true)
            // „Auto” rozwiązuje się na konkretny motyw systemowy, więc ma inne id.
            if (style.id != "auto") assertEquals(style.id, palette.id)
            assertTrue(palette.pageGradient.isNotEmpty())
        }
    }

    @Test
    fun `stare identyfikatory mapuja sie na nowe warianty`() {
        assertEquals("lg2-dark", StyleCatalog.normalize("glass"))
        assertEquals("visionos-perf-dark", StyleCatalog.normalize("lg2-fast"))
        assertEquals("visionos-perf-dark", StyleCatalog.normalize("visionos-fast"))
    }

    @Test
    fun `nieznany styl wraca do domyslnego`() {
        assertEquals(StyleCatalog.DEFAULT_STYLE, StyleCatalog.normalize("nie-ma-takiego"))
        assertEquals(StyleCatalog.DEFAULT_STYLE, StyleCatalog.normalize(null))
    }

    @Test
    fun `auto wybiera tonacje systemu`() {
        assertEquals("light", StyleCatalog.resolve("auto", systemDark = false))
        assertEquals("dark", StyleCatalog.resolve("auto", systemDark = true))
        assertEquals("lg2-dark", StyleCatalog.resolve("lg2-dark", systemDark = false))
    }

    @Test
    fun `ciemne palety maja jasny tekst a jasne ciemny`() {
        StyleCatalog.styles
            .filter { it.id != "auto" }
            .forEach { style ->
                val palette = StyleCatalog.palette(style.id, systemDark = false)
                if (palette.isDark) {
                    assertTrue(
                        "${style.id}: tekst powinien być jaśniejszy od tła",
                        palette.text.luminance() > palette.page.luminance(),
                    )
                } else {
                    assertTrue(
                        "${style.id}: tekst powinien być ciemniejszy od tła",
                        palette.text.luminance() < palette.page.luminance(),
                    )
                }
            }
    }

    @Test
    fun `wariant wydajny nie ma plam tla`() {
        assertTrue(StyleCatalog.palette("visionos-perf-dark", true).blobs.isEmpty())
        assertTrue(StyleCatalog.palette("visionos-perf-light", false).blobs.isEmpty())
        assertTrue(StyleCatalog.palette("visionos-dark", true).blobs.isNotEmpty())
        assertTrue(StyleCatalog.palette("visionos-light", false).blobs.isNotEmpty())
    }

    @Test
    fun `palety roznych wariantow roznia sie tlem`() {
        val lg2 = StyleCatalog.palette("lg2-dark", true)
        val lg3 = StyleCatalog.palette("lg3-dark", true)

        assertNotEquals(lg2.page, lg3.page)
        assertNotEquals(lg2.blobs, lg3.blobs)
    }

    @Test
    fun `menu stylu pokazuje piec grup — cztery z wersji web i motyw wlasny`() {
        val groups = StyleCatalog.groups

        assertEquals(5, groups.size)
        assertEquals(StyleGroup.LIQUID_GLASS, groups[0].first)
        assertEquals(StyleGroup.VISION_OS, groups[1].first)
        assertEquals(StyleGroup.CLASSIC, groups[2].first)
        assertEquals(StyleGroup.KOLOROWE, groups[3].first)
        assertEquals(StyleGroup.WLASNY, groups[4].first)
        assertEquals(6, groups[0].second.size)
        assertEquals(4, groups[1].second.size)
        assertEquals(4, groups[2].second.size)
        assertEquals(6, groups[3].second.size)
        assertEquals(1, groups[4].second.size)
        assertEquals("custom", groups[4].second.first().id)
    }

    @Test
    fun `trzy nowe motywy maja wariant jasny i ciemny`() {
        val nowe = StyleCatalog.styles.filter { it.group == StyleGroup.KOLOROWE }

        assertEquals(listOf("Fiolet", "Róż", "Połączony"), nowe.map { it.label }.distinct())
        listOf("violet", "pink", "mix").forEach { base ->
            val dark = StyleCatalog.def("$base-dark")
            val light = StyleCatalog.def("$base-light")
            assertEquals("$base-dark", dark.id)
            assertEquals("$base-light", light.id)
            assertTrue("$base-dark musi być ciemny", dark.isDark)
            assertFalse("$base-light musi być jasny", light.isDark)
            assertEquals(dark.label, light.label)
        }
    }

    @Test
    fun `nowe motywy roznia sie od siebie akcentem i tlem`() {
        val violet = StyleCatalog.palette("violet-dark", true)
        val pink = StyleCatalog.palette("pink-dark", true)
        val mix = StyleCatalog.palette("mix-dark", true)

        assertEquals(3, listOf(violet.accent, pink.accent, mix.accent).distinct().size)
        assertEquals(3, listOf(violet.panelSolid, pink.panelSolid, mix.panelSolid).distinct().size)
        assertTrue("każdy nowy motyw ma plamy tła", listOf(violet, pink, mix).all { it.blobs.isNotEmpty() })
    }

    @Test
    fun `fiolet dominuje w motywie fiolet a roz w motywie roz`() {
        val violet = StyleCatalog.palette("violet-dark", true)
        val pink = StyleCatalog.palette("pink-dark", true)
        val mix = StyleCatalog.palette("mix-dark", true)

        // Fiolet: składowa niebieska największa; róż: czerwona największa.
        val violetLead = violet.blobs.maxBy { it.alpha }.color
        val pinkLead = pink.blobs.maxBy { it.alpha }.color
        assertTrue(violetLead.blue > violetLead.red)
        assertTrue(pinkLead.red > pinkLead.blue)
        // Połączony ma plamę fioletową i różową jednocześnie.
        assertTrue(mix.blobs.size >= 2)
        assertNotEquals(mix.blobs[0].color, mix.blobs[1].color)
    }
}
