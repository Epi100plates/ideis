package pl.matiit.planzajec.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Zawartość przewijanej listy widżetu.
 *
 * Regresja, której pilnuje ten test: widżet obcinał plan do wysokości kafla
 * i pokazywał „+N zajęć — dotknij, aby otworzyć plan”. Dziś na liście są
 * **wszystkie** zajęcia, a wysokość widżetu decyduje tylko o tym, ile linii
 * widać bez przewijania.
 */
class WidgetScrollTest {

    @Test
    fun `tydzien ma na liscie wszystkie zajecia bez obcinania`() {
        val days = week(days = 5, perDay = 8)

        val items = WidgetScroll.weekItems(days)

        assertEquals(40, days.sumOf { it.rows.size })
        assertEquals(40, items.count { it is WidgetListItem.ClassRow })
    }

    @Test
    fun `lista nie ma limitu pozycji`() {
        // 60 zajęć nie mieści się w żadnym kaflu na pulpicie — i tak idą na listę.
        val items = WidgetScroll.weekItems(week(days = 6, perDay = 10))

        assertEquals(60, items.count { it is WidgetListItem.ClassRow })
        assertTrue(items.size > 60)
    }

    @Test
    fun `puste dni nie trafiaja na liste`() {
        val days = listOf(
            WidgetDay("Pon 10.11", emptyList()),
            WidgetDay("Wt 11.11", listOf(row("12:30"))),
        )

        val items = WidgetScroll.weekItems(days)

        assertEquals(1, items.count { it is WidgetListItem.Day })
        assertEquals("Wt 11.11", items.filterIsInstance<WidgetListItem.Day>().single().label)
    }

    @Test
    fun `tylko pierwszy dzien jest bez odstepu nad soba`() {
        val days = listOf(
            WidgetDay("Pon 10.11", listOf(row("08:00"))),
            WidgetDay("Wt 11.11", listOf(row("12:30"))),
            WidgetDay("Śr 12.11", listOf(row("14:00"))),
        )

        val labels = WidgetScroll.weekItems(days).filterIsInstance<WidgetListItem.Day>()

        assertEquals(3, labels.size)
        assertTrue(labels.first().first)
        assertTrue(labels.drop(1).none { it.first })
    }

    @Test
    fun `tylko ostatni wiersz dnia jest oznaczony jako koniec`() {
        val days = listOf(WidgetDay("Pon 10.11", listOf(row("08:00"), row("10:00"), row("12:00"))))

        val rows = WidgetScroll.weekItems(days).filterIsInstance<WidgetListItem.ClassRow>()

        assertEquals(listOf(false, false, true), rows.map { it.last })
    }

    @Test
    fun `kolejnosc dni i zajec jest zachowana`() {
        val days = listOf(
            WidgetDay("Pon 10.11", listOf(row("08:00", "A"), row("10:00", "B"))),
            WidgetDay("Wt 11.11", listOf(row("12:00", "C"))),
        )

        val subjects = WidgetScroll.weekItems(days)
            .filterIsInstance<WidgetListItem.ClassRow>()
            .map { it.row.subject }

        assertEquals(listOf("A", "B", "C"), subjects)
    }

    @Test
    fun `widzet dnia ma wszystkie zajecia`() {
        val rows = (0 until 9).map { index -> row(String.format("%02d:00", 8 + index)) }

        val items = WidgetScroll.dayItems(rows)

        assertEquals(9, items.size)
        assertEquals(9, items.filterIsInstance<WidgetListItem.ClassRow>().size)
        assertTrue(items.filterIsInstance<WidgetListItem.ClassRow>().last().last)
    }

    @Test
    fun `wszystkie pozycje maja unikalne id`() {
        val items = WidgetScroll.weekItems(week(days = 6, perDay = 10))

        assertEquals(items.size, items.map { it.id }.toSet().size)
    }

    @Test
    fun `id nie koliduja z pozycja naglowka`() {
        val items = WidgetScroll.weekItems(week(days = 4, perDay = 6))

        assertTrue(items.none { it.id == WidgetScroll.HEADER_ITEM_ID })
        assertTrue(items.all { it.id > LazyItemIdFloor })
    }

    /**
     * Po odświeżeniu planu lista ma trzymać pozycję przewinięcia (Android 12+),
     * więc te same dane muszą dawać te same id.
     */
    @Test
    fun `id sa stabilne po odswiezeniu`() {
        val first = WidgetScroll.weekItems(week(days = 3, perDay = 4)).map { it.id }
        val second = WidgetScroll.weekItems(week(days = 3, perDay = 4)).map { it.id }

        assertEquals(first, second)
    }

    @Test
    fun `dodanie zajec na koniec dnia nie zmienia id wczesniejszych pozycji`() {
        val before = WidgetScroll.weekItems(week(days = 1, perDay = 2)).map { it.id }
        val after = WidgetScroll.weekItems(week(days = 1, perDay = 3)).map { it.id }

        assertEquals(before, after.take(before.size))
    }

    @Test
    fun `powtorzone zajecia dostaja rozne id`() {
        val day = WidgetDay("Pon 10.11", listOf(row("08:00"), row("08:00")))

        val ids = WidgetScroll.weekItems(listOf(day)).map { it.id }

        assertEquals(ids.size, ids.toSet().size)
    }

    private fun row(start: String, subject: String = "Przedmiot") = WidgetRow(
        start = start,
        end = "11:30",
        subject = subject,
        form = "Ćw",
        room = "204",
        remote = false,
        minutes = 90,
    )

    private fun week(days: Int, perDay: Int): List<WidgetDay> =
        (0 until days).map { day ->
            WidgetDay(
                label = "Dzień ${day + 1}",
                rows = (0 until perDay).map { index -> row(String.format("%02d:00", 8 + index)) },
            )
        }

    private companion object {
        /** Glance odrzuca id mniejsze od `LazyListScope.ReservedItemIdRangeEnd` (−2^62). */
        const val LazyItemIdFloor = -0x4_000_000_000_000_000L
    }
}
