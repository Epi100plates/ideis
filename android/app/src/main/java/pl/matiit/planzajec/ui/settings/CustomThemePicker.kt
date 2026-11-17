package pl.matiit.planzajec.ui.settings

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import pl.matiit.planzajec.domain.ColorHsv
import pl.matiit.planzajec.domain.Hsv
import pl.matiit.planzajec.ui.selection.RadioMark
import pl.matiit.planzajec.ui.theme.CustomColors
import pl.matiit.planzajec.ui.theme.CustomPairs
import pl.matiit.planzajec.ui.theme.CustomTheme
import pl.matiit.planzajec.ui.theme.LocalStylePalette

/**
 * Edytor motywu „Własny” w trzech krokach — **ten sam model co w webie**
 * (`settingsCustomHtml` w `public/app.js`):
 *
 *  1. gotowe pary („Fiolet na czerni”, „Papier”, …) — jedno dotknięcie,
 *  2. próbki: osiem akcentów i sześć teł,
 *  3. dokładny kolor: kwadrat nasycenie/jasność + pasek barwy.
 *
 * Do tego podgląd **finalnej** palety i zdanie o tym, czy akcent został
 * poprawiony dla kontrastu. Wcześniej były tu trzy suwaki HSV bez podglądu,
 * a kolory działały dopiero po zaznaczeniu „Własny” na liście powyżej —
 * dotknięcie czegokolwiek nie zmieniało więc niczego.
 */
@Composable
internal fun CustomThemeSection(
    colors: CustomColors,
    onChange: (String, String) -> Unit,
) {
    val palette = LocalStylePalette.current
    val current = CustomColors.normalize(colors.primary, colors.background)
    val report = remember(current) { CustomTheme.report(current) }

    SectionHead("Gotowe motywy", palette.textSoft)
    SettingsCard {
        CustomPairs.pairs.forEachIndexed { index, pair ->
            if (index > 0) SettingsDivider()
            val pairColors = CustomPairs.colors(pair)
            PresetRow(
                name = pair.name,
                colors = pairColors,
                selected = pairColors == current,
                onClick = { onChange(pairColors.primary, pairColors.background) },
            )
        }
    }

    Spacer(Modifier.height(10.dp))
    SectionHead("Własny motyw", palette.textSoft)
    SettingsCard {
        ColorLabelRow("Kolor główny", "akcent: przyciski, plakietki notatek", current.primary)
        SwatchRow(CustomPairs.accents, current.primary) { hex -> onChange(hex, current.background) }
        SettingsDivider()
        ColorLabelRow("Kolor tła", "o jego jasności decyduje cały motyw", current.background)
        SwatchRow(CustomPairs.backgrounds, current.background) { hex -> onChange(current.primary, hex) }
    }

    Spacer(Modifier.height(10.dp))
    SettingsCard {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            ExactColorPicker(colors = current, onChange = onChange)
        }
    }

    Spacer(Modifier.height(10.dp))
    CustomPreview(colors = current, report = report)

    Spacer(Modifier.height(8.dp))
    Text(
        text = if (report.corrected) {
            "Akcent ${report.picked} jest za jasny na to tło, więc aplikacja przyciemnia go do " +
                "${report.applied}."
        } else {
            "Akcent ${report.applied} ma na tym tle kontrast ${oneDecimal(report.contrast)}:1 — nic nie zmieniamy."
        },
        style = MaterialTheme.typography.labelSmall,
        color = palette.textSoft,
    )
    Text(
        text = "Tonację wyznacza kolor tła: " +
            if (report.dark) "ciemne tło daje jasny tekst." else "jasne tło daje ciemny tekst.",
        style = MaterialTheme.typography.labelSmall,
        color = palette.textSoft,
    )
    Text(
        text = "Zmiana koloru od razu włącza motyw „Własny”. Widżety na pulpicie biorą te same " +
            "dwa kolory, więc nie trzeba ich dodawać od nowa.",
        style = MaterialTheme.typography.labelSmall,
        color = palette.textSoft,
    )
}

@Composable
private fun SectionHead(text: String, color: Color) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.4.sp,
        color = color,
        modifier = Modifier.padding(start = 4.dp, top = 2.dp, bottom = 6.dp),
    )
}

/** Wiersz gotowej pary: nazwa, para kropek (akcent + tło) i kółko wyboru. */
@Composable
private fun PresetRow(
    name: String,
    colors: CustomColors,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val palette = LocalStylePalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.RadioButton, onClick = onClick)
            .heightIn(min = 56.dp)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                color = palette.text,
            )
            Text(
                text = "${colors.primary} · tło ${colors.background}",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                letterSpacing = 0.5.sp,
                color = palette.textSoft,
            )
        }
        // Dwie kropki: od razu widać, że para to akcent **i** tło.
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf(colors.primary, colors.background).forEach { hex ->
                Box(
                    modifier = Modifier
                        .size(16.dp)
                        .clip(CircleShape)
                        .background(parse(hex))
                        .border(1.dp, palette.edge, CircleShape),
                )
            }
        }
        RadioMark(selected = selected)
    }
}

/** Podpis koloru: nazwa, podpowiedź i wartość hex (wybierak jest niżej). */
@Composable
private fun ColorLabelRow(title: String, hint: String, hex: String) {
    val palette = LocalStylePalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                color = palette.text,
            )
            Text(
                text = hint,
                style = MaterialTheme.typography.labelSmall,
                color = palette.textSoft,
            )
        }
        Text(
            text = hex.uppercase(Locale.ROOT),
            style = MaterialTheme.typography.labelMedium,
            color = palette.textSoft,
        )
        Box(
            modifier = Modifier
                .size(24.dp)
                .clip(CircleShape)
                .background(parse(hex))
                .border(1.dp, palette.edge, CircleShape),
        )
    }
}

/** Rząd próbek koloru — dotknięcie ustawia kolor i włącza motyw „Własny”. */
@Composable
private fun SwatchRow(
    swatches: List<String>,
    current: String,
    onPick: (String) -> Unit,
) {
    val palette = LocalStylePalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 16.dp, bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        swatches.forEach { hex ->
            val on = hex.equals(current, ignoreCase = true)
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(parse(hex))
                    .border(
                        width = if (on) 2.dp else 1.dp,
                        color = if (on) palette.text else palette.edge,
                        shape = CircleShape,
                    )
                    .clickable(role = Role.RadioButton) { onPick(hex) },
            )
        }
    }
}

/**
 * Dokładne dobieranie koloru: kwadrat nasycenie/jasność (widać kolor pod palcem)
 * i pasek barwy — zamiast trzech suwaków HSV, na których nie było widać, co się
 * właściwie wybiera.
 */
@Composable
private fun ExactColorPicker(colors: CustomColors, onChange: (String, String) -> Unit) {
    val palette = LocalStylePalette.current
    var channel by rememberSaveable { mutableIntStateOf(0) }
    val activeHex = if (channel == 0) colors.primary else colors.background

    var draft by remember(channel) {
        mutableStateOf(ColorHsv.fromHex(activeHex) ?: Hsv(hue = 265f, saturation = 0.65f, value = 0.95f))
    }
    var emitted by remember(channel) { mutableStateOf(activeHex) }

    // Kolor zmieniony z zewnątrz (próbka, para) trafia też do kwadratu, ale
    // **nasz** kolor nie resetuje barwy, gdy jasność zjedzie do zera.
    LaunchedEffect(activeHex) {
        if (!activeHex.equals(emitted, ignoreCase = true)) {
            ColorHsv.fromHex(activeHex)?.let { draft = it }
            emitted = activeHex
        }
    }

    fun commit(next: Hsv) {
        val clean = next.clamped()
        draft = clean
        val hex = ColorHsv.toHex(clean)
        emitted = hex
        onChange(
            if (channel == 0) hex else colors.primary,
            if (channel == 1) hex else colors.background,
        )
    }

    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = "Dokładny kolor",
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.labelMedium,
            color = palette.textSoft,
        )
        ChannelChip("Główny", channel == 0) { channel = 0 }
        Spacer(Modifier.width(6.dp))
        ChannelChip("Tło", channel == 1) { channel = 1 }
    }

    Spacer(Modifier.height(10.dp))
    val hueColor = Color(hsvColor(draft.hue, 1f, 1f))
    // `rememberUpdatedState` daje stabilne `State` dla gestu: modyfikator nie
    // odpina się przy każdym przerysowaniu, a `commit` czyta świeże wartości.
    val sv: State<(Offset, Size) -> Unit> = rememberUpdatedState { position, size ->
        commit(
            draft.copy(
                saturation = (position.x / size.width.coerceAtLeast(1f)).coerceIn(0f, 1f),
                value = (1f - position.y / size.height.coerceAtLeast(1f)).coerceIn(0f, 1f),
            ),
        )
    }
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(130.dp)
            .clip(RoundedCornerShape(12.dp))
            .dragPointer { position, size -> sv.value(position, size) },
    ) {
        drawRect(Brush.horizontalGradient(listOf(Color.White, hueColor)))
        drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color.Black)))
        val center = Offset(draft.saturation * size.width, (1f - draft.value) * size.height)
        drawCircle(Color.Black.copy(alpha = 0.35f), 11.dp.toPx(), center, style = Stroke(1.dp.toPx()))
        drawCircle(Color.White, 9.dp.toPx(), center, style = Stroke(3.dp.toPx()))
    }

    Spacer(Modifier.height(10.dp))
    val hue: State<(Offset, Size) -> Unit> = rememberUpdatedState { position, size ->
        commit(draft.copy(hue = (position.x / size.width.coerceAtLeast(1f)).coerceIn(0f, 1f) * 360f))
    }
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(26.dp)
            .clip(RoundedCornerShape(13.dp))
            .dragPointer { position, size -> hue.value(position, size) },
    ) {
        drawRect(Brush.horizontalGradient(hueStops()))
        val x = (draft.hue / 360f) * size.width
        drawCircle(Color.Black.copy(alpha = 0.35f), 10.dp.toPx(), Offset(x, size.height / 2f), style = Stroke(1.dp.toPx()))
        drawCircle(Color.White, 8.dp.toPx(), Offset(x, size.height / 2f), style = Stroke(3.dp.toPx()))
    }

    Spacer(Modifier.height(8.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = ColorHsv.toHex(draft),
            style = MaterialTheme.typography.labelMedium,
            color = palette.text,
        )
        Spacer(Modifier.width(10.dp))
        Text(
            text = "${draft.hue.toInt()}° · ${(draft.saturation * 100).toInt()}% · ${(draft.value * 100).toInt()}%",
            style = MaterialTheme.typography.labelSmall,
            color = palette.textSoft,
        )
    }
    Text(
        text = "Dotknij kwadratu albo paska barwy. Przeciąganie po kwadracie zmienia " +
            "nasycenie i jasność, po pasku — barwę.",
        style = MaterialTheme.typography.labelSmall,
        color = palette.textSoft,
    )
}

@Composable
private fun ChannelChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val palette = LocalStylePalette.current
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(if (selected) palette.accent.copy(alpha = 0.22f) else Color.Transparent)
            .border(1.dp, if (selected) palette.accent else palette.edge, CircleShape)
            .clickable(role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 5.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (selected) palette.accent else palette.textSoft,
        )
    }
}

/**
 * Podgląd motywu: kafel zajęć w **finalnej** palecie (po korekcie kontrastu),
 * z plakietką notatki i przyciskiem. Kolory bierzemy z `CustomTheme.palette`,
 * a nie z motywu aplikacji — podgląd ma pokazywać to, co użytkownik wybrał,
 * nawet gdy w aplikacji wciąż jest inny styl.
 */
@Composable
private fun CustomPreview(colors: CustomColors, report: CustomTheme.AccentReport) {
    val pal = remember(colors) { CustomTheme.palette(colors) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(pal.radius))
            .background(Brush.verticalGradient(pal.pageGradient.take(2)))
            .border(1.dp, pal.edge, RoundedCornerShape(pal.radius))
            .padding(14.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(pal.panelSolid)
                .border(1.dp, pal.edge, RoundedCornerShape(12.dp))
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(34.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(pal.accent),
            )
            Column(Modifier.weight(1f)) {
                Text(
                    text = "Analiza matematyczna 1",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = pal.text,
                )
                Text(
                    text = "W12 30 · Ćwiczenia · stacjonarnie",
                    style = MaterialTheme.typography.labelSmall,
                    color = pal.textSoft,
                )
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(pal.accentSoft)
                    .padding(horizontal = 9.dp, vertical = 3.dp),
            ) {
                Text(
                    text = "Kolos",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.3.sp,
                    color = pal.accent,
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(pal.accent)
                    .padding(horizontal = 16.dp, vertical = 7.dp),
            ) {
                Text(
                    text = "Dalej",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = pal.accentOn,
                )
            }
            Spacer(Modifier.width(10.dp))
            Text(
                text = "akcent ${report.applied} · kontrast ${oneDecimal(report.contrast)}:1",
                style = MaterialTheme.typography.labelSmall,
                color = pal.textSoft,
            )
        }
    }
}

/**
 * Dotknięcie i przeciąganie po elemencie. Pozycja idzie do `onDrag` razem
 * z rozmiarem płótna, więc przeliczenie na 0–1 jest po stronie wołającego.
 */
private fun Modifier.dragPointer(
    onDrag: (position: Offset, size: Size) -> Unit,
): Modifier = pointerInput(Unit) {
    val canvas = Size(size.width.toFloat(), size.height.toFloat())
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        // Zjadamy dotknięcie od razu — inaczej `verticalScroll` strony przejmie
        // pionowe przeciągnięcie i znacznik zostanie w miejscu.
        down.consume()
        onDrag(down.position, canvas)
        while (true) {
            val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id } ?: break
            change.consume()
            if (!change.pressed) break
            onDrag(change.position, canvas)
        }
    }
}

/** Kolor z HSV bez zależności od klasy `android.graphics.Color` w sygnaturach. */
private fun hsvColor(hue: Float, saturation: Float, value: Float): Int =
    android.graphics.Color.HSVToColor(floatArrayOf(hue, saturation, value))

/** Przebieg barw dla paska — 0°…360° co 30°. */
private fun hueStops(): List<Color> = (0..12).map { step -> Color(hsvColor(step * 30f, 1f, 1f)) }

private fun oneDecimal(value: Double): String = String.format(Locale.ROOT, "%.1f", value)

/** `#RRGGBB` → `Color`; śmieci (nie powinny trafić) dają przezroczysty. */
private fun parse(hex: String): Color {
    val clean = CustomColors.normalizeHex(hex) ?: return Color.Transparent
    return Color(android.graphics.Color.parseColor(clean))
}
