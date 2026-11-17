package pl.matiit.planzajec.domain

import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ScheduleViewsTest {

    private fun day(date: String, classes: Int = 1): DaySchedule {
        val d = LocalDate.parse(date)
        return DaySchedule(
            date = d,
            classes = (1..classes).map { index ->
                slot(
                    id = "$date-$index",
                    date = d,
                    start = LocalTime.of(8 + index, 0),
                    end = LocalTime.of(9 + index, 0),
                    mode = if (index % 2 == 0) "zdalne" else "stacjonarne",
                )
            },
        )
    }

    private fun slot(
        id: String,
        date: LocalDate,
        start: LocalTime,
        end: LocalTime,
        mode: String = "stacjonarne",
    ) = ClassSlot(
        id = id,
        date = date,
        start = start,
        end = end,
        subject = "Przedmiot $id",
        form = "Wykład",
        mode = mode,
        room = "S55 27",
        lecturer = "prowadzący",
        notes = null,
        group = "grupa",
    )

    @Test
    fun `tydzien zaczyna sie w poniedzialek`() {
        assertEquals(LocalDate.of(2026, 11, 9), ScheduleViews.weekStart(LocalDate.of(2026, 11, 14)))
        assertEquals(LocalDate.of(2026, 11, 9), ScheduleViews.weekStart(LocalDate.of(2026, 11, 9)))
        assertEquals(LocalDate.of(2026, 11, 9), ScheduleViews.weekStart(LocalDate.of(2026, 11, 15)))
    }

    @Test
    fun `tydzien ma siedem dni od poniedzialku`() {
        val dates = ScheduleViews.weekDates(LocalDate.of(2026, 11, 14))

        assertEquals(7, dates.size)
        assertEquals(LocalDate.of(2026, 11, 9), dates.first())
        assertEquals(LocalDate.of(2026, 11, 15), dates.last())
    }

    @Test
    fun `siatka miesiaca ma pelne tygodnie od poniedzialku`() {
        val weeks = ScheduleViews.monthWeeks(YearMonth.of(2026, 11))

        // 1 listopada 2026 to niedziela — sześć pustych pól przed nią.
        assertEquals(7, weeks.first().size)
        assertNull(weeks.first()[0])
        assertEquals(LocalDate.of(2026, 11, 1), weeks.first()[6])
        assertEquals(LocalDate.of(2026, 11, 2), weeks[1][0])
        assertTrue(weeks.all { it.size == 7 })
    }

    @Test
    fun `nakladajace sie zajecia dostaja osobne kolumny`() {
        val date = LocalDate.of(2026, 11, 14)
        val first = slot("a", date, LocalTime.of(10, 0), LocalTime.of(12, 0))
        val second = slot("b", date, LocalTime.of(10, 30), LocalTime.of(11, 30))
        val later = slot("c", date, LocalTime.of(13, 0), LocalTime.of(14, 0))

        val blocks = ScheduleViews.timetable(listOf(first, second, later))

        val byId = blocks.associateBy { it.slot.id }
        assertEquals(2, byId.getValue("a").columns)
        assertEquals(2, byId.getValue("b").columns)
        assertEquals(0, byId.getValue("a").column)
        assertEquals(1, byId.getValue("b").column)
        assertEquals(1, byId.getValue("c").columns)
    }

    @Test
    fun `zajecia bez nakladania maja jedna kolumne`() {
        val date = LocalDate.of(2026, 11, 14)
        val blocks = ScheduleViews.timetable(
            listOf(
                slot("a", date, LocalTime.of(8, 0), LocalTime.of(9, 30)),
                slot("b", date, LocalTime.of(10, 0), LocalTime.of(11, 30)),
            ),
        )

        assertTrue(blocks.all { it.columns == 1 })
    }

    @Test
    fun `najblizszy dzien przed i po`() {
        val dates = listOf(
            LocalDate.of(2026, 11, 14),
            LocalDate.of(2026, 11, 15),
            LocalDate.of(2026, 11, 21),
        )

        assertEquals(LocalDate.of(2026, 11, 15), ScheduleViews.neighborDate(dates, LocalDate.of(2026, 11, 14), true))
        assertEquals(LocalDate.of(2026, 11, 15), ScheduleViews.neighborDate(dates, LocalDate.of(2026, 11, 21), false))
        assertNull(ScheduleViews.neighborDate(dates, LocalDate.of(2026, 11, 21), true))
    }

    @Test
    fun `gest w lewo przechodzi do nastepnego dnia z zajęciami`() {
        val dates = listOf(
            LocalDate.of(2026, 11, 7),
            LocalDate.of(2026, 11, 14),
            LocalDate.of(2026, 11, 15),
        )

        assertEquals(
            LocalDate.of(2026, 11, 14),
            ScheduleViews.swipeTarget(dates, LocalDate.of(2026, 11, 7), deltaX = -180f),
        )
        assertEquals(
            LocalDate.of(2026, 11, 15),
            ScheduleViews.swipeTarget(dates, LocalDate.of(2026, 11, 14), deltaX = -180f),
        )
    }

    @Test
    fun `gest w prawo wraca do poprzedniego dnia z zajęciami`() {
        val dates = listOf(
            LocalDate.of(2026, 11, 7),
            LocalDate.of(2026, 11, 14),
            LocalDate.of(2026, 11, 15),
        )

        assertEquals(
            LocalDate.of(2026, 11, 14),
            ScheduleViews.swipeTarget(dates, LocalDate.of(2026, 11, 15), deltaX = 180f),
        )
        assertEquals(
            LocalDate.of(2026, 11, 7),
            ScheduleViews.swipeTarget(dates, LocalDate.of(2026, 11, 14), deltaX = 200f),
        )
    }

    @Test
    fun `krotki gest i krance zakresu nie zmieniaja dnia`() {
        val dates = listOf(LocalDate.of(2026, 11, 14), LocalDate.of(2026, 11, 15))

        assertNull(ScheduleViews.swipeTarget(dates, LocalDate.of(2026, 11, 14), deltaX = -40f))
        assertNull(ScheduleViews.swipeTarget(dates, LocalDate.of(2026, 11, 15), deltaX = -200f))
        assertNull(ScheduleViews.swipeTarget(dates, LocalDate.of(2026, 11, 14), deltaX = 200f))
    }

    @Test
    fun `lista miesiecy obejmuje zakres semestru`() {
        val days = listOf(day("2026-11-14"), day("2027-02-07"))

        val months = ScheduleViews.months(days)

        assertEquals(
            listOf(
                YearMonth.of(2026, 11),
                YearMonth.of(2026, 12),
                YearMonth.of(2027, 1),
                YearMonth.of(2027, 2),
            ),
            months,
        )
    }

    @Test
    fun `dzien startowy to dzis albo najblizsze zajecia`() {
        val days = listOf(day("2026-11-14"), day("2026-11-15"))

        assertEquals(LocalDate.of(2026, 11, 14), ScheduleViews.initialDay(days, LocalDate.of(2026, 11, 10)))
        assertEquals(LocalDate.of(2026, 11, 14), ScheduleViews.initialDay(days, LocalDate.of(2026, 11, 14)))
        assertEquals(LocalDate.of(2026, 11, 15), ScheduleViews.initialDay(days, LocalDate.of(2027, 1, 1)))
        assertNull(ScheduleViews.initialDay(emptyList(), LocalDate.of(2026, 11, 10)))
    }

    @Test
    fun `kotwica widokow to wybrany dzien a bez wyboru pierwsze zajecia`() {
        // Plan zaczyna się 27.11, a „dziś” jest 16.11 — tydzień, dzień i miesiąc
        // muszą startować na 27.11, nie na dniu dzisiejszym (v33: parity z web).
        val days = listOf(day("2026-11-27"), day("2026-11-28"))
        val today = LocalDate.of(2026, 11, 16)

        assertEquals(LocalDate.of(2026, 11, 27), ScheduleViews.anchorDay(days, today, null))
        assertEquals(
            LocalDate.of(2026, 11, 23),
            ScheduleViews.weekStart(ScheduleViews.anchorDay(days, today, null)!!),
        )

        // Wybór użytkownika (np. kafelek dnia w „Semestrze”) ma pierwszeństwo.
        assertEquals(
            LocalDate.of(2026, 11, 28),
            ScheduleViews.anchorDay(days, today, LocalDate.of(2026, 11, 28)),
        )

        // Plan bez zajęć nie ma kotwicy — widoki pokazują własny pusty stan.
        assertNull(ScheduleViews.anchorDay(emptyList(), today, null))
        assertEquals(
            LocalDate.of(2026, 11, 28),
            ScheduleViews.anchorDay(emptyList(), today, LocalDate.of(2026, 11, 28)),
        )
    }

    @Test
    fun `godziny siatki tygodnia obejmuja zajecia`() {
        val date = LocalDate.of(2026, 11, 14)
        val classes = listOf(
            slot("a", date, LocalTime.of(8, 0), LocalTime.of(9, 30)),
            slot("b", date, LocalTime.of(18, 0), LocalTime.of(20, 15)),
        )

        val hours = ScheduleViews.hourBounds(classes)

        assertEquals(8, hours.first)
        assertEquals(21, hours.last)
    }

    @Test
    fun `aplikacja startuje zawsze na dniu`() {
        assertEquals(ScheduleViewMode.DAY, ScheduleViewMode.default)
        assertEquals("Dzień", ScheduleViewMode.default.label)
    }

    @Test
    fun `widoki sa w kolejnosci kafli na dole ekranu`() {
        assertEquals(
            listOf("Dzień", "Tydzień", "Miesiąc", "Semestr"),
            ScheduleViewMode.entries.map { it.label },
        )
    }

    @Test
    fun `gest w lewo to nastepny okres a w prawo poprzedni`() {
        assertEquals(true, ScheduleViews.swipeForward(deltaX = -180f))
        assertEquals(false, ScheduleViews.swipeForward(deltaX = 180f))
        assertNull(ScheduleViews.swipeForward(deltaX = -20f))
        assertNull(ScheduleViews.swipeForward(deltaX = 0f))
        assertEquals(false, ScheduleViews.swipeForward(deltaX = 90f, thresholdPx = 80f))
    }

    @Test
    fun `krotki ale szybki gest tez zmienia okres`() {
        // „Pstryknięcie” palcem: 20 dp i 1500 dp/s — wcześniej przepadało,
        // bo liczyła się tylko odległość.
        assertEquals(
            true,
            ScheduleViews.swipeForward(
                deltaX = -20f,
                thresholdPx = 40f,
                velocityPx = -1500f,
                velocityThresholdPx = 600f,
                minPx = 12f,
            ),
        )
        assertEquals(
            false,
            ScheduleViews.swipeForward(
                deltaX = 20f,
                thresholdPx = 40f,
                velocityPx = 1500f,
                velocityThresholdPx = 600f,
                minPx = 12f,
            ),
        )
    }

    @Test
    fun `wolny i krotki ruch nie zmienia okresu`() {
        assertNull(
            ScheduleViews.swipeForward(
                deltaX = -20f,
                thresholdPx = 40f,
                velocityPx = -120f,
                velocityThresholdPx = 600f,
                minPx = 12f,
            ),
        )
    }

    @Test
    fun `drgniecie palca nie liczy sie nawet przy duzej predkosci`() {
        assertNull(
            ScheduleViews.swipeForward(
                deltaX = -4f,
                thresholdPx = 40f,
                velocityPx = -3000f,
                velocityThresholdPx = 600f,
                minPx = 12f,
            ),
        )
        assertNull(
            ScheduleViews.swipeForward(
                deltaX = 0f,
                thresholdPx = 40f,
                velocityPx = -3000f,
                velocityThresholdPx = 600f,
                minPx = 12f,
            ),
        )
    }

    @Test
    fun `szybki gest bez predkosci nadal wymaga progu odleglosci`() {
        // `detectHorizontalDragGestures` może nie dać próbek prędkości (np. jeden
        // ruch) — wtedy decyduje odległość, więc gest nie zmienia okresu.
        assertNull(
            ScheduleViews.swipeForward(
                deltaX = -30f,
                thresholdPx = 40f,
                velocityPx = 0f,
                velocityThresholdPx = 600f,
                minPx = 12f,
            ),
        )
        assertEquals(
            true,
            ScheduleViews.swipeForward(
                deltaX = -45f,
                thresholdPx = 40f,
                velocityPx = 0f,
                velocityThresholdPx = 600f,
                minPx = 12f,
            ),
        )
    }
}
