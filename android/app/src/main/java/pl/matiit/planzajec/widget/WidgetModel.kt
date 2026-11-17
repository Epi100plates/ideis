package pl.matiit.planzajec.widget

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import pl.matiit.planzajec.data.model.PlanDto
import pl.matiit.planzajec.domain.Format
import pl.matiit.planzajec.domain.ScheduleMapper
import pl.matiit.planzajec.domain.ScheduleWindow

/**
 * Jedna linia widżetu: godziny rozpoczęcia i zakończenia, przedmiot, typ zajęć
 * (Wyk/Ćw/Lab), sala albo „zdalnie” oraz długość zajęć. Wszystkie etykiety są
 * już sformatowane — Glance tylko je rysuje.
 */
data class WidgetRow(
    val start: String,
    val end: String,
    val subject: String,
    val form: String?,
    val room: String?,
    val remote: Boolean,
    val minutes: Int,
) {
    /** „10:45–12:15”. */
    val timeRange: String get() = "$start–$end"

    /** „1h 30m” — czas trwania zajęć. */
    val durationLabel: String get() = Format.duration(minutes)

    /** Sala gotowa do pokazania („s. 204”, „S55 27”) albo null. */
    val roomLabel: String? get() = Format.roomLabel(room)

    /** Miejsce: sala, a dla zajęć zdalnych „zdalnie”. */
    val placeLabel: String?
        get() = roomLabel ?: if (remote) "zdalnie" else null

    /** Skrót typu: „Wyk”, „Ćw”, „Lab”. */
    val formLabel: String? get() = Format.formShort(form)

    /** Typ · miejsce · długość: „Ćw · s. 204 · 1h 30m”. */
    val metaLabel: String?
        get() = listOfNotNull(formLabel, placeLabel, durationLabel.takeIf { it.isNotEmpty() })
            .joinToString(" · ")
            .ifEmpty { null }

    /**
     * Miejsce · długość, bez typu — dla wariantów, które typ pokazują osobno
     * (np. plakietką w nagłówku wiersza).
     */
    val placeMetaLabel: String?
        get() = listOfNotNull(placeLabel, durationLabel.takeIf { it.isNotEmpty() })
            .joinToString(" · ")
            .ifEmpty { null }

    /** Krótsza wersja dla widżetu tygodnia: „Ćw · s. 204”. */
    val shortMetaLabel: String?
        get() = listOfNotNull(formLabel, placeLabel).joinToString(" · ").ifEmpty { null }

    fun fingerprint(): String =
        "$start-$end:$subject:${form.orEmpty()}:${room.orEmpty()}:$remote:$minutes"
}

data class WidgetDay(val label: String, val rows: List<WidgetRow>)

/**
 * Gotowy do narysowania model widżetu. Czysty Kotlin — buduje go testowalna
 * funkcja, a warstwa Glance tylko go renderuje.
 */
data class WidgetModel(
    val groupLabel: String,
    val rangeLabel: String,
    val updatedLabel: String?,
    val days: List<WidgetDay>,
) {
    val totalClasses: Int get() = days.sumOf { it.rows.size }

    val isEmpty: Boolean get() = days.isEmpty()

    /**
     * Odcisk treści — pozwala pominąć `updateAll`, gdy nic się nie zmieniło.
     * Celowo bez etykiety „zaktualizowano” (zmienia się co minutę) i bez
     * względnych określeń czasu.
     */
    fun fingerprint(): String = buildString {
        append(groupLabel).append('|').append(rangeLabel)
        days.forEach { day ->
            append('|').append(day.label)
            day.rows.forEach { row -> append(':').append(row.fingerprint()) }
        }
    }
}

/** Widoczny fragment planu po dopasowaniu do wysokości widżetu. */
data class WidgetSlice(
    val days: List<WidgetDay>,
    val shownClasses: Int,
    val hiddenClasses: Int,
)

object WidgetModelBuilder {

    fun build(
        plan: PlanDto?,
        groupId: String,
        today: LocalDate,
        nowMillis: Long,
        savedAtMillis: Long?,
        zone: ZoneId = ZoneId.systemDefault(),
    ): WidgetModel {
        val week = ScheduleWindow.nextDays(ScheduleMapper.toSlots(plan), today)
        return WidgetModel(
            groupLabel = groupLabel(plan, groupId),
            rangeLabel = rangeLabel(today),
            updatedLabel = (serverFetchedAtMillis(plan) ?: savedAtMillis)
                ?.let { Format.absoluteUpdateLabel(it, nowMillis, zone) },
            days = week.map { day ->
                WidgetDay(
                    label = Format.dayTitle(day.date),
                    rows = day.classes.map { slot ->
                        WidgetRow(
                            start = Format.clock(slot.start),
                            end = Format.clock(slot.end),
                            subject = slot.subject,
                            form = slot.form,
                            room = slot.room,
                            remote = slot.isRemote,
                            minutes = slot.durationMinutes,
                        )
                    },
                )
            },
        )
    }

    /**
     * Czas pobrania planu z harmonogramu uczelni (a nie chwila sprawdzenia
     * cache), żeby etykieta w widżecie nie zmieniała się przy każdym odczycie
     * i nie wymuszała przerysowania.
     */
    fun serverFetchedAtMillis(plan: PlanDto?): Long? =
        runCatching { Instant.parse(plan?.version?.fetchedAt) }.getOrNull()?.toEpochMilli()

    fun rangeLabel(today: LocalDate): String {
        val end = today.plusDays((ScheduleWindow.DAYS - 1).toLong())
        return "${Format.dateShort(today)}–${Format.dateShort(end)}"
    }

    fun groupLabel(plan: PlanDto?, groupId: String): String {
        val name = plan?.meta?.groupName?.takeIf { it.isNotBlank() }
            ?: plan?.meta?.groupCode?.takeIf { it.isNotBlank() }
            ?: return "grupa $groupId"
        return shortGroupName(name)
    }

    /** „Informatyka, 1st 1sem Ćw (gr. 2) N” → „Ćw (gr. 2)”. */
    fun shortGroupName(name: String): String = Format.shortGroupName(name)
}
