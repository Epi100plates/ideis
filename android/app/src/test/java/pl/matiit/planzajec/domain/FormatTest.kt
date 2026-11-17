package pl.matiit.planzajec.domain

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FormatTest {

    private val saturday = LocalDate.of(2026, 11, 14)

    @Test
    fun `etykiety dni sa po polsku`() {
        assertEquals("Sob", Format.weekdayShort(saturday))
        assertEquals("Niedz", Format.weekdayShort(LocalDate.of(2026, 11, 15)))
        assertEquals("Pon", Format.weekdayShort(LocalDate.of(2026, 11, 16)))
        assertEquals("Sob 14.11", Format.dayTitle(saturday))
    }

    @Test
    fun `dzis i jutro tylko dla biezacych dni`() {
        val today = LocalDate.of(2026, 11, 14)

        assertEquals("dziś", Format.relativeDay(today, today))
        assertEquals("jutro", Format.relativeDay(today.plusDays(1), today))
        assertNull(Format.relativeDay(today.plusDays(2), today))
    }

    @Test
    fun `data z rokiem bez powtarzania dnia tygodnia`() {
        assertEquals("14 listopada 2026", Format.dateWithYear(saturday))
        assertEquals("1 stycznia 2027", Format.dateWithYear(LocalDate.of(2027, 1, 1)))
        // Pełna etykieta nadal zawiera dzień tygodnia — używana w komunikatach.
        assertEquals("Sobota, 14 listopada 2026", Format.dayLong(saturday))
    }

    @Test
    fun `godziny zawsze z zerem wiodacym`() {
        assertEquals("09:00", Format.clock(LocalTime.of(9, 0)))
        assertEquals("10:45", Format.clock(LocalTime.of(10, 45)))
    }

    @Test
    fun `czas trwania w czytelnej formie`() {
        assertEquals("1h 30m", Format.duration(90))
        assertEquals("2h", Format.duration(120))
        assertEquals("45m", Format.duration(45))
        assertEquals("", Format.duration(0))
    }

    @Test
    fun `sala z numeru dostaje przedrostek`() {
        assertEquals("s. 204", Format.roomLabel("204"))
        assertEquals("s. 12a", Format.roomLabel("12a"))
        assertEquals("S55 27", Format.roomLabel("S55 27"))
        assertEquals("Aula główna", Format.roomLabel("Aula główna"))
        assertNull(Format.roomLabel(null))
        assertNull(Format.roomLabel("   "))
    }

    @Test
    fun `skrot typu zajec`() {
        assertEquals("Wyk", Format.formShort("Wykład"))
        assertEquals("Ćw", Format.formShort("Ćwiczenia"))
        assertEquals("Lab", Format.formShort("Laboratorium"))
        assertEquals("Sem", Format.formShort("Seminarium"))
        assertEquals("Proj", Format.formShort("Projekt"))
        assertEquals("Inne", Format.formShort("Inne"))
        assertNull(Format.formShort(null))
        assertNull(Format.formShort("  "))
    }

    @Test
    fun `tryb zajec po polsku`() {
        assertEquals("zdalnie", Format.modeLabel("zdalne"))
        assertEquals("stacjonarnie", Format.modeLabel("stacjonarne"))
        assertNull(Format.modeLabel(null))
    }

    @Test
    fun `odmiana liczby zajec`() {
        assertEquals("1 zajęcie", Format.classesCount(1))
        assertEquals("3 zajęcia", Format.classesCount(3))
        assertEquals("5 zajęć", Format.classesCount(5))
        assertEquals("12 zajęć", Format.classesCount(12))
        assertEquals("22 zajęcia", Format.classesCount(22))
    }

    @Test
    fun `odmiana liczby materialow i linkow`() {
        assertEquals("1 plik", Format.filesCount(1))
        assertEquals("2 pliki", Format.filesCount(2))
        assertEquals("5 plików", Format.filesCount(5))
        assertEquals("12 plików", Format.filesCount(12))
        assertEquals("22 pliki", Format.filesCount(22))

        assertEquals("1 link", Format.linksCount(1))
        assertEquals("4 linki", Format.linksCount(4))
        assertEquals("5 linków", Format.linksCount(5))
        assertEquals("13 linków", Format.linksCount(13))
    }

    @Test
    fun `wzgledna etykieta aktualizacji`() {
        val now = Instant.parse("2026-11-10T12:00:00Z").toEpochMilli()

        assertEquals("zaktualizowano przed chwilą", Format.updatedLabel(now - 30_000, now))
        assertEquals("zaktualizowano 5 min temu", Format.updatedLabel(now - 5 * 60_000, now))
        assertEquals("zaktualizowano 2 godz. temu", Format.updatedLabel(now - 2 * 3_600_000, now))
    }

    @Test
    fun `bezwzgledna etykieta dla widzetu`() {
        val zone = ZoneId.of("Europe/Warsaw")
        val now = Instant.parse("2026-11-10T12:00:00Z").toEpochMilli()
        val today = Instant.parse("2026-11-10T09:30:00Z").toEpochMilli()
        val yesterday = Instant.parse("2026-11-09T20:00:00Z").toEpochMilli()
        val older = Instant.parse("2026-11-05T08:15:00Z").toEpochMilli()

        assertEquals("10:30", Format.absoluteUpdateLabel(today, now, zone))
        assertEquals("wczoraj 21:00", Format.absoluteUpdateLabel(yesterday, now, zone))
        assertEquals("05.11 09:15", Format.absoluteUpdateLabel(older, now, zone))
        assertNull(Format.absoluteUpdateLabel(0L, now, zone))
    }

    @Test
    fun `plan starszy niz doba jest oznaczany jako nieaktualny`() {
        val now = Instant.parse("2026-11-10T12:00:00Z").toEpochMilli()

        assertTrue(Format.staleLabel(now - 25 * 3_600_000, now))
        assertFalse(Format.staleLabel(now - 3_600_000, now))
        assertFalse(Format.staleLabel(0L, now))
    }

    @Test
    fun `rozmiar pliku w polskim formacie`() {
        assertEquals("512 B", Format.fileSize(512))
        assertEquals("1,5 kB", Format.fileSize(1536))
        assertEquals("2,0 MB", Format.fileSize(2 * 1024 * 1024))
    }

    @Test
    fun `krotka data dodania materialu`() {
        val zone = ZoneId.of("Europe/Warsaw")

        assertEquals("10.11", Format.isoDateShort("2026-11-10T10:00:00.000Z", zone))
        assertNull(Format.isoDateShort(null, zone))
        assertNull(Format.isoDateShort("nie-data", zone))
    }

    @Test
    fun `polskie nazwy miesiecy i dni`() {
        assertEquals("Listopad 2026", Format.monthLabel(java.time.YearMonth.of(2026, 11)))
        assertEquals("lutego", Format.monthGenitive(2))
        assertEquals("Sobota", Format.weekdayFull(LocalDate.of(2026, 11, 14)))
        assertEquals("Sobota, 14 listopada 2026", Format.dayLong(LocalDate.of(2026, 11, 14)))
    }

    @Test
    fun `zakres dat zjazdu`() {
        assertEquals(
            "14–15 listopada 2026",
            Format.dateRange(LocalDate.of(2026, 11, 14), LocalDate.of(2026, 11, 15)),
        )
        assertEquals(
            "28 listopada – 6 grudnia 2026",
            Format.dateRange(LocalDate.of(2026, 11, 28), LocalDate.of(2026, 12, 6)),
        )
        assertEquals("Sob 14.11", Format.dateRange(LocalDate.of(2026, 11, 14), LocalDate.of(2026, 11, 14)))
    }

    @Test
    fun `czas laczny zjazdu`() {
        assertEquals("6 h 30 min", Format.minutesLabel(390))
        assertEquals("6 h", Format.minutesLabel(360))
        assertEquals("45 min", Format.minutesLabel(45))
        assertEquals("0 min", Format.minutesLabel(0))
    }

    @Test
    fun `krotkie kiedy to bylo dla sprawdzen aktualizacji`() {
        val now = 1_800_000_000_000L
        assertEquals(null, Format.agoLabel(0L, now))
        assertEquals("przed chwilą", Format.agoLabel(now - 20_000L, now))
        assertEquals("5 min temu", Format.agoLabel(now - 5 * 60_000L, now))
        assertEquals("2 godz. temu", Format.agoLabel(now - 2 * 60 * 60_000L, now))
        assertEquals("wczoraj", Format.agoLabel(now - 30 * 60 * 60_000L, now))
        assertEquals("3 dni temu", Format.agoLabel(now - 3 * 24 * 60 * 60_000L, now))
        // Czas z przyszłości (zmiana zegara) nie może dać ujemnych minut.
        assertEquals("przed chwilą", Format.agoLabel(now + 60_000L, now))
    }
}
