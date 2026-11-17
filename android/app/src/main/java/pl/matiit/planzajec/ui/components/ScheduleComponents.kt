package pl.matiit.planzajec.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pl.matiit.planzajec.R
import pl.matiit.planzajec.domain.ClassSlot
import pl.matiit.planzajec.domain.DaySchedule
import pl.matiit.planzajec.domain.Format

/** Mała plakietka („dziś”, „teraz”, „offline”) z jawnym kolorem treści. */
@Composable
fun Pill(
    text: String,
    modifier: Modifier = Modifier,
    container: Color = MaterialTheme.colorScheme.surfaceVariant,
    contentColor: Color = MaterialTheme.colorScheme.onSurface,
) {
    Surface(color = container, contentColor = contentColor, shape = RoundedCornerShape(50), modifier = modifier) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}

private val SUBJECT_COLORS = listOf(
    Color(0xFF5B7BFF),
    Color(0xFF16A394),
    Color(0xFFE08A2B),
    Color(0xFFD8567F),
    Color(0xFF8A63D2),
    Color(0xFF2E9BD6),
    Color(0xFF6BA84F),
    Color(0xFFB0764A),
)

/**
 * Stały kolor przedmiotu (jak `subjectColor` w web) — wspólny dla kropek
 * w kalendarzu i pionowych pasków przy zajęciach, żeby ten sam przedmiot miał
 * ten sam kolor w każdym widoku.
 */
fun subjectColor(subject: String): Color =
    SUBJECT_COLORS[(subject.hashCode() and Int.MAX_VALUE) % SUBJECT_COLORS.size]

fun ClassSlot.isOngoing(today: java.time.LocalDate, nowMinute: Int): Boolean {
    if (date != today) return false
    val startMinute = start.hour * 60 + start.minute
    val endMinute = end.hour * 60 + end.minute
    return nowMinute in startMinute until endMinute
}

/**
 * Karta zajęć — używana w widoku dnia (design z pierwotnej wersji).
 *
 * Trwające zajęcia zaznacza **cienki obrys** w kolorze akcentu i ledwo widoczna
 * podbarwiona powierzchnia; wcześniej cała karta była wypełniona akcentem, co
 * przykrywało treść i wyglądało jak drugi, mocniejszy stan karty. Spinacz po
 * prawej mówi, że do zajęć są materiały — bez otwierania szczegółów.
 *
 * Nazwa przedmiotu zawsze mieści się w **jednej linii**: prawa strona wiersza
 * nie zabiera już miejsca (status „teraz” przeniósł się do linii metadanych,
 * „dziś” zniknęło — dzień jest w nagłówku), a `TextAutoSize` zmniejsza czcionkę
 * (16 → 11 sp), zamiast łamać nazwę na dwie linie. Dopiero przy ekstremalnie
 * długiej nazwie zostaje wielokropek.
 */
@Composable
fun ClassCard(
    slot: ClassSlot,
    isToday: Boolean,
    isOngoing: Boolean,
    hasAttachments: Boolean = false,
    onClick: () -> Unit,
    /** Notatka na kafelku („Kolos”, „Egzamin”) — wspólna, z serwera. */
    note: String? = null,
) {
    val accent = subjectColor(slot.subject)
    val base = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.30f)
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(
            contentColor = MaterialTheme.colorScheme.onSurface,
            containerColor = if (isOngoing) {
                // Delikatne podbarwienie środka: akcent 8% na zwykłym tle karty.
                MaterialTheme.colorScheme.primary.copy(alpha = 0.08f).compositeOver(base)
            } else {
                base
            },
        ),
        border = if (isOngoing) {
            BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.55f))
        } else {
            null
        },
    ) {
        // Plakietka jest **obok** treści, nie nad nią: nazwa przedmiotu zwęża się
        // tylko o tyle, ile naprawdę zajmuje notatka (jak w wersji web).
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val badgeMax = maxWidth * NOTE_MAX_FRACTION
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(IntrinsicSize.Min),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.width(56.dp)) {
                        Text(
                            text = Format.clock(slot.start),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = Format.clock(slot.end),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Box(
                        Modifier
                            .width(4.dp)
                            .height(40.dp)
                            .background(accent, RoundedCornerShape(2.dp)),
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = slot.subject,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            autoSize = SUBJECT_AUTO_SIZE,
                        )
                        val meta = listOfNotNull(
                            "teraz".takeIf { isOngoing },
                            slot.room,
                            slot.form,
                            Format.modeLabel(slot.mode),
                        ).joinToString(" · ")
                        if (meta.isNotEmpty()) {
                            Text(
                                text = meta,
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isOngoing) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                                fontWeight = if (isOngoing) FontWeight.SemiBold else FontWeight.Normal,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    if (hasAttachments) {
                        Spacer(Modifier.width(6.dp))
                        AttachmentMark()
                    }
                }
                if (!note.isNullOrBlank()) {
                    NoteBadge(text = note, maxWidth = badgeMax)
                }
            }
        }
    }
}

/** Notatka zajmuje najwyżej 35% szerokości kafelka — reszta zostaje dla nazwy. */
private const val NOTE_MAX_FRACTION = 0.35f

/** Ścięcie lewego brzegu plakietki: 60% wysokości, maks. 44 dp (jak w webie). */
private const val NOTE_SLANT = 0.6f
private val NOTE_SLANT_MAX = 44.dp

/** Ścięcie odsuwa tekst od ukośnej krawędzi — inaczej pierwsze litery by ją przecinały. */
private val NOTE_PAD_START = 30.dp

/**
 * Kształt plakietki notatki: lewy brzeg **ścięty ukośnie** (chorągiewka przy
 * prawej krawędzi karty), a nie zaokrąglony. Skos rośnie z wysokością karty,
 * ale nie bardziej niż [NOTE_SLANT_MAX] — dzięki temu tekst zawsze zostaje
 * na pełnym, nieściętym fragmencie tła.
 */
private fun noteSlantShape(ratio: Float, maxSlantPx: Float): Shape = GenericShape { size, _ ->
    val slant = minOf(size.height * ratio, maxSlantPx)
    moveTo(slant, 0f)
    lineTo(size.width, 0f)
    lineTo(size.width, size.height)
    lineTo(0f, size.height)
    close()
}

/**
 * Plakietka notatki na kafelku — jak w projekcie z webu: pełna wysokość karty,
 * ścięty lewy brzeg, zaokrąglenie karty z prawej (karta przycina zawartość).
 *
 * Kolor bierze się z motywu (`primary`/`onPrimary`, czyli akcent palety), więc
 * notatka jest widoczna w każdym z 20 motywów. Rozmiar tekstu dopasowuje
 * `TextAutoSize` (22 → 9 sp), zamiast łamać notatkę na dwie linie.
 */
@Composable
fun NoteBadge(
    text: String,
    maxWidth: Dp,
    modifier: Modifier = Modifier,
) {
    val maxSlantPx = with(LocalDensity.current) { NOTE_SLANT_MAX.toPx() }
    val shape = remember(maxSlantPx) { noteSlantShape(NOTE_SLANT, maxSlantPx) }
    Surface(
        color = MaterialTheme.colorScheme.primary,
        contentColor = MaterialTheme.colorScheme.onPrimary,
        shape = shape,
        modifier = modifier
            .fillMaxHeight()
            .widthIn(max = maxWidth),
    ) {
        Box(
            modifier = Modifier.padding(start = NOTE_PAD_START, end = 10.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = text,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                autoSize = NOTE_AUTO_SIZE,
            )
        }
    }
}

/** Rozmiar tekstu notatki: od 22 sp w dół, aż cała zmieści się w plakietce. */
private val NOTE_AUTO_SIZE = TextAutoSize.StepBased(
    minFontSize = 9.sp,
    maxFontSize = 22.sp,
    stepSize = 0.5.sp,
)

/**
 * Dobór wielkości czcionki nazwy przedmiotu: od 16 sp w dół, aż cała nazwa
 * zmieści się w jednej linii (krok 0.5 sp). Wspólny dla karty dnia i wiersza
 * miesiąca, żeby oba widoki zachowywały się tak samo.
 */
private val SUBJECT_AUTO_SIZE = TextAutoSize.StepBased(
    minFontSize = 10.sp,
    maxFontSize = 16.sp,
    stepSize = 0.5.sp,
)

/**
 * Wiersz miesiąca jest węższy (godzina, pasek, „ZDALNE”, spinacz), więc startuje
 * z 14 sp i schodzi do 9 sp — inaczej długie nazwy kończyły się wielokropkiem.
 */
private val COMPACT_SUBJECT_AUTO_SIZE = TextAutoSize.StepBased(
    minFontSize = 9.sp,
    maxFontSize = 14.sp,
    stepSize = 0.5.sp,
)

/** Spinacz na końcu wiersza zajęć — „tu są materiały”. */
@Composable
fun AttachmentMark(
    modifier: Modifier = Modifier,
    size: Dp = 16.dp,
) {
    Icon(
        painter = painterResource(R.drawable.ic_attachment),
        contentDescription = "Materiały do zajęć",
        tint = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.size(size),
    )
}

/**
 * Kompaktowy wiersz listy — odpowiednik `.list-row` / `.zc` z web: godzina,
 * przedmiot, meta i plakietka sali/trybu w jednej linii.
 */
@Composable
fun CompactClassRow(
    slot: ClassSlot,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    hasAttachments: Boolean = false,
) {
    val accent = subjectColor(slot.subject)
    Surface(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.26f),
        contentColor = MaterialTheme.colorScheme.onSurface,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = Format.clock(slot.start),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.width(46.dp),
            )
            Box(
                Modifier
                    .width(3.dp)
                    .height(30.dp)
                    .background(accent, RoundedCornerShape(2.dp)),
            )
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = slot.subject,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    autoSize = COMPACT_SUBJECT_AUTO_SIZE,
                )
                val meta = listOfNotNull(
                    Format.clock(slot.end),
                    slot.form,
                    slot.lecturer,
                ).joinToString(" · ")
                if (meta.isNotEmpty()) {
                    Text(
                        text = meta,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.width(6.dp))
            Text(
                text = if (slot.isRemote) "ZDALNE" else slot.room ?: "—",
                style = MaterialTheme.typography.labelSmall,
                color = if (slot.isRemote) {
                    MaterialTheme.colorScheme.tertiary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                maxLines = 1,
            )
            if (hasAttachments) {
                Spacer(Modifier.width(6.dp))
                AttachmentMark(size = 14.dp)
            }
        }
    }
}

/** Nagłówek dnia w liście: data, liczba zajęć i podział stacjonarne/zdalne. */
@Composable
fun DaySectionHeader(day: DaySchedule, today: java.time.LocalDate) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 10.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = Format.dayTitle(day.date),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Format.relativeDay(day.date, today)?.let { label ->
            Spacer(Modifier.width(8.dp))
            Pill(
                text = label,
                container = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
        Spacer(Modifier.weight(1f))
        val remote = day.classes.count { it.isRemote }
        val onsite = day.classes.size - remote
        Text(
            text = buildString {
                append(Format.classesCount(day.classes.size))
                if (onsite > 0) append(" · stacj. ").append(onsite)
                if (remote > 0) append(" · zdal. ").append(remote)
            },
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Pusty stan z opcjonalnym przyciskiem akcji. */
@Composable
fun EmptyMessage(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 32.dp, horizontal = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(6.dp))
        Text(
            text = body,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(10.dp))
            TextButton(onClick = onAction) { Text(actionLabel) }
        }
    }
}

/** Mała kropka przedmiotu (kalendarz). */
@Composable
fun SubjectDot(subject: String, size: Dp = 6.dp) {
    Box(
        Modifier
            .size(size)
            .background(subjectColor(subject), CircleShape),
    )
}
