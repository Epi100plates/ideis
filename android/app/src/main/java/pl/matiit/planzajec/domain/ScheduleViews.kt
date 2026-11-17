package pl.matiit.planzajec.domain

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit

/**
 * Tryby widoku — cztery okresy, każdy przesuwany gestem w bok: dzień, tydzień,
 * miesiąc i semestr (tyle zostaje z web po ograniczeniu do widoków, które mają
 * sens na telefonie).
 *
 * Kolejność wpisów = kolejność kafelków na dole ekranu. Wybór **nie jest
 * zapamiętywany**: aplikacja zawsze otwiera się na dniu, bo to jedyny widok,
 * który odpowiada na pytanie „co mam teraz” (decyzja użytkownika z 1.7).
 */
enum class ScheduleViewMode(val label: String) {
    DAY("Dzień"),
    WEEK("Tydzień"),
    MONTH("Miesiąc"),
    SEMESTR("Semestr"),
    ;

    companion object {
        val default = DAY
    }
}

/** Blok w siatce tygodnia: pozycja liczona od godziny startowej widoku. */
data class TimedBlock(
    val slot: ClassSlot,
    val startMinute: Int,
    val endMinute: Int,
    val column: Int,
    val columns: Int,
)

/**
 * Czysta logika widoków: siatki miesięcy, kolumny nakładających się zajęć,
 * przesuwanie gestem między okresami. Bez Androida i bez Compose, więc wszystko
 * jest testowane na JVM.
 */
object ScheduleViews {

    fun weekStart(date: LocalDate): LocalDate = date.with(DayOfWeek.MONDAY)

    fun weekDates(anchor: LocalDate): List<LocalDate> = List(7) { weekStart(anchor).plusDays(it.toLong()) }

    /**
     * Komórki siatki miesiąca, od poniedziałku, z pustymi polami na początku
     * i końcu. Zawsze pełne tygodnie (wiersze po 7), jak w kalendarzu web.
     */
    fun monthWeeks(month: YearMonth): List<List<LocalDate?>> {
        val first = month.atDay(1)
        val leading = first.dayOfWeek.value - 1
        val cells = buildList<LocalDate?> {
            repeat(leading) { add(null) }
            for (day in 1..month.lengthOfMonth()) add(month.atDay(day))
        }
        return cells.chunked(7).map { row -> row + List(7 - row.size) { null } }
    }

    /** Miesiące od pierwszego do ostatniego dnia z zajęciami (włącznie). */
    fun months(days: List<DaySchedule>): List<YearMonth> {
        if (days.isEmpty()) return emptyList()
        val from = days.first().date.withDayOfMonth(1)
        val to = days.last().date.withDayOfMonth(1)
        val count = ChronoUnit.MONTHS.between(from, to).toInt()
        return (0..count).map { from.plusMonths(it.toLong()) }.map(YearMonth::from)
    }

    fun daysInMonth(days: List<DaySchedule>, month: YearMonth): List<DaySchedule> =
        days.filter { YearMonth.from(it.date) == month }

    fun dayBounds(days: List<DaySchedule>): Pair<LocalDate, LocalDate>? =
        if (days.isEmpty()) null else days.first().date to days.last().date

    fun classesOn(days: List<DaySchedule>, date: LocalDate): List<ClassSlot> =
        days.firstOrNull { it.date == date }?.classes.orEmpty()

    /** Najbliższy dzień z zajęciami przed/po podanej dacie (do „skoku”). */
    fun neighborDate(dates: List<LocalDate>, current: LocalDate, forward: Boolean): LocalDate? =
        if (forward) dates.filter { it.isAfter(current) }.minOrNull()
        else dates.filter { it.isBefore(current) }.maxOrNull()

    /**
     * Cel gestu przesunięcia w widoku dnia: w lewo (dx < 0) → następny dzień
     * z zajęciami, w prawo (dx > 0) → poprzedni. Puste dni są pomijane, tak jak
     * w swipe obsłudze wersji web. Poniżej progu gest jest ignorowany.
     */
    fun swipeTarget(
        dates: List<LocalDate>,
        current: LocalDate,
        deltaX: Float,
        thresholdPx: Float = 60f,
    ): LocalDate? {
        if (kotlin.math.abs(deltaX) < thresholdPx) return null
        return neighborDate(dates, current, forward = deltaX < 0f)
    }

    /**
     * Kierunek gestu dla widoków okresowych (tydzień, miesiąc, semestr):
     * `true` = następny okres (palec w lewo), `false` = poprzedni, `null` =
     * ruch krótszy niż próg, czyli przypadkowe muśnięcie.
     *
     * Gest jest czuły na dwa sposoby: wystarczy **albo** pokonanie progu
     * odległości ([thresholdPx]), **albo** krótkie, ale szybkie pchnięcie
     * (prędkość ≥ [velocityThresholdPx] przy ruchu co najmniej [minPx]).
     * Wcześniej liczyła się tylko odległość, więc zwykłe „pstryknięcie” palcem
     * (kilkanaście dp, duża prędkość) przepadało — stąd wrażenie, że gest
     * łapie tylko czasami. [minPx] chroni przed potraktowaniem dotknięcia
     * z drgnięciem jako przesunięcia.
     */
    fun swipeForward(
        deltaX: Float,
        thresholdPx: Float = 60f,
        velocityPx: Float = 0f,
        velocityThresholdPx: Float = Float.MAX_VALUE,
        minPx: Float = 0f,
    ): Boolean? {
        val travelled = kotlin.math.abs(deltaX)
        if (travelled < minPx.coerceAtLeast(0f)) return null
        val fastFlick = kotlin.math.abs(velocityPx) >= velocityThresholdPx
        if (travelled < thresholdPx && !fastFlick) return null
        val direction = if (travelled > 0f) deltaX else velocityPx
        return direction < 0f
    }

    /** Data startowa widoku dnia: dziś, jeśli w zakresie; inaczej pierwsze zajęcia. */
    fun initialDay(days: List<DaySchedule>, today: LocalDate): LocalDate? {
        val dates = days.map { it.date }
        if (dates.isEmpty()) return null
        if (today in dates) return today
        return dates.firstOrNull { it.isAfter(today) } ?: dates.last()
    }

    /**
     * Jedna kotwica dla wszystkich widoków okresowych: wybrany dzień, a bez
     * wyboru — [initialDay]. Wcześniej tydzień startował na „dziś”, a dzień
     * i miesiąc na pierwszym dniu z zajęciami, więc ten sam plan witał w trzech
     * różnych miejscach (tydzień często pokazywał „brak zajęć”, mimo że plan je ma).
     *
     * `null` = plan bez zajęć — widoki pokazują wtedy własny pusty stan.
     */
    fun anchorDay(
        days: List<DaySchedule>,
        today: LocalDate,
        selected: LocalDate? = null,
    ): LocalDate? = selected ?: initialDay(days, today)

    fun totalMinutes(classes: List<ClassSlot>): Int = classes.sumOf { it.durationMinutes }

    /**
     * Rozkład nakładających się zajęć na kolumny — port `layoutDay` z web:
     * bloki w jednym „klastrze” dzielą szerokość, dopiero nowy klaster zaczyna
     * od nowa.
     */
    fun timetable(classes: List<ClassSlot>): List<TimedBlock> {
        if (classes.isEmpty()) return emptyList()
        val sorted = classes.sortedWith(
            compareBy<ClassSlot> { it.start.toSecondOfDay() }
                .thenByDescending { it.end.toSecondOfDay() },
        )

        val result = mutableListOf<TimedBlock>()
        var cluster = mutableListOf<ClassSlot>()
        var clusterEnd = -1

        fun flush() {
            if (cluster.isEmpty()) return
            val columnEnds = mutableListOf<Int>()
            val placed = mutableListOf<Pair<ClassSlot, Int>>()
            for (slot in cluster) {
                val start = slot.start.toSecondOfDay() / 60
                val end = slot.end.toSecondOfDay() / 60
                var column = -1
                for (i in columnEnds.indices) {
                    if (columnEnds[i] <= start) {
                        columnEnds[i] = end
                        column = i
                        break
                    }
                }
                if (column == -1) {
                    columnEnds.add(end)
                    column = columnEnds.size - 1
                }
                placed.add(slot to column)
            }
            val columns = columnEnds.size.coerceAtLeast(1)
            placed.forEach { (slot, column) ->
                result.add(
                    TimedBlock(
                        slot = slot,
                        startMinute = slot.start.toSecondOfDay() / 60,
                        endMinute = slot.end.toSecondOfDay() / 60,
                        column = column,
                        columns = columns,
                    ),
                )
            }
            cluster = mutableListOf()
            clusterEnd = -1
        }

        for (slot in sorted) {
            val start = slot.start.toSecondOfDay() / 60
            val end = slot.end.toSecondOfDay() / 60
            if (clusterEnd != -1 && start >= clusterEnd) flush()
            cluster.add(slot)
            clusterEnd = maxOf(clusterEnd, end)
        }
        flush()
        return result
    }

    /** Godziny siatki tygodnia: od pełnej godziny przed pierwszymi zajęciami. */
    fun hourBounds(classes: List<ClassSlot>): IntRange {
        if (classes.isEmpty()) return 7..21
        val minStart = classes.minOf { it.start.hour }
        val maxEnd = classes.maxOf { if (it.end.minute > 0) it.end.hour + 1 else it.end.hour }
        return maxOf(6, minStart)..minOf(23, maxOf(maxEnd, minStart + 3))
    }
}
