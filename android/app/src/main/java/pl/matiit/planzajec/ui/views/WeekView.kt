package pl.matiit.planzajec.ui.views

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.absoluteOffset
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import pl.matiit.planzajec.domain.ClassSlot
import pl.matiit.planzajec.domain.DaySchedule
import pl.matiit.planzajec.domain.Format
import pl.matiit.planzajec.domain.ScheduleViews
import pl.matiit.planzajec.domain.TimedBlock
import pl.matiit.planzajec.ui.components.EmptyMessage
import pl.matiit.planzajec.ui.components.periodSwipe
import pl.matiit.planzajec.ui.components.subjectColor

private val HOUR_HEIGHT = 60.dp
private val DAY_WIDTH = 112.dp
private val HOURS_WIDTH = 44.dp

/**
 * Widok „Tydzień” — siatka godzin × dni z blokami zajęć i kolumnami dla
 * nakładających się przedmiotów (jak `renderWeek` w web). Na telefonie siatka
 * przewija się w poziomie.
 */
@Composable
fun WeekView(
    days: List<DaySchedule>,
    today: LocalDate,
    selectedDate: LocalDate?,
    onSelectDate: (LocalDate) -> Unit,
    onClassClick: (ClassSlot) -> Unit,
    modifier: Modifier = Modifier,
) {
    // Kotwica tygodnia = ten sam dzień co w widoku dnia i miesiąca. Wcześniej
    // tydzień startował na „dziś”, a dzień na pierwszym dniu z zajęciami, więc
    // ten sam plan witał w dwóch różnych miejscach.
    val anchorDay = remember(days, today, selectedDate) {
        ScheduleViews.anchorDay(days, today, selectedDate) ?: today
    }
    var anchorText by rememberSaveable { mutableStateOf(ScheduleViews.weekStart(anchorDay).toString()) }
    // Wybór dnia w innym widoku (albo zmiana planu, która go czyści) przestawia
    // tydzień na tydzień tej daty. Bez tego po zmianie planu zostawał stary
    // tydzień i ekran witał „Brak zajęć w tym tygodniu”.
    LaunchedEffect(anchorDay) {
        val target = ScheduleViews.weekStart(anchorDay).toString()
        if (anchorText != target) anchorText = target
    }
    val anchor = runCatching { LocalDate.parse(anchorText) }
        .getOrDefault(ScheduleViews.weekStart(anchorDay))

    val weekDates = remember(anchor) { ScheduleViews.weekDates(anchor) }
    val weekDays = remember(days, anchor) { days.filter { it.date in weekDates } }
    val classesByDate = remember(weekDays) { weekDays.associate { it.date to it.classes } }
    val allClasses = weekDays.flatMap { it.classes }
    val hours = remember(allClasses) { ScheduleViews.hourBounds(allClasses) }
    val totalHeight = HOUR_HEIGHT * (hours.last - hours.first + 1)
    val horizontalScroll = rememberScrollState()
    val density = LocalDensity.current
    val firstClassIndex = remember(weekDates, classesByDate) {
        weekDates.indexOfFirst { classesByDate[it].orEmpty().isNotEmpty() }
    }

    // Na telefonie weekend z zajęciami bywa poza ekranem — od razu przewijamy
    // siatkę do pierwszego dnia z zajęciami (z jednym dniem kontekstu).
    LaunchedEffect(anchor, firstClassIndex) {
        val target = if (firstClassIndex > 0) firstClassIndex - 1 else 0
        horizontalScroll.scrollTo(with(density) { (DAY_WIDTH * target).roundToPx() })
    }

    // Przesunięcie tygodnia zachowuje dzień tygodnia — po powrocie do „Dnia”
    // widać ten sam dzień (np. czwartek), a nie poniedziałek tygodnia.
    val shiftWeek: (Long) -> Unit = { weeks ->
        val next = anchorDay.plusWeeks(weeks)
        anchorText = ScheduleViews.weekStart(next).toString()
        onSelectDate(next)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .periodSwipe { forward -> shiftWeek(if (forward) 1L else -1L) },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "‹",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier
                    .clickable { shiftWeek(-1L) }
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = Format.dateRange(weekDates.first(), weekDates.last()),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = Format.classesCount(allClasses.size),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = "Dziś",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .clickable {
                        anchorText = ScheduleViews.weekStart(today).toString()
                        onSelectDate(today)
                    }
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
            Text(
                text = "›",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier
                    .clickable { shiftWeek(1L) }
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }

        if (allClasses.isEmpty()) {
            EmptyMessage(
                title = "Brak zajęć w tym tygodniu",
                body = "Przejdź do innego tygodnia albo sprawdź widok „Semestr”.",
            )
        } else {
            Column(
                Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState()),
            ) {
                Column(Modifier.horizontalScroll(horizontalScroll)) {
                    WeekHeader(weekDates = weekDates, today = today)
                    Row {
                        HourLabels(hours = hours, totalHeight = totalHeight)
                        weekDates.forEach { date ->
                            DayColumn(
                                date = date,
                                blocks = ScheduleViews.timetable(classesByDate[date].orEmpty()),
                                hours = hours,
                                totalHeight = totalHeight,
                                today = today,
                                onClassClick = onClassClick,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WeekHeader(weekDates: List<LocalDate>, today: LocalDate) {
    Row(Modifier.fillMaxWidth()) {
        Spacer(Modifier.width(HOURS_WIDTH))
        weekDates.forEach { date ->
            Column(
                modifier = Modifier
                    .width(DAY_WIDTH)
                    .padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = Format.weekdayShort(date),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = Format.dateShort(date),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (date == today) FontWeight.Bold else FontWeight.Medium,
                    color = if (date == today) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                )
            }
        }
    }
}

@Composable
private fun HourLabels(hours: IntRange, totalHeight: androidx.compose.ui.unit.Dp) {
    Box(Modifier.width(HOURS_WIDTH).height(totalHeight)) {
        hours.forEach { hour ->
            val top = HOUR_HEIGHT * (hour - hours.first)
            Text(
                text = "%02d:00".format(hour),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.absoluteOffset(x = 0.dp, y = top - 6.dp),
            )
        }
    }
}

@Composable
private fun DayColumn(
    date: LocalDate,
    blocks: List<TimedBlock>,
    hours: IntRange,
    totalHeight: androidx.compose.ui.unit.Dp,
    today: LocalDate,
    onClassClick: (ClassSlot) -> Unit,
) {
    val lineColor = MaterialTheme.colorScheme.outlineVariant
    val weekend = date.dayOfWeek.value >= 6
    Box(
        modifier = Modifier
            .width(DAY_WIDTH)
            .height(totalHeight)
            .background(
                if (weekend) {
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.10f)
                } else {
                    androidx.compose.ui.graphics.Color.Transparent
                },
            )
            .drawBehind {
                val hourCount = hours.last - hours.first + 1
                repeat(hourCount) { index ->
                    val y = index * HOUR_HEIGHT.toPx()
                    drawLine(
                        color = lineColor,
                        start = Offset(0f, y),
                        end = Offset(size.width, y),
                        strokeWidth = 1f,
                    )
                }
            },
    ) {
        blocks.forEach { block ->
            val top = HOUR_HEIGHT * ((block.startMinute - hours.first * 60) / 60f)
            val height = (HOUR_HEIGHT * ((block.endMinute - block.startMinute) / 60f))
                .coerceAtLeast(26.dp)
            val columnWidth = DAY_WIDTH / block.columns
            val accent = subjectColor(block.slot.subject)
            Surface(
                onClick = { onClassClick(block.slot) },
                modifier = Modifier
                    .absoluteOffset(x = columnWidth * block.column, y = top)
                    .width(columnWidth - 4.dp)
                    .height(height)
                    .padding(horizontal = 2.dp),
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                border = BorderStroke(1.dp, accent.copy(alpha = 0.8f)),
                contentColor = MaterialTheme.colorScheme.onSurface,
            ) {
                Column(Modifier.padding(horizontal = 4.dp, vertical = 3.dp)) {
                    Text(
                        text = Format.clock(block.slot.start),
                        style = MaterialTheme.typography.labelSmall,
                        fontSize = 9.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                    Text(
                        text = block.slot.subject,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        fontSize = 10.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}
