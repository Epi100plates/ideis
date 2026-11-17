package pl.matiit.planzajec.widget

import java.time.LocalDate
import java.time.ZoneId
import pl.matiit.planzajec.data.model.PlanDto
import pl.matiit.planzajec.domain.DaySchedule
import pl.matiit.planzajec.domain.Format
import pl.matiit.planzajec.domain.ScheduleMapper
import pl.matiit.planzajec.domain.ScheduleWindow

/**
 * Model widżetu „Dzień”: dokładnie jeden dzień — dzisiejszy, a jeśli dziś nie ma
 * zajęć, najbliższy dzień z planu (albo ostatni, gdy semestr się skończył).
 */
data class DayWidgetModel(
    val groupLabel: String,
    val dayLabel: String,
    val updatedLabel: String?,
    val rows: List<WidgetRow>,
) {
    val isEmpty: Boolean get() = rows.isEmpty()

    fun fingerprint(): String = buildString {
        append("day|").append(groupLabel).append('|').append(dayLabel)
        rows.forEach { row -> append(':').append(row.fingerprint()) }
    }
}

object DayWidgetModelBuilder {

    /** Dzień do pokazania: dziś → najbliższy kolejny → ostatni w planie. */
    fun pickDay(days: List<DaySchedule>, today: LocalDate): DaySchedule? =
        days.firstOrNull { it.date == today }
            ?: days.firstOrNull { it.date.isAfter(today) }
            ?: days.lastOrNull()

    fun dayLabel(day: DaySchedule?, today: LocalDate): String = when {
        day == null -> "Brak zajęć"
        day.date == today -> "Dziś · ${Format.dayTitle(day.date)}"
        day.date == today.plusDays(1) -> "Jutro · ${Format.dayTitle(day.date)}"
        else -> "${Format.weekdayFull(day.date)} ${Format.dateShort(day.date)}"
    }

    fun build(
        plan: PlanDto?,
        groupId: String,
        today: LocalDate,
        nowMillis: Long,
        savedAtMillis: Long?,
        zone: ZoneId = ZoneId.systemDefault(),
        /** Notatki z serwera — tak samo jak w widżecie tygodnia. */
        notes: Map<String, String> = emptyMap(),
    ): DayWidgetModel {
        val days = ScheduleWindow.allDays(ScheduleMapper.toSlots(plan))
        val day = pickDay(days, today)
        val updated = (WidgetModelBuilder.serverFetchedAtMillis(plan) ?: savedAtMillis)
            ?.let { Format.absoluteUpdateLabel(it, nowMillis, zone) }

        return DayWidgetModel(
            groupLabel = WidgetModelBuilder.groupLabel(plan, groupId),
            dayLabel = dayLabel(day, today),
            updatedLabel = updated,
            rows = day?.classes?.map { slot -> WidgetModelBuilder.rowOf(slot, notes) }.orEmpty(),
        )
    }
}
