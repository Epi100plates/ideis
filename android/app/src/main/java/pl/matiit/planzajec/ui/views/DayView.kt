package pl.matiit.planzajec.ui.views

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import pl.matiit.planzajec.domain.ClassSlot
import pl.matiit.planzajec.domain.DaySchedule
import pl.matiit.planzajec.domain.Format
import pl.matiit.planzajec.domain.ScheduleViews
import pl.matiit.planzajec.ui.components.ClassCard
import pl.matiit.planzajec.ui.components.EmptyMessage
import pl.matiit.planzajec.ui.components.TileBar
import pl.matiit.planzajec.ui.components.TileBarStyle
import pl.matiit.planzajec.ui.components.TileIndicator
import pl.matiit.planzajec.ui.components.TileStyle
import pl.matiit.planzajec.ui.components.animatedTileContentColor
import pl.matiit.planzajec.ui.components.isOngoing
import pl.matiit.planzajec.ui.components.periodSwipe
import pl.matiit.planzajec.ui.components.rememberTileGrid
import pl.matiit.planzajec.ui.components.rememberTileHighlight
import pl.matiit.planzajec.ui.components.subjectColor
import pl.matiit.planzajec.ui.components.tileLag

/**
 * Widok „Dzień” — jak w mobilnej wersji web: pasek tygodnia z kropkami,
 * agenda wybranego dnia i skoki do najbliższych zajęć. Jeden dzień = jedna
 * lista zajęć. Przesunięcie palcem w lewo/prawo przechodzi do następnego lub
 * poprzedniego dnia z zajęciami (puste dni są pomijane, jak w web).
 */
@Composable
fun DayView(
    days: List<DaySchedule>,
    today: LocalDate,
    selectedDate: LocalDate?,
    onSelectDate: (LocalDate) -> Unit,
    nowMinute: Int,
    onClassClick: (ClassSlot) -> Unit,
    modifier: Modifier = Modifier,
    classesWithAttachments: Set<String> = emptySet(),
    notes: Map<String, String> = emptyMap(),
) {
    val dates = remember(days) { days.map { it.date } }
    // Wybór użytkownika ma pierwszeństwo — także dla dnia bez zajęć, bo wtedy
    // widać stan „brak zajęć w tym dniu”. Wcześniej taki dzień dało się
    // dotknąć, ale nic się nie działo (wybór po cichu wracał do najbliższych
    // zajęć), co wyglądało na zepsuty kafelek.
    val active = selectedDate
        ?: remember(days, today) { ScheduleViews.initialDay(days, today) }
    val byDate = remember(days) { days.associate { it.date to it.classes } }

    Column(modifier.fillMaxSize()) {
        if (active == null) {
            EmptyMessage(
                title = "Brak zajęć w planie",
                body = "Odśwież plan albo sprawdź inną grupę.",
            )
            return@Column
        }

        WeekStrip(
            anchor = active,
            selected = active,
            today = today,
            byDate = byDate,
            onSelect = onSelectDate,
        )

        AnimatedContent(
            targetState = active,
            transitionSpec = {
                if (targetState.isAfter(initialState)) {
                    (slideInHorizontally { width -> width } + fadeIn())
                        .togetherWith(slideOutHorizontally { width -> -width } + fadeOut())
                } else {
                    (slideInHorizontally { width -> -width } + fadeIn())
                        .togetherWith(slideOutHorizontally { width -> width } + fadeOut())
                }
            },
            modifier = Modifier
                .fillMaxSize()
                .periodSwipe { forward ->
                    // Puste dni pomijamy — gest prowadzi do najbliższych zajęć.
                    ScheduleViews.neighborDate(dates, active, forward)?.let(onSelectDate)
                },
            label = "day-swipe",
        ) { date ->
            DayAgenda(
                date = date,
                classes = byDate[date].orEmpty(),
                dates = dates,
                today = today,
                nowMinute = nowMinute,
                onClassClick = onClassClick,
                onSelectDate = onSelectDate,
                classesWithAttachments = classesWithAttachments,
                notes = notes,
            )
        }
    }
}

@Composable
private fun DayAgenda(
    date: LocalDate,
    classes: List<ClassSlot>,
    dates: List<LocalDate>,
    today: LocalDate,
    nowMinute: Int,
    onClassClick: (ClassSlot) -> Unit,
    onSelectDate: (LocalDate) -> Unit,
    classesWithAttachments: Set<String>,
    notes: Map<String, String>,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 2.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        item(key = "agenda-head-$date") {
            AgendaHeader(date, classes)
        }
        items(items = classes, key = { it.id }) { slot ->
            ClassCard(
                slot = slot,
                isToday = date == today,
                isOngoing = slot.isOngoing(today, nowMinute),
                hasAttachments = slot.id in classesWithAttachments,
                note = notes[slot.id],
                onClick = { onClassClick(slot) },
            )
        }
        if (classes.isEmpty()) {
            item(key = "agenda-empty-$date") {
                val prev = ScheduleViews.neighborDate(dates, date, forward = false)
                val next = ScheduleViews.neighborDate(dates, date, forward = true)
                EmptyMessage(
                    title = "Brak zajęć w tym dniu",
                    body = "Przesuń palcem w bok albo przejdź do najbliższych zajęć.",
                    actionLabel = next?.let { "Najbliższe: ${Format.dayLong(it)}" }
                        ?: prev?.let { "Ostatnie: ${Format.dayLong(it)}" },
                    onAction = {
                        val target = next ?: prev
                        if (target != null) onSelectDate(target)
                    },
                )
            }
        } else {
            item(key = "agenda-jump-$date") {
                val prev = ScheduleViews.neighborDate(dates, date, forward = false)
                val next = ScheduleViews.neighborDate(dates, date, forward = true)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    if (prev != null) {
                        TextButton(onClick = { onSelectDate(prev) }) {
                            Text("‹ ${Format.dayTitle(prev)}")
                        }
                    } else {
                        Spacer(Modifier.width(1.dp))
                    }
                    if (next != null) {
                        TextButton(onClick = { onSelectDate(next) }) {
                            Text("${Format.dayTitle(next)} ›")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WeekStrip(
    anchor: LocalDate,
    selected: LocalDate,
    today: LocalDate,
    byDate: Map<LocalDate, List<ClassSlot>>,
    onSelect: (LocalDate) -> Unit,
) {
    val weekDates = remember(anchor) { ScheduleViews.weekDates(anchor) }
    val selectedIndex = weekDates.indexOf(selected).coerceAtLeast(0)
    var track by remember { mutableStateOf(IntSize.Zero) }
    val grid = rememberTileGrid(track, count = weekDates.size)
    val highlight = rememberTileHighlight(grid, selectedIndex)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        WeekArrow(text = "‹", onClick = { onSelect(selected.minusDays(7)) })
        // Ten sam pasek, ten sam kafelek i ta sama animacja podświetlenia co
        // dolna nawigacja — tylko w wariancie subtelnym (bez poświaty, delikatna
        // ramka), żeby dni były tłem dla planu, a nie drugim przyciskiem.
        // `weight(1f)` zostawia miejsce na strzałki po obu stronach.
        TileBar(
            modifier = Modifier.weight(1f),
            style = TileBarStyle.Subtle,
            trackModifier = Modifier.onSizeChanged { track = it },
            indicator = { highlight?.let { TileIndicator(it, TileBarStyle.Subtle) } },
        ) {
            weekDates.forEachIndexed { index, date ->
                val classes = byDate[date].orEmpty()
                val isSelected = date == selected
                val isToday = date == today
                val labelColor = animatedTileContentColor(isSelected)
                val numberColor by animateColorAsState(
                    targetValue = if (isSelected || isToday) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                    animationSpec = tween(durationMillis = TileStyle.CONTENT_FADE_MS),
                    label = "day-number",
                )
                Column(
                    modifier = Modifier
                        .weight(1f)
                        // Dni są bardziej prostokątne niż kafelki dolnej
                        // nawigacji — mniejszy promień zostawia miejsce na dwie
                        // linie i kropki (patrz `TileStyle.subtleRadius`).
                        .clip(RoundedCornerShape(TileStyle.cellRadius(TileBarStyle.Subtle)))
                        .clickable { onSelect(date) }
                        .tileLag(highlight, grid, index)
                        .padding(vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = Format.weekdayShort(date),
                        style = MaterialTheme.typography.labelSmall,
                        color = labelColor,
                    )
                    Text(
                        text = date.dayOfMonth.toString(),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = if (isSelected || isToday) FontWeight.SemiBold else FontWeight.Normal,
                        color = numberColor,
                    )
                    Row(
                        modifier = Modifier.height(6.dp),
                        horizontalArrangement = Arrangement.spacedBy(1.dp),
                    ) {
                        classes.take(3).forEach { slot ->
                            Box(
                                Modifier
                                    .size(4.dp)
                                    .background(subjectColor(slot.subject), CircleShape),
                            )
                        }
                    }
                }
            }
        }
        WeekArrow(text = "›", onClick = { onSelect(selected.plusDays(7)) })
    }
}

/** Strzałka tygodnia obok paska kafelków — mała, żeby nie zabierać szerokości dniom. */
@Composable
private fun WeekArrow(text: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun AgendaHeader(date: LocalDate, classes: List<ClassSlot>) {
    val remote = classes.count { it.isRemote }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 2.dp, bottom = 0.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Lewa strona: nazwa dnia (pogrubiona) i data — dzień tygodnia występuje
        // tylko raz, bo „Wtorek, 10 listopada 2026” dublowało się w dwóch liniach.
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = Format.weekdayFull(date),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = listOfNotNull(
                    Format.dateWithYear(date),
                    Format.relativeDay(date, LocalDate.now()),
                ).joinToString(" · "),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (classes.isNotEmpty()) {
            Spacer(Modifier.width(10.dp))
            // Prawa strona: liczba zajęć i łączny czas (np. „6 zajęć / 6 h”).
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = Format.classesCount(classes.size),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                )
                Text(
                    text = buildString {
                        append(Format.minutesLabel(ScheduleViews.totalMinutes(classes)))
                        if (remote > 0) append(" · ").append(remote).append(" zdal.")
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }
    }
}
