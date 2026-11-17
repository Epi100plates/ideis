package pl.matiit.planzajec.domain

import java.time.LocalDate
import java.time.LocalTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.Fixtures

class ScheduleMapperTest {

    @Test
    fun `mapuje pola API na model domenowy`() {
        val slot = ScheduleMapper.toSlots(Fixtures.samplePlan())
            .first { it.subject == "Analiza matematyczna" }

        assertEquals(LocalDate.of(2026, 11, 14), slot.date)
        assertEquals(LocalTime.of(10, 45), slot.start)
        assertEquals(LocalTime.of(12, 15), slot.end)
        assertEquals("Ćwiczenia", slot.form)
        assertEquals("S55 27", slot.room)
        assertEquals("mgr Janusz Grabski", slot.lecturer)
        assertEquals(90, slot.durationMinutes)
        assertFalse(slot.isRemote)
    }

    @Test
    fun `rozpoznaje zajecia zdalne i brak sali`() {
        val slot = ScheduleMapper.toSlots(Fixtures.samplePlan())
            .first { it.subject == "Programowanie strukturalne" }

        assertTrue(slot.isRemote)
        assertNull(slot.room)
        assertEquals("link w materiałach", slot.notes)
    }

    @Test
    fun `pomija wpis z niepoprawna data`() {
        val subjects = ScheduleMapper.toSlots(Fixtures.samplePlan()).map { it.subject }

        assertFalse(subjects.contains("Wpis do pominięcia"))
    }

    @Test
    fun `parser godzin rozumie format bez zera wiodacego`() {
        assertEquals(LocalTime.of(9, 0), ClockParser.parse("9:00"))
        assertEquals(LocalTime.of(10, 45), ClockParser.parse(" 10:45 "))
    }

    @Test
    fun `parser godzin korzysta z minut gdy tekst jest pusty`() {
        assertEquals(LocalTime.of(9, 0), ClockParser.parse("", 540))
        assertNull(ClockParser.parse("", -1))
        assertNull(ClockParser.parse("25:00", -1))
    }

    @Test
    fun `konczy zajecia pozniej niz sie zaczynaja`() {
        val slot = ClassSlot(
            id = "x",
            date = LocalDate.of(2026, 11, 14),
            start = LocalTime.of(10, 0),
            end = LocalTime.of(10, 0),
            subject = "Test",
            form = null,
            mode = null,
            room = null,
            lecturer = null,
            notes = null,
            group = null,
        )

        assertEquals(0, slot.durationMinutes)
    }
}
