package pl.matiit.planzajec.domain

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.ZoneId
import java.util.Locale

/** Polskie etykiety bez zależności od Locale — deterministyczne w testach. */
object Format {

    private val WEEKDAYS = listOf("Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz")

    private val WEEKDAYS_FULL = listOf(
        "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela",
    )

    private val MONTHS_NOMINATIVE = listOf(
        "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
        "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
    )

    private val MONTHS_GENITIVE = listOf(
        "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
        "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
    )

    fun weekdayShort(date: LocalDate): String = WEEKDAYS[date.dayOfWeek.value - 1]

    fun weekdayFull(date: LocalDate): String = WEEKDAYS_FULL[date.dayOfWeek.value - 1]

    fun dateShort(date: LocalDate): String =
        "%02d.%02d".format(date.dayOfMonth, date.monthValue)

    fun dayTitle(date: LocalDate): String = "${weekdayShort(date)} ${dateShort(date)}"

    /** „10 listopada 2026” — sama data, bez nazwy dnia tygodnia. */
    fun dateWithYear(date: LocalDate): String =
        "${date.dayOfMonth} ${monthGenitive(date.monthValue)} ${date.year}"

    /** „Sobota, 14 listopada 2026” — pełna data w nagłówku dnia. */
    fun dayLong(date: LocalDate): String = "${weekdayFull(date)}, ${dateWithYear(date)}"

    /** „dziś”/„jutro” dla nagłówka dnia; null dla pozostałych dni. */
    fun relativeDay(date: LocalDate, today: LocalDate): String? = when (date) {
        today -> "dziś"
        today.plusDays(1) -> "jutro"
        else -> null
    }

    fun clock(time: LocalTime): String = "%02d:%02d".format(time.hour, time.minute)

    fun timeRange(slot: ClassSlot): String = "${clock(slot.start)}–${clock(slot.end)}"

    /**
     * Sala w formie czytelnej w widżecie: samo „204” dostaje przedrostek „s.”,
     * a pełne oznaczenia z API („S55 27”) zostają bez zmian.
     */
    fun roomLabel(room: String?): String? {
        val raw = room?.trim().orEmpty()
        if (raw.isEmpty()) return null
        return if (ROOM_NUMBER.matches(raw)) "s. $raw" else raw
    }

    /**
     * Skrót typu zajęć do widżetu: „Wykład” → „Wyk”, „Ćwiczenia” → „Ćw”,
     * „Laboratorium” → „Lab”. Nieznane formy zostają bez zmian.
     */
    fun formShort(form: String?): String? {
        val raw = form?.trim().orEmpty()
        if (raw.isEmpty()) return null
        return when {
            raw.startsWith("Wyk", ignoreCase = true) -> "Wyk"
            raw.startsWith("Ćw", ignoreCase = true) || raw.startsWith("Cw", ignoreCase = true) -> "Ćw"
            raw.startsWith("Lab", ignoreCase = true) -> "Lab"
            raw.startsWith("Sem", ignoreCase = true) -> "Sem"
            raw.startsWith("Proj", ignoreCase = true) -> "Proj"
            else -> raw
        }
    }

    fun duration(minutes: Int): String {
        if (minutes <= 0) return ""
        val hours = minutes / 60
        val rest = minutes % 60
        return when {
            hours > 0 && rest > 0 -> "${hours}h ${rest}m"
            hours > 0 -> "${hours}h"
            else -> "${rest}m"
        }
    }

    fun modeLabel(mode: String?): String? = when {
        mode == null -> null
        mode.contains("zdaln", ignoreCase = true) -> "zdalnie"
        mode.contains("stacjonarn", ignoreCase = true) -> "stacjonarnie"
        else -> mode
    }

    /** „zaktualizowano …” — krótko, bez dat bezwzględnych dla świeżych danych. */
    fun updatedLabel(savedAtMillis: Long, nowMillis: Long): String? {
        if (savedAtMillis <= 0L) return null
        val diff = (nowMillis - savedAtMillis).coerceAtLeast(0L)
        val minutes = diff / 60_000
        return when {
            minutes < 1 -> "zaktualizowano przed chwilą"
            minutes < 60 -> "zaktualizowano $minutes min temu"
            minutes < 24 * 60 -> "zaktualizowano ${minutes / 60} godz. temu"
            minutes < 48 * 60 -> "zaktualizowano wczoraj"
            else -> {
                val days = minutes / (24 * 60)
                "zaktualizowano $days dni temu"
            }
        }
    }

    /**
     * Krótkie „kiedy to było” bez czasownika — dla sprawdzeń aktualizacji:
     * „przed chwilą”, „5 min temu”, „2 godz. temu”, „wczoraj”, „3 dni temu”.
     */
    fun agoLabel(millis: Long, nowMillis: Long): String? {
        if (millis <= 0L) return null
        val diff = (nowMillis - millis).coerceAtLeast(0L)
        val minutes = diff / 60_000
        return when {
            minutes < 1 -> "przed chwilą"
            minutes < 60 -> "$minutes min temu"
            minutes < 24 * 60 -> "${minutes / 60} godz. temu"
            minutes < 48 * 60 -> "wczoraj"
            else -> "${minutes / (24 * 60)} dni temu"
        }
    }

    /**
     * Etykieta aktualizacji dla widżetu: czas bezwzględny, bo widżet odświeża
     * się rzadko i nie może „kłamać” o minutach.
     */    fun absoluteUpdateLabel(savedAtMillis: Long, nowMillis: Long, zone: ZoneId): String? {
        if (savedAtMillis <= 0L) return null
        val saved = Instant.ofEpochMilli(savedAtMillis).atZone(zone)
        val today = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate()
        val clock = "%02d:%02d".format(saved.hour, saved.minute)
        return when (saved.toLocalDate()) {
            today -> clock
            today.minusDays(1) -> "wczoraj $clock"
            else -> "${dateShort(saved.toLocalDate())} $clock"
        }
    }

    fun staleLabel(savedAtMillis: Long, nowMillis: Long): Boolean =
        savedAtMillis > 0L && nowMillis - savedAtMillis > 24 * 60 * 60 * 1000L

    /** Polska odmiana: „1 zajęcie”, „3 zajęcia”, „7 zajęć”. */
    fun classesCount(count: Int): String = when {
        count == 1 -> "1 zajęcie"
        count % 100 in 12..14 -> "$count zajęć"
        count % 10 in 2..4 -> "$count zajęcia"
        else -> "$count zajęć"
    }

    /** Liczba materiałów: „1 plik”, „3 pliki”, „5 plików”. */
    fun filesCount(count: Int): String = plural(count, "plik", "pliki", "plików")

    /** Liczba linków: „1 link”, „3 linki”, „5 linków”. */
    fun linksCount(count: Int): String = plural(count, "link", "linki", "linków")

    private fun plural(count: Int, one: String, few: String, many: String): String = when {
        count == 1 -> "1 $one"
        count % 100 in 12..14 -> "$count $many"
        count % 10 in 2..4 -> "$count $few"
        else -> "$count $many"
    }

    /** Rozmiar pliku w formie czytelnej na telefonie. */
    fun fileSize(bytes: Long): String {
        if (bytes <= 0) return "0 B"
        val kb = bytes / 1024.0
        val mb = kb / 1024.0
        return when {
            bytes < 1024 -> "$bytes B"
            mb < 1 -> "%.1f kB".format(Locale.forLanguageTag("pl"), kb)
            else -> "%.1f MB".format(Locale.forLanguageTag("pl"), mb)
        }
    }

    /** Data dodania materiału bez godziny — w liście wystarcza `12.11`. */
    fun isoDateShort(iso: String?, zone: ZoneId = ZoneId.systemDefault()): String? =
        runCatching { Instant.parse(iso).atZone(zone).toLocalDate() }.getOrNull()?.let(::dateShort)

    fun monthNominative(month: YearMonth): String = MONTHS_NOMINATIVE[month.monthValue - 1]

    fun monthGenitive(monthNumber: Int): String = MONTHS_GENITIVE[monthNumber - 1]

    fun monthLabel(month: YearMonth): String = "${monthNominative(month)} ${month.year}"

    /** „14–15 listopada 2026”, a dla jednego dnia pełna data. */
    fun dateRange(from: LocalDate, to: LocalDate): String = when {
        from == to -> dayTitle(from)
        from.year == to.year && from.month == to.month ->
            "${from.dayOfMonth}–${to.dayOfMonth} ${monthGenitive(to.monthValue)} ${to.year}"

        from.year == to.year ->
            "${from.dayOfMonth} ${monthGenitive(from.monthValue)} – " +
                "${to.dayOfMonth} ${monthGenitive(to.monthValue)} ${to.year}"

        else -> "${dateShort(from)}–${dateShort(to)}"
    }

    /** „6 h 30 min”, „6 h”, „45 min”. */
    fun minutesLabel(totalMinutes: Int): String {
        if (totalMinutes <= 0) return "0 min"
        val hours = totalMinutes / 60
        val minutes = totalMinutes % 60
        return when {
            hours > 0 && minutes > 0 -> "$hours h $minutes min"
            hours > 0 -> "$hours h"
            else -> "$minutes min"
        }
    }

    /**
     * Skraca nazwę grupy z API („Informatyka, 1st 1sem Ćw (gr. 2) N”) do formy
     * mieszczącej się w nagłówku: „Ćw (gr. 2)”.
     */
    fun shortGroupName(name: String): String {
        val match = GROUP_PATTERN.find(name)?.value?.trim() ?: return name
        return match.replace(TRAILING_MODE, "").trim()
    }

    private val ROOM_NUMBER = Regex("\\d{1,4}[a-zA-Z]?")
    private val GROUP_PATTERN = Regex("(Wyk|Ćw|Lab|Sem|Proj)[^,]*")
    private val TRAILING_MODE = Regex("\\s+[NS]$")
}
