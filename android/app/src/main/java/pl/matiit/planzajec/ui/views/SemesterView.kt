package pl.matiit.planzajec.ui.views

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.YearMonth
import kotlinx.coroutines.launch
import pl.matiit.planzajec.domain.DaySchedule
import pl.matiit.planzajec.domain.Format
import pl.matiit.planzajec.domain.ScheduleViews
import pl.matiit.planzajec.ui.components.EmptyMessage
import pl.matiit.planzajec.ui.components.MonthGrid
import pl.matiit.planzajec.ui.components.periodSwipe

/**
 * Widok „Semestr” — kolejne miesiące semestru z miniaturowymi kalendarzami,
 * jak `renderSemester` w web. Dotknięcie dnia otwiera widok dnia dla tej daty,
 * a przesunięcie palcem w bok przenosi do następnego/poprzedniego miesiąca
 * (karta miesiąca dosuwa się do góry listy).
 */
@Composable
fun SemesterView(
    days: List<DaySchedule>,
    today: LocalDate,
    onOpenDay: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    val months = remember(days) { ScheduleViews.months(days) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    Column(
        modifier = modifier
            .fillMaxSize()
            .periodSwipe { forward ->
                val lastIndex = months.lastIndex
                if (lastIndex < 0) return@periodSwipe
                val current = listState.firstVisibleItemIndex.coerceIn(0, lastIndex)
                val target = (current + if (forward) 1 else -1).coerceIn(0, lastIndex)
                if (target != current) scope.launch { listState.animateScrollToItem(target) }
            },
    ) {
        if (months.isEmpty()) {
            EmptyMessage(
                title = "Brak zajęć w semestrze",
                body = "Odśwież plan albo wybierz inną grupę.",
                modifier = Modifier.fillMaxSize(),
            )
            return@Column
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            months.forEach { month ->
                item(key = "semester-${month}") {
                    MonthCard(month = month, days = days, today = today, onOpenDay = onOpenDay)
                }
            }
        }
    }
}

@Composable
private fun MonthCard(
    month: YearMonth,
    days: List<DaySchedule>,
    today: LocalDate,
    onOpenDay: (LocalDate) -> Unit,
) {
    val monthDays = ScheduleViews.daysInMonth(days, month)
    val classCount = monthDays.sumOf { it.classes.size }

    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.20f),
        contentColor = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = Format.monthLabel(month),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.weight(1f))
                Text(
                    text = if (classCount > 0) Format.classesCount(classCount) else "brak zajęć",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(6.dp))
            MonthGrid(
                month = month,
                days = days,
                today = today,
                selected = null,
                onDayClick = onOpenDay,
            )
        }
    }
}
