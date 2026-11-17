package pl.matiit.planzajec.domain

import java.time.LocalDate
import java.time.LocalTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.Fixtures

class ScheduleWindowTest {

    private val today = LocalDate.of(2026, 11, 10)
    private val slots = ScheduleMapper.toSlots(Fixtures.samplePlan())

    @Test
    fun `pomija uszkodzone wpisy i sortuje po godzinie`() {
        assertEquals(4, slots.size)
        val saturday = slots.filter { it.date == LocalDate.of(2026, 11, 14) }
        assertEquals(listOf(LocalTime.of(10, 45), LocalTime.of(12, 30)), saturday.map { it.start })
    }

    @Test
    fun `okno siedmiu dni zawiera tylko dni z zajęciami`() {
        val week = ScheduleWindow.nextDays(slots, today)

        assertEquals(
            listOf(LocalDate.of(2026, 11, 14), LocalDate.of(2026, 11, 15)),
            week.map { it.date },
        )
        assertEquals(2, week[0].classes.size)
        assertEquals(1, week[1].classes.size)
    }

    @Test
    fun `zajecia poza oknem nie trafiaja do tygodnia`() {
        val week = ScheduleWindow.nextDays(slots, today)

        assertTrue(week.none { it.date == LocalDate.of(2026, 11, 21) })
    }

    @Test
    fun `widok semestru pokazuje wszystkie dni`() {
        assertEquals(3, ScheduleWindow.allDays(slots).size)
    }

    @Test
    fun `okno jest puste po ostatnich zajeciach`() {
        assertTrue(ScheduleWindow.nextDays(slots, LocalDate.of(2027, 1, 1)).isEmpty())
    }

    @Test
    fun `okno liczy sie od dnia dzisiejszego wlacznie`() {
        val dates = ScheduleWindow.dates(today)

        assertEquals(LocalDate.of(2026, 11, 10), dates.first())
        assertEquals(LocalDate.of(2026, 11, 16), dates.last())
    }
}
