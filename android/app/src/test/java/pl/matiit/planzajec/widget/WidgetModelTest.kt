package pl.matiit.planzajec.widget

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.Fixtures

class WidgetModelTest {

    private val zone = ZoneId.of("Europe/Warsaw")
    private val plan = Fixtures.samplePlan()
    private val today = LocalDate.of(2026, 11, 10)
    private val now = Instant.parse("2026-11-10T12:00:00Z").toEpochMilli()
    private val savedAt = Instant.parse("2026-11-10T09:30:00Z").toEpochMilli()

    @Test
    fun `model pokazuje najblizszy tydzien z podzialem na dni`() {
        val model = WidgetModelBuilder.build(plan, "21188", today, now, savedAt, zone)

        assertEquals(2, model.days.size)
        assertEquals("Sob 14.11", model.days[0].label)
        assertEquals("Niedz 15.11", model.days[1].label)

        val first = model.days[0].rows.first()
        assertEquals("10:45", first.start)
        assertEquals("12:15", first.end)
        assertEquals("10:45–12:15", first.timeRange)
        assertEquals("Analiza matematyczna", first.subject)
        assertEquals("Ćw", first.formLabel)
        assertEquals("S55 27", first.room)
        assertEquals("S55 27", first.roomLabel)
        assertEquals("S55 27", first.placeLabel)
        assertEquals("1h 30m", first.durationLabel)
        assertEquals("Ćw · S55 27 · 1h 30m", first.metaLabel)
        assertEquals("Ćw · S55 27", first.shortMetaLabel)
        assertEquals(3, model.totalClasses)
    }

    @Test
    fun `wiersz zajec zdalnych nie ma sali ale pokazuje zdalnie`() {
        val model = WidgetModelBuilder.build(plan, "21188", today, now, savedAt, zone)

        val remote = model.days[0].rows[1]
        assertNull(remote.room)
        assertNull(remote.roomLabel)
        assertEquals("zdalnie", remote.placeLabel)
        assertEquals("Lab", remote.formLabel)
        assertEquals("Lab · zdalnie · 1h 30m", remote.metaLabel)
        assertEquals("Lab · zdalnie", remote.shortMetaLabel)
    }

    @Test
    fun `naglowek zawiera zakres dat i czas pobrania planu`() {
        val model = WidgetModelBuilder.build(plan, "21188", today, now, savedAt, zone)

        assertEquals("10.11–16.11", model.rangeLabel)
        assertEquals("08:00", model.updatedLabel)
    }

    @Test
    fun `grupa jest skracana do formy czytelnej w widzecie`() {
        assertEquals(
            "Ćw (gr. 2)",
            WidgetModelBuilder.shortGroupName("Informatyka, 1st 1sem Ćw (gr. 2) N"),
        )
        assertEquals(
            "Ćw (gr. 2)",
            WidgetModelBuilder.groupLabel(plan, "21188"),
        )
    }

    @Test
    fun `brak planu daje pusty model z nazwa grupy`() {
        val model = WidgetModelBuilder.build(null, "21188", today, now, null, zone)

        assertTrue(model.isEmpty)
        assertEquals("grupa 21188", model.groupLabel)
        assertNull(model.updatedLabel)
    }

    @Test
    fun `fingerprint nie zalezy od czasu wzglednego`() {
        val first = WidgetModelBuilder.build(plan, "21188", today, now, savedAt, zone)
        val second = WidgetModelBuilder.build(plan, "21188", today, now + 90_000, savedAt, zone)

        assertEquals(first.fingerprint(), second.fingerprint())
    }

    @Test
    fun `fingerprint zmienia sie gdy zmienia sie plan`() {
        val first = WidgetModelBuilder.build(plan, "21188", today, now, savedAt, zone)
        val later = WidgetModelBuilder.build(plan, "21188", today.plusDays(3), now, savedAt, zone)

        assertTrue(first.fingerprint() != later.fingerprint())
    }
}

