package pl.matiit.planzajec.domain

import java.time.LocalDate
import java.time.LocalTime

/**
 * Zajęcia w formie niezależnej od API. Czysty model — bez Androida i bez JSON,
 * dzięki czemu jest w pełni testowalny na JVM.
 */
data class ClassSlot(
    val id: String,
    val date: LocalDate,
    val start: LocalTime,
    val end: LocalTime,
    val subject: String,
    val form: String?,
    val mode: String?,
    val room: String?,
    val lecturer: String?,
    val notes: String?,
    val group: String?,
) {
    val durationMinutes: Int
        get() = (end.toSecondOfDay() - start.toSecondOfDay()) / 60

    val isRemote: Boolean
        get() = mode?.contains("zdaln", ignoreCase = true) == true
}

/** Zajęcia jednego dnia, posortowane rosnąco po godzinie rozpoczęcia. */
data class DaySchedule(val date: LocalDate, val classes: List<ClassSlot>)
