package pl.matiit.planzajec.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.YearMonth
import pl.matiit.planzajec.domain.DaySchedule
import pl.matiit.planzajec.domain.Format
import pl.matiit.planzajec.domain.ScheduleViews

/**
 * Siatka miesiąca od poniedziałku, z kropkami przedmiotów — wspólna dla widoku
 * „Miesiąc” i „Semestr” (w web to `monthGrid`).
 */
@Composable
fun MonthGrid(
    month: YearMonth,
    days: List<DaySchedule>,
    today: LocalDate,
    selected: LocalDate?,
    onDayClick: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    val byDate = rememberDaysByDate(days)
    val weekdays = listOf("Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz")

    Column(modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth()) {
            weekdays.forEach { label ->
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        ScheduleViews.monthWeeks(month).forEach { week ->
            Row(Modifier.fillMaxWidth()) {
                week.forEach { date ->
                    Box(Modifier.weight(1f)) {
                        if (date != null) {
                            DayCell(
                                date = date,
                                classes = byDate[date].orEmpty(),
                                isToday = date == today,
                                isSelected = date == selected,
                                onClick = { onDayClick(date) },
                            )
                        } else {
                            Spacer(Modifier.fillMaxWidth().aspectRatio(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCell(
    date: LocalDate,
    classes: List<pl.matiit.planzajec.domain.ClassSlot>,
    isToday: Boolean,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val selectedColor = MaterialTheme.colorScheme.primaryContainer
    val container = when {
        isSelected -> selectedColor
        classes.isNotEmpty() -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.22f)
        else -> MaterialTheme.colorScheme.surface.copy(alpha = 0.10f)
    }
    Surface(
        onClick = onClick,
        modifier = Modifier
            .padding(2.dp)
            .fillMaxWidth()
            .aspectRatio(1f),
        shape = RoundedCornerShape(10.dp),
        color = container,
        border = if (isToday) BorderStroke(1.dp, MaterialTheme.colorScheme.primary) else null,
        contentColor = MaterialTheme.colorScheme.onSurface,
    ) {
        Column(
            modifier = Modifier.padding(4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Top,
        ) {
            Text(
                text = date.dayOfMonth.toString(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = if (isToday || isSelected) FontWeight.SemiBold else FontWeight.Normal,
            )
            if (classes.isNotEmpty()) {
                Spacer(Modifier.height(3.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    classes.take(3).forEach { slot ->
                        SubjectDot(subject = slot.subject, size = 5.dp)
                    }
                }
            }
        }
    }
}

@Composable
private fun rememberDaysByDate(days: List<DaySchedule>): Map<LocalDate, List<pl.matiit.planzajec.domain.ClassSlot>> =
    androidx.compose.runtime.remember(days) { days.associate { it.date to it.classes } }

/** Pasek nawigacji miesiąca: ‹ Miesiąc Rok · N zajęć › + Dziś. */
@Composable
fun MonthNav(
    month: YearMonth,
    classCount: Int,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "‹",
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier
                .clickable(onClick = onPrev)
                .padding(horizontal = 10.dp, vertical = 4.dp),
        )
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = Format.monthLabel(month),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = if (classCount > 0) Format.classesCount(classCount) else "brak zajęć",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = "Dziś",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .clickable(onClick = onToday)
                .padding(horizontal = 8.dp, vertical = 4.dp),
        )
        Text(
            text = "›",
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier
                .clickable(onClick = onNext)
                .padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}
