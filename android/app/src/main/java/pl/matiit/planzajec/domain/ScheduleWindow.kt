package pl.matiit.planzajec.domain

import java.time.LocalDate

/**
 * Okno „najbliższy tydzień”: od dziś (włącznie) przez kolejne [DAYS] dni.
 * Dni bez zajęć są pomijane — w planie uczelni zajęcia wypadają w weekendy
 * zjazdowe, więc puste dni tylko rozdmuchują listę i widżet.
 */
object ScheduleWindow {

    const val DAYS: Int = 7

    fun dates(today: LocalDate, days: Int = DAYS): List<LocalDate> =
        List(days) { offset -> today.plusDays(offset.toLong()) }

    fun nextDays(slots: List<ClassSlot>, today: LocalDate, days: Int = DAYS): List<DaySchedule> {
        val byDate = slots.groupBy { it.date }
        return dates(today, days).mapNotNull { date ->
            val classes = byDate[date]?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            DaySchedule(date, classes.sortedBy { it.start })
        }
    }

    fun allDays(slots: List<ClassSlot>): List<DaySchedule> =
        slots.groupBy { it.date }
            .toSortedMap()
            .map { (date, classes) -> DaySchedule(date, classes.sortedBy { it.start }) }
}
