package pl.matiit.planzajec.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Konwersja barw dla edytora motywu „Własny” (trzy suwaki: barwa, nasycenie,
 * jasność). Czysta matematyka, więc sprawdzamy ją bez Compose i bez Androida.
 */
class ColorHsvTest {

    @Test
    fun `kolor bazowy trafia w wlasciwy sektor barw`() {
        assertEquals(0f, ColorHsv.fromRgb(255, 0, 0).hue, 0.01f)
        assertEquals(120f, ColorHsv.fromRgb(0, 255, 0).hue, 0.01f)
        assertEquals(240f, ColorHsv.fromRgb(0, 0, 255).hue, 0.01f)
    }

    @Test
    fun `szary nie ma barwy ani nasycenia`() {
        val grey = ColorHsv.fromRgb(128, 128, 128)

        assertEquals(0f, grey.hue, 0.01f)
        assertEquals(0f, grey.saturation, 0.01f)
        assertEquals(128f / 255f, grey.value, 0.01f)
    }

    @Test
    fun `hex przechodzi przez hsv i wraca bez straty`() {
        listOf("#7C5CFF", "#0C0A18", "#FFE066", "#22D3EE", "#000000", "#FFFFFF").forEach { hex ->
            val hsv = ColorHsv.fromHex(hex)
            assertEquals("$hex → $hsv", hex, ColorHsv.toHex(hsv!!))
        }
    }

    @Test
    fun `zapis hex bez krzyzyka i malymi literami dziala`() {
        assertEquals(ColorHsv.fromHex("#7C5CFF"), ColorHsv.fromHex("7c5cff"))
        assertNull(ColorHsv.fromHex("nie-kolor"))
        assertNull(ColorHsv.fromHex("#abc"))
        assertNull(ColorHsv.fromHex(null))
    }

    @Test
    fun `suwaki nie wychodza poza zakres`() {
        val wild = Hsv(hue = 725f, saturation = 1.7f, value = -3f).clamped()

        assertEquals(5f, wild.hue, 0.01f)
        assertEquals(1f, wild.saturation, 0.01f)
        assertEquals(0f, wild.value, 0.01f)
        // Ujemna barwa też wraca do zakresu 0–360.
        assertEquals(300f, Hsv(-60f, 0.5f, 0.5f).clamped().hue, 0.01f)
    }

    @Test
    fun `skrajne wartosci daja czern i biel`() {
        assertEquals("#000000", ColorHsv.toHex(Hsv(120f, 0.8f, 0f)))
        assertEquals("#FFFFFF", ColorHsv.toHex(Hsv(120f, 0f, 1f)))
    }
}
