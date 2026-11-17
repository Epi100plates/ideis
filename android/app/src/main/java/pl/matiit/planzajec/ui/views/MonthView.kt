package pl.matiit.planzajec.ui.views

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.YearMonth
import pl.matiit.planzajec.domain.ClassSlot
import pl.matiit.planzajec.domain.DaySchedule
import pl.matiit.planzajec.domain.ScheduleViews
import pl.matiit.planzajec.ui.components.CompactClassRow
import pl.matiit.planzajec.ui.components.DaySectionHeader
import pl.matiit.planzajec.ui.components.EmptyMessage
import pl.matiit.planzajec.ui.components.MonthGrid
import pl.matiit.planzajec.ui.components.MonthNav
import pl.matiit.planzajec.ui.components.periodSwipe

/**
 * Widok „Miesiąc” — kalendarz miesiąca z kropkami oraz lista zajęć wybranego
 * dnia pod siatką (jak mobilny widok miesiąca w web).
 */
@Composable
fun MonthView(
    days: List<DaySchedule>,
    today: LocalDate,
    selectedDate: LocalDate?,
    onSelectDate: (LocalDate) -> Unit,
    onClassClick: (ClassSlot) -> Unit,
    modifier: Modifier = Modifier,
    classesWithAttachments: Set<String> = emptySet(),
) {
    // Ta sama kotwica co w dniu i tygodniu: wybrany dzień, a bez wyboru —
    // pierwszy dzień z zajęciami. Po zmianie planu data jest czyszczona, więc
    // miesiąc też musi wrócić do miesiąca planu (wcześniej zostawał stary).
    val anchor = remember(days, today, selectedDate) {
        ScheduleViews.anchorDay(days, today, selectedDate)
    }
    val fallbackMonth = remember(anchor, today) {
        anchor?.let(YearMonth::from) ?: YearMonth.from(today)
    }
    var monthText by rememberSaveable { mutableStateOf(fallbackMonth.toString()) }
    LaunchedEffect(anchor) {
        val target = anchor?.let { YearMonth.from(it).toString() } ?: return@LaunchedEffect
        if (monthText != target) monthText = target
    }
    val month = runCatching { YearMonth.parse(monthText) }.getOrDefault(fallbackMonth)

    // Przesunięcie miesiąca zaznacza pierwszy dzień z zajęciami w nowym
    // miesiącu — po powrocie do „Dnia” widać ten miesiąc, a nie poprzedni.
    val moveTo: (YearMonth) -> Unit = { target ->
        monthText = target.toString()
        days.firstOrNull { YearMonth.from(it.date) == target }?.date?.let(onSelectDate)
    }

    val activeDate = selectedDate?.takeIf { YearMonth.from(it) == month }
        ?: days.firstOrNull { YearMonth.from(it.date) == month }?.date
    val dayClasses = ScheduleViews.classesOn(days, activeDate ?: LocalDate.MIN)

    Column(
        modifier = modifier
            .fillMaxSize()
            .periodSwipe { forward ->
                moveTo(if (forward) month.plusMonths(1) else month.minusMonths(1))
            },
    ) {
        MonthNav(
            month = month,
            classCount = ScheduleViews.daysInMonth(days, month).sumOf { it.classes.size },
            onPrev = { moveTo(month.minusMonths(1)) },
            onNext = { moveTo(month.plusMonths(1)) },
            onToday = {
                monthText = YearMonth.from(today).toString()
                onSelectDate(today)
            },
            modifier = Modifier.padding(horizontal = 8.dp),
        )
        MonthGrid(
            month = month,
            days = days,
            today = today,
            selected = activeDate,
            onDayClick = onSelectDate,
            modifier = Modifier.padding(horizontal = 12.dp),
        )

        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (activeDate == null) {
                item(key = "month-empty") {
                    EmptyMessage(
                        title = "Brak zajęć w tym miesiącu",
                        body = "Przejdź do innego miesiąca albo odśwież plan.",
                    )
                }
            } else {
                item(key = "month-day-head") {
                    DaySectionHeader(DaySchedule(activeDate, dayClasses), today)
                }
                if (dayClasses.isEmpty()) {
                    item(key = "month-day-empty") {
                        EmptyMessage(
                            title = "Brak zajęć w tym dniu",
                            body = "Wybierz inny dzień w kalendarzu.",
                        )
                    }
                } else {
                    items(items = dayClasses, key = { it.id }) { slot ->
                        CompactClassRow(
                            slot = slot,
                            onClick = { onClassClick(slot) },
                            hasAttachments = slot.id in classesWithAttachments,
                        )
                    }
                }
            }
        }
    }
}
