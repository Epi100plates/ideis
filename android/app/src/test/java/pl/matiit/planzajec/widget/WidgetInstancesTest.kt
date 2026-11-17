package pl.matiit.planzajec.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Lista widżetów w panelu ustawień. Panel musi pokazywać dokładnie to, co stoi
 * na pulpicie — inaczej „Zmień wygląd” zapisze wariant dla nieistniejącej kopii.
 */
class WidgetInstancesTest {

    private fun lookOf(map: Map<Int, WidgetLook>): (WidgetKind, Int) -> WidgetLook? =
        { _, id -> map[id] }

    @Test
    fun `tydzien idzie przed dniem i po kolei`() {
        val list = WidgetInstances.build(
            weekIds = listOf(9, 3),
            dayIds = listOf(7),
            lookOf = lookOf(emptyMap()),
        )

        assertEquals(listOf(3, 9, 7), list.map { it.appWidgetId })
        assertEquals(WidgetKind.WEEK, list[0].kind)
        assertEquals(WidgetKind.WEEK, list[1].kind)
        assertEquals(WidgetKind.DAY, list[2].kind)
    }

    @Test
    fun `bez zapisanego wygladu jest wariant domyslny`() {
        val list = WidgetInstances.build(listOf(1), listOf(2), lookOf(emptyMap()))

        assertEquals(WidgetLook.default, list[0].look)
        assertEquals(WidgetLook.default, list[1].look)
    }

    @Test
    fun `zapisany wyglad jest odczytywany per kopia`() {
        val list = WidgetInstances.build(
            weekIds = listOf(1, 2),
            dayIds = emptyList(),
            lookOf = lookOf(mapOf(1 to WidgetLook.Glass, 2 to WidgetLook.Compact)),
        )

        assertEquals(listOf(WidgetLook.Glass, WidgetLook.Compact), list.map { it.look })
    }

    @Test
    fun `puste wejscie daje pusta liste`() {
        assertTrue(WidgetInstances.build(emptyList(), emptyList()) { _, _ -> null }.isEmpty())
    }

    @Test
    fun `podsumowanie mowi ile widzetow stoi na pulpicie`() {
        assertEquals("brak na pulpicie", WidgetInstances.summary(0))
        assertEquals("brak na pulpicie", WidgetInstances.summary(-1))
        assertEquals("1 na pulpicie", WidgetInstances.summary(1))
        assertEquals("2 na pulpicie", WidgetInstances.summary(2))
        assertEquals("12 na pulpicie", WidgetInstances.summary(12))
    }

    @Test
    fun `rodzaje widzetow maja stabilne identyfikatory`() {
        assertEquals(listOf("week", "day"), WidgetKind.entries.map { it.id })
        assertTrue(WidgetKind.entries.all { it.title.isNotBlank() && it.hint.isNotBlank() })
    }
}
