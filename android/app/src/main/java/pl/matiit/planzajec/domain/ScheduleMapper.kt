package pl.matiit.planzajec.domain

import java.time.LocalDate
import pl.matiit.planzajec.data.model.ClassDto
import pl.matiit.planzajec.data.model.PlanDto

/** Zamiana DTO z API na model domenowy. Uszkodzone wpisy są pomijane, nie wywalają ekranu. */
object ScheduleMapper {

    fun toSlots(plan: PlanDto?): List<ClassSlot> = plan?.classes?.mapNotNull { it.toSlot() }.orEmpty()

    fun ClassDto.toSlot(): ClassSlot? {
        val day = runCatching { LocalDate.parse(date) }.getOrNull() ?: return null
        val startTime = ClockParser.parse(start, startMinutes) ?: return null
        val endTime = ClockParser.parse(end, endMinutes) ?: startTime
        val safeEnd = if (endTime.isAfter(startTime)) endTime else startTime
        return ClassSlot(
            id = id,
            date = day,
            start = startTime,
            end = safeEnd,
            subject = subject.trim(),
            form = form?.label ?: form?.raw,
            mode = mode,
            room = room?.label ?: roomRaw?.trim()?.takeIf { it.isNotEmpty() },
            lecturer = lecturer?.trim()?.takeIf { it.isNotEmpty() },
            notes = notes?.trim()?.takeIf { it.isNotEmpty() },
            group = group,
        )
    }
}
