package pl.matiit.planzajec.widget

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pl.matiit.planzajec.R
import pl.matiit.planzajec.ui.components.subjectColor
import pl.matiit.planzajec.ui.theme.LocalStylePalette
import pl.matiit.planzajec.ui.theme.StylePalette

/**
 * Ekran wyboru wersji graficznej widżetu. Pokazuje miniatury — każda odwzorowuje
 * układ, który widżet naprawdę narysuje (nagłówek, godziny, sala, długość zajęć).
 */
@Composable
internal fun WidgetConfigScreen(
    initial: WidgetLook,
    onConfirm: (WidgetLook) -> Unit,
    onCancel: () -> Unit,
) {
    val palette = LocalStylePalette.current
    var selected by remember { mutableStateOf(initial) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.page)
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 16.dp),
    ) {
        Text(
            text = stringResource(R.string.widget_config_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = palette.text,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = stringResource(R.string.widget_config_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = palette.textSoft,
        )
        Spacer(Modifier.height(18.dp))

        WidgetLook.entries.forEach { look ->
            LookOption(
                look = look,
                selected = look == selected,
                palette = palette,
                onSelect = { selected = look },
            )
            Spacer(Modifier.height(10.dp))
        }

        Spacer(Modifier.height(8.dp))
        Button(
            onClick = { onConfirm(selected) },
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = palette.accent,
                contentColor = palette.accentOn,
            ),
        ) {
            Text(
                text = stringResource(R.string.widget_config_confirm),
                fontWeight = FontWeight.SemiBold,
            )
        }
        TextButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) {
            Text(
                text = stringResource(R.string.widget_config_cancel),
                color = palette.textSoft,
            )
        }
    }
}

@Composable
private fun LookOption(
    look: WidgetLook,
    selected: Boolean,
    palette: StylePalette,
    onSelect: () -> Unit,
) {
    val shape = RoundedCornerShape(20.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(if (selected) palette.accentSoft.copy(alpha = 0.4f) else palette.panelSolid)
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) palette.accent else palette.edge.copy(alpha = 0.6f),
                shape = shape,
            )
            .clickable(onClick = onSelect)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LookPreview(look, palette)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(
                text = lookTitle(look),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = palette.text,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = lookHint(look),
                style = MaterialTheme.typography.bodySmall,
                color = palette.textSoft,
            )
        }
        Spacer(Modifier.width(10.dp))
        Box(
            modifier = Modifier
                .size(22.dp)
                .clip(CircleShape)
                .background(if (selected) palette.accent else Color.Transparent)
                .border(
                    width = 1.5.dp,
                    color = if (selected) palette.accent else palette.edge,
                    shape = CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (selected) {
                Text(
                    text = "✓",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = palette.accentOn,
                )
            }
        }
    }
}

@Composable
internal fun lookTitle(look: WidgetLook): String = stringResource(
    when (look) {
        WidgetLook.Vision -> R.string.widget_look_vision_title
        WidgetLook.Minimal -> R.string.widget_look_minimal_title
        WidgetLook.Accent -> R.string.widget_look_accent_title
        WidgetLook.Timeline -> R.string.widget_look_timeline_title
        WidgetLook.Tiles -> R.string.widget_look_tiles_title
        WidgetLook.Compact -> R.string.widget_look_compact_title
        WidgetLook.Glass -> R.string.widget_look_glass_title
    },
)

@Composable
private fun lookHint(look: WidgetLook): String = stringResource(
    when (look) {
        WidgetLook.Vision -> R.string.widget_look_vision_hint
        WidgetLook.Minimal -> R.string.widget_look_minimal_hint
        WidgetLook.Accent -> R.string.widget_look_accent_hint
        WidgetLook.Timeline -> R.string.widget_look_timeline_hint
        WidgetLook.Tiles -> R.string.widget_look_tiles_hint
        WidgetLook.Compact -> R.string.widget_look_compact_hint
        WidgetLook.Glass -> R.string.widget_look_glass_hint
    },
)

@Composable
private fun LookPreview(look: WidgetLook, palette: StylePalette) {
    // Miniatura celowo łamie typografię Material: bez tego dziedziczona
    // wysokość linii (bodyLarge, 24sp) rozsadza 84-dp podgląd.
    CompositionLocalProvider(
        LocalTextStyle provides TextStyle(fontSize = 7.sp, lineHeight = 9.sp),
    ) {
        Box(
            modifier = Modifier
                .width(132.dp)
                .height(84.dp)
                .clip(RoundedCornerShape(if (look == WidgetLook.Vision) 18.dp else 12.dp))
                .background(palette.panelSolid)
                .padding(8.dp),
        ) {
            when (look) {
                WidgetLook.Vision -> VisionPreview(palette)
                WidgetLook.Minimal -> MinimalPreview(palette)
                WidgetLook.Accent -> AccentPreview(palette)
                WidgetLook.Timeline -> TimelinePreview(palette)
                WidgetLook.Tiles -> TilesPreview(palette)
                WidgetLook.Compact -> CompactPreview(palette)
                WidgetLook.Glass -> GlassPreview(palette)
            }
        }
    }
}

@Composable
private fun VisionPreview(palette: StylePalette) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Plan dnia",
                fontSize = 8.sp,
                fontWeight = FontWeight.SemiBold,
                color = palette.text,
            )
            Spacer(Modifier.weight(1f))
            Text(text = "Ćw (gr. 2)", fontSize = 6.sp, color = palette.accent)
        }
        Text(text = "Dziś · Sob 14.11", fontSize = 6.sp, color = palette.textSoft)
        Spacer(Modifier.height(5.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.width(24.dp)) {
                Text(
                    text = "10:45",
                    fontSize = 7.sp,
                    fontWeight = FontWeight.Medium,
                    color = palette.accent,
                )
                Text(text = "12:15", fontSize = 5.sp, color = palette.textSoft)
            }
            Text(
                text = "Analiza mat.",
                fontSize = 7.sp,
                color = palette.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.weight(1f))
            Column(horizontalAlignment = Alignment.End) {
                Text(text = "S55 27", fontSize = 5.sp, color = palette.textSoft, maxLines = 1)
                Text(text = "1h 30m", fontSize = 5.sp, color = palette.textSoft, maxLines = 1)
            }
        }
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.width(24.dp)) {
                Text(
                    text = "12:30",
                    fontSize = 7.sp,
                    fontWeight = FontWeight.Medium,
                    color = palette.accent,
                )
                Text(text = "14:00", fontSize = 5.sp, color = palette.textSoft)
            }
            Text(
                text = "Programowanie",
                fontSize = 7.sp,
                color = palette.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun MinimalPreview(palette: StylePalette) {
    Column {
        Text(
            text = "PLAN DNIA",
            fontSize = 5.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.5.sp,
            color = palette.textSoft,
        )
        Text(text = "Dziś · Sob 14.11", fontSize = 7.sp, color = palette.text)
        Spacer(Modifier.height(7.dp))
        Row {
            Text(
                text = "10:45–12:15",
                modifier = Modifier.width(48.dp),
                fontSize = 5.sp,
                color = palette.textSoft,
                maxLines = 1,
            )
            Text(
                text = "Analiza mat.",
                fontSize = 7.sp,
                color = palette.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.height(4.dp))
        Row {
            Text(
                text = "12:30–14:00",
                modifier = Modifier.width(48.dp),
                fontSize = 5.sp,
                color = palette.textSoft,
                maxLines = 1,
            )
            Text(
                text = "Programowanie",
                fontSize = 7.sp,
                color = palette.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun AccentPreview(palette: StylePalette) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(palette.accent)
                .padding(horizontal = 6.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = "Plan dnia",
                    fontSize = 7.sp,
                    fontWeight = FontWeight.Bold,
                    color = palette.accentOn,
                )
                Text(text = "Dziś · Sob 14.11", fontSize = 5.sp, color = palette.accentOn)
            }
            Text(text = "Ćw (gr. 2)", fontSize = 5.sp, color = palette.accentOn)
        }
        Spacer(Modifier.height(5.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(6.dp))
                .background(palette.accent.copy(alpha = 0.16f))
                .padding(horizontal = 5.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "10:45",
                fontSize = 6.sp,
                fontWeight = FontWeight.Bold,
                color = palette.accent,
            )
            Spacer(Modifier.width(6.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = "Analiza mat.",
                    fontSize = 7.sp,
                    color = palette.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(text = "S55 27 · 1h 30m", fontSize = 5.sp, color = palette.textSoft, maxLines = 1)
            }
        }
    }
}

@Composable
private fun TimelinePreview(palette: StylePalette) {
    Column {
        Row(verticalAlignment = Alignment.Top) {
            Column(
                modifier = Modifier.width(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier
                        .size(5.dp)
                        .clip(CircleShape)
                        .background(palette.accent),
                )
                Box(
                    Modifier
                        .width(1.5.dp)
                        .height(20.dp)
                        .background(palette.edge),
                )
            }
            Column(Modifier.width(30.dp)) {
                Text(
                    text = "10:45",
                    fontSize = 6.sp,
                    fontWeight = FontWeight.Medium,
                    color = palette.accent,
                )
                Text(text = "12:15", fontSize = 5.sp, color = palette.textSoft)
            }
            Column(Modifier.weight(1f)) {
                Text(
                    text = "Analiza mat.",
                    fontSize = 7.sp,
                    color = palette.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(text = "S55 27 · 1h 30m", fontSize = 5.sp, color = palette.textSoft, maxLines = 1)
            }
        }
    }
}

/** Kafelkowy wariant: karty zajęć z paskiem w kolorze przedmiotu. */
@Composable
private fun TilesPreview(palette: StylePalette) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "Plan dnia",
                fontSize = 8.sp,
                fontWeight = FontWeight.SemiBold,
                color = palette.text,
            )
            Spacer(Modifier.weight(1f))
            Text(text = "Ćw (gr. 2)", fontSize = 6.sp, color = palette.accent)
        }
        TilePreviewRow(
            palette = palette,
            time = "10:45",
            subject = "Analiza mat.",
            meta = "Ćw · S55 27",
            accent = subjectColor("Analiza matematyczna"),
        )
        TilePreviewRow(
            palette = palette,
            time = "12:30",
            subject = "Programowanie",
            meta = "Wyk · zdalnie",
            accent = subjectColor("Programowanie"),
        )
    }
}

/** Kompakt: jedna linia na zajęcia + cienki separator (najgęstszy wariant). */
@Composable
private fun CompactPreview(palette: StylePalette) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "Plan dnia",
                fontSize = 7.sp,
                fontWeight = FontWeight.SemiBold,
                color = palette.text,
            )
            Spacer(Modifier.weight(1f))
            Text(text = "Sob 14.11", fontSize = 5.sp, color = palette.textSoft)
        }
        Spacer(Modifier.height(4.dp))
        CompactPreviewRow("10:45–12:15", "Analiza mat.", "Ćw", palette)
        Box(Modifier.fillMaxWidth().height(1.dp).background(palette.edge))
        CompactPreviewRow("12:30–14:00", "Programowanie", "Wyk", palette)
        Box(Modifier.fillMaxWidth().height(1.dp).background(palette.edge))
        CompactPreviewRow("14:15–15:45", "Algebra liniowa", "Wyk", palette)
    }
}

@Composable
private fun CompactPreviewRow(time: String, subject: String, form: String, palette: StylePalette) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = time,
            modifier = Modifier.width(46.dp),
            fontSize = 5.sp,
            fontWeight = FontWeight.Medium,
            color = palette.accent,
            maxLines = 1,
        )
        Text(
            text = subject,
            modifier = Modifier.weight(1f),
            fontSize = 7.sp,
            color = palette.text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(text = form, fontSize = 5.sp, color = palette.textSoft, maxLines = 1)
    }
}

/** Szkło: duża godzina, plakietka typu i cienka linia między zajęciami. */
@Composable
private fun GlassPreview(palette: StylePalette) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "Plan dnia",
                fontSize = 8.sp,
                fontWeight = FontWeight.SemiBold,
                color = palette.text,
            )
            Spacer(Modifier.weight(1f))
            Text(text = "Ćw (gr. 2)", fontSize = 6.sp, color = palette.accent)
        }
        Spacer(Modifier.height(4.dp))
        GlassPreviewRow(palette, "10:45", "12:15", "Analiza mat.", "S55 27 · 1h 30m", "Ćw")
        Box(Modifier.fillMaxWidth().height(1.dp).background(palette.edge))
        GlassPreviewRow(palette, "12:30", "14:00", "Programowanie", "zdalnie · 1h 30m", "Wyk")
    }
}

@Composable
private fun GlassPreviewRow(
    palette: StylePalette,
    start: String,
    end: String,
    subject: String,
    meta: String,
    form: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(30.dp)) {
            Text(
                text = start,
                fontSize = 8.sp,
                fontWeight = FontWeight.Bold,
                color = palette.accent,
                maxLines = 1,
            )
            Text(text = end, fontSize = 5.sp, color = palette.textSoft, maxLines = 1)
        }
        Column(Modifier.weight(1f)) {
            Text(
                text = subject,
                fontSize = 7.sp,
                color = palette.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(text = meta, fontSize = 5.sp, color = palette.textSoft, maxLines = 1)
        }
        Text(
            text = form,
            modifier = Modifier
                .clip(RoundedCornerShape(4.dp))
                .background(palette.accent.copy(alpha = 0.16f))
                .padding(horizontal = 3.dp, vertical = 1.dp),
            fontSize = 4.sp,
            fontWeight = FontWeight.Medium,
            color = palette.accent,
        )
    }
}

@Composable
private fun TilePreviewRow(
    palette: StylePalette,
    time: String,
    subject: String,
    meta: String,
    accent: Color,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(6.dp))
            .background(palette.accent.copy(alpha = 0.16f))
            .padding(horizontal = 4.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .width(2.dp)
                .height(14.dp)
                .clip(RoundedCornerShape(1.dp))
                .background(accent),
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = time,
            fontSize = 6.sp,
            fontWeight = FontWeight.Bold,
            color = palette.accent,
        )
        Spacer(Modifier.width(4.dp))
        Column(Modifier.weight(1f)) {
            Text(
                text = subject,
                fontSize = 6.sp,
                color = palette.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(text = meta, fontSize = 5.sp, color = palette.textSoft, maxLines = 1)
        }
    }
}
