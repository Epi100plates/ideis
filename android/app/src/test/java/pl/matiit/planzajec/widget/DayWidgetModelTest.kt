package pl.matiit.planzajec.widget

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.Fixtures
import pl.matiit.planzajec.domain.DaySchedule
import pl.matiit.planzajec.domain.ScheduleMapper
import pl.matiit.planzajec.domain.ScheduleWindow

class DayWidgetModelTest {

    private val zone = ZoneId.of("Europe/Warsaw")
    private val plan = Fixtures.samplePlan()
    private val days = ScheduleWindow.allDays(ScheduleMapper.toSlots(plan))
    private val now = Instant.parse("2026-11-10T12:00:00Z").toEpochMilli()
    private val savedAt = Instant.parse("2026-11-10T09:30:00Z").toEpochMilli()

    @Test
    fun `wybiera dzis gdy sa zajecia`() {
        val day = DayWidgetModelBuilder.pickDay(days, LocalDate.of(2026, 11, 14))

        assertEquals(LocalDate.of(2026, 11, 14), day?.date)
    }

    @Test
    fun `bez zajec dzis wybiera najblizszy dzien`() {
        val day = DayWidgetModelBuilder.pickDay(days, LocalDate.of(2026, 11, 10))

        assertEquals(LocalDate.of(2026, 11, 14), day?.date)
    }

    @Test
    fun `po ostatnim dniu wybiera ostatni dzien planu`() {
        val day = DayWidgetModelBuilder.pickDay(days, LocalDate.of(2027, 1, 1))

        assertEquals(LocalDate.of(2026, 11, 21), day?.date)
    }

    @Test
    fun `brak planu daje pusty wybor`() {
        assertNull(DayWidgetModelBuilder.pickDay(emptyList<DaySchedule>(), LocalDate.of(2026, 11, 10)))
    }

    @Test
    fun `model dnia pokazuje dzisiejszy plan i godzine pobrania`() {
        val model = DayWidgetModelBuilder.build(
            plan = plan,
            groupId = "21188",
            today = LocalDate.of(2026, 11, 14),
            nowMillis = now,
            savedAtMillis = savedAt,
            zone = zone,
        )

        assertEquals("Dziś · Sob 14.11", model.dayLabel)
        assertEquals(2, model.rows.size)
        assertEquals("10:45", model.rows[0].start)
        assertEquals("12:15", model.rows[0].end)
        assertEquals("10:45–12:15", model.rows[0].timeRange)
        assertEquals("Analiza matematyczna", model.rows[0].subject)
        assertEquals("S55 27", model.rows[0].room)
        assertEquals("Ćw · S55 27 · 1h 30m", model.rows[0].metaLabel)
        assertNull(model.rows[1].room)
        assertEquals("zdalnie", model.rows[1].placeLabel)
        assertEquals("08:00", model.updatedLabel)
        assertTrue(!model.isEmpty)
    }

    @Test
    fun `jutro i dalsze dni maja czytelne etykiety`() {
        val tomorrow = DayWidgetModelBuilder.build(
            plan = plan,
            groupId = "21188",
            today = LocalDate.of(2026, 11, 13),
            nowMillis = now,
            savedAtMillis = savedAt,
            zone = zone,
        )
        assertEquals("Jutro · Sob 14.11", tomorrow.dayLabel)

        val later = DayWidgetModelBuilder.build(
            plan = plan,
            groupId = "21188",
            today = LocalDate.of(2026, 11, 10),
            nowMillis = now,
            savedAtMillis = savedAt,
            zone = zone,
        )
        assertEquals("Sobota 14.11", later.dayLabel)
    }

    @Test
    fun `brak planu daje pusty stan widzetu`() {
        val model = DayWidgetModelBuilder.build(
            plan = null,
            groupId = "21188",
            today = LocalDate.of(2026, 11, 10),
            nowMillis = now,
            savedAtMillis = null,
            zone = zone,
        )

        assertTrue(model.isEmpty)
        assertEquals("Brak zajęć", model.dayLabel)
        assertEquals("grupa 21188", model.groupLabel)
        assertNull(model.updatedLabel)
    }

    @Test
    fun `fingerprint zalezy od dnia a nie od czasu`() {
        val first = DayWidgetModelBuilder.build(
            plan = plan, groupId = "21188", today = LocalDate.of(2026, 11, 14),
            nowMillis = now, savedAtMillis = savedAt, zone = zone,
        )
        val second = DayWidgetModelBuilder.build(
            plan = plan, groupId = "21188", today = LocalDate.of(2026, 11, 14),
            nowMillis = now + 90_000, savedAtMillis = savedAt, zone = zone,
        )
        val nextDay = DayWidgetModelBuilder.build(
            plan = plan, groupId = "21188", today = LocalDate.of(2026, 11, 15),
            nowMillis = now, savedAtMillis = savedAt, zone = zone,
        )

        assertEquals(first.fingerprint(), second.fingerprint())
        assertTrue(first.fingerprint() != nextDay.fingerprint())
        assertTrue(first.fingerprint().startsWith("day|"))
    }
}
