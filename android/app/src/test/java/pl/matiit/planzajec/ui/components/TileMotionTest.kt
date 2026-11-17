package pl.matiit.planzajec.ui.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import androidx.compose.ui.unit.dp

/**
 * Geometria i matematyka ruchu pigułki wyboru. Testy pilnują, żeby animacja
 * była **widoczna** (rozciągnięcie i dryf rosną z odległością, ale mają sufit)
 * i żeby nie zależała od konkretnej szerokości ekranu.
 */
class TileMotionTest {

    @Test
    fun `kafelki dziela szerokosc paska rowno z przerwami`() {
        val grid = TileGrid(widthPx = 500f, heightPx = 80f, gapPx = 4f, count = 5)

        // (500 - 4 przerwy * 4) / 5 = 96.8
        assertEquals(96.8f, grid.tilePx, 0.01f)
        assertEquals(0f, grid.rectOf(0).left, 0.01f)
        assertEquals(96.8f, grid.rectOf(0).width, 0.01f)
        assertEquals(2 * (96.8f + 4f), grid.rectOf(2).left, 0.01f)
        assertEquals(80f, grid.rectOf(2).height, 0.01f)
        assertTrue(grid.measured)
    }

    @Test
    fun `niemierzony pasek nie ma geometrii`() {
        val grid = TileGrid(widthPx = 0f, heightPx = 0f, gapPx = 0f, count = 5)

        assertFalse(grid.measured)
        assertEquals(0f, grid.rectOf(5).left, 0f)
        assertEquals(0f, grid.centerOf(1), 0f)
    }

    @Test
    fun `rozciagniecie rosnie z odlegloscia ale ma sufit`() {
        val width = 200f

        assertEquals(0f, TileMotion.stretch(travelPx = 0f, widthPx = width), 0.01f)
        assertEquals(26f, TileMotion.stretch(travelPx = 100f, widthPx = width), 0.01f)
        // Sufit: 45% szerokości pigułki, nawet przy skoku przez cały pasek.
        assertEquals(90f, TileMotion.stretch(travelPx = 5000f, widthPx = width), 0.01f)
        // Szerokość 0 (przed pomiarem) nie może wyprodukować NaN.
        assertEquals(0f, TileMotion.stretch(travelPx = 100f, widthPx = 0f), 0.01f)
    }

    @Test
    fun `przednia krawedz wysuwa sie zawsze w strone celu`() {
        // Jazda w prawo: lewa krawędź zostaje, szerokość rośnie.
        assertEquals(100f, TileMotion.pillLeft(pillLeft = 100f, travelPx = 40f, stretchPx = 12f), 0.01f)
        // Jazda w lewo: lewa krawędź cofa się o rozciągnięcie.
        assertEquals(88f, TileMotion.pillLeft(pillLeft = 100f, travelPx = -40f, stretchPx = 12f), 0.01f)
    }

    @Test
    fun `w przelocie pigulka jest splaszczona a po dojsciu nie`() {
        val height = 80f

        assertEquals(0f, TileMotion.squash(travelPx = 0f, widthPx = 200f, heightPx = height), 0.01f)
        assertEquals(4f, TileMotion.squash(travelPx = 100f, widthPx = 200f, heightPx = height), 0.01f)
        // Maksymalnie 10% wysokości, niezależnie od długości przelotu.
        assertEquals(8f, TileMotion.squash(travelPx = 10_000f, widthPx = 200f, heightPx = height), 0.01f)
    }

    @Test
    fun `dryf tresci jest przeciwny do ruchu i ograniczony`() {
        val maxPx = 8f

        // Cel po prawej: pigułka jedzie w prawo, treść zostaje z tyłu (w lewo).
        val right = TileMotion.lag(
            travelPx = 100f,
            tileCenterPx = 250f,
            targetCenterPx = 250f,
            tileWidthPx = 100f,
            maxPx = maxPx,
        )
        assertEquals(-8f, right, 0.01f)

        val left = TileMotion.lag(
            travelPx = -100f,
            tileCenterPx = 250f,
            targetCenterPx = 250f,
            tileWidthPx = 100f,
            maxPx = maxPx,
        )
        assertEquals(8f, left, 0.01f)
        // Po dojściu na miejsce nic nie dryfuje.
        assertEquals(
            0f,
            TileMotion.lag(0f, 250f, 250f, 100f, maxPx),
            0f,
        )
    }

    @Test
    fun `dryf slabnie z odlegloscia kafelka od celu`() {
        val near = TileMotion.lag(40f, tileCenterPx = 250f, targetCenterPx = 250f, tileWidthPx = 100f, maxPx = 100f)
        val far = TileMotion.lag(40f, tileCenterPx = 650f, targetCenterPx = 250f, tileWidthPx = 100f, maxPx = 100f)

        assertTrue("bliżej = mocniejszy dryf ($near vs $far)", near < far)
        assertTrue("dryf jest zawsze w stronę przeciwną do ruchu", near < 0f && far < 0f)
    }

    @Test
    fun `dni tygodnia sa bardziej prostokatne niz dolne kafelki`() {
        val day = TileStyle.cellRadius(TileBarStyle.Subtle)
        val bottom = TileStyle.cellRadius(TileBarStyle.Floating)

        assertEquals(TileStyle.subtleRadius, day)
        assertTrue("dzień ($day) ma być mniej zaokrąglony niż kafelek ($bottom)", day < bottom)
        // „Prostokątne” = promień mieści się w kilku dp, a nie w połowie wysokości.
        assertTrue("promień dnia $day jest za duży", day <= 12.dp)

        // Pasek dni też jest mniej okrągły od dolnej pigułki.
        assertTrue(
            TileStyle.barCorner(TileBarStyle.Subtle) < TileStyle.barCorner(TileBarStyle.Floating),
        )
    }
}
