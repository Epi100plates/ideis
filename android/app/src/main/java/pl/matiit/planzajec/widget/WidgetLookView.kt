package pl.matiit.planzajec.widget

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import pl.matiit.planzajec.ui.components.subjectColor

/**
 * Wspólne klocki wariantów graficznych widżetu. Każdy wariant ma inny panel,
 * nagłówek i układ wiersza, ale wszystkie korzystają z tej samej palety stylu
 * i pokazują pełną informację o zajęciach: godziny, przedmiot, typ (Wyk/Ćw/Lab),
 * salę albo „zdalnie” i długość.
 *
 * Zasady czytelności (po zgłoszeniach, że kafelki się zlewają):
 * - **odstępy**: każdy wiersz ma min. 5 dp pionu, a karty 5 dp przerwy —
 *   wcześniej 2–3 dp sklejało sąsiednie zajęcia w jeden blok,
 * - **kontrast**: metadane używają [WidgetColors.meta] (bliżej koloru tekstu niż
 *   `subtle`), a obwódka kafelka jest o 44% odsunięta od panelu,
 * - **przedmiot**: kolumna godzin jest węższa, żeby nazwa miała więcej miejsca;
 *   Glance 1.2 nie ma `TextOverflow`, więc dłuższe nazwy przycina sama warstwa
 *   widoku (dlatego szerokości kolumn są dobrane pod realne nazwy zajęć),
 * - **typ zajęć** jest wszędzie widoczny (w metadanych albo plakietką).
 *
 * Układ widżetu (nagłówek + lista zajęć) składa [WidgetScrollList]; tutaj są
 * tylko same klocki: panel, nagłówek, etykieta dnia i wiersz jednych zajęć.
 */

@Composable
internal fun WidgetPanel(
    look: WidgetLook,
    colors: WidgetColors,
    onClick: Action,
    content: @Composable () -> Unit,
) {
    val frame = GlanceModifier.fillMaxSize().appWidgetBackground()
    val body = when (look) {
        WidgetLook.Vision -> frame
            .background(colors.surface)
            .cornerRadius(26.dp)
            .padding(14.dp)

        WidgetLook.Minimal -> frame
            .background(colors.surfaceFlat)
            .cornerRadius(18.dp)
            .padding(12.dp)

        WidgetLook.Accent -> frame
            .background(colors.surface)
            .cornerRadius(22.dp)
            .padding(10.dp)

        WidgetLook.Timeline -> frame
            .background(colors.surface)
            .cornerRadius(26.dp)
            .padding(14.dp)

        WidgetLook.Tiles -> frame
            .background(colors.surfaceFlat)
            .cornerRadius(22.dp)
            .padding(12.dp)

        WidgetLook.Compact -> frame
            .background(colors.surfaceFlat)
            .cornerRadius(20.dp)
            .padding(horizontal = 12.dp, vertical = 10.dp)

        WidgetLook.Glass -> frame
            .background(colors.surfaceGlass)
            .cornerRadius(28.dp)
            .padding(14.dp)
    }
    Column(
        modifier = body.clickable(onClick),
        verticalAlignment = Alignment.Vertical.Top,
        horizontalAlignment = Alignment.Horizontal.Start,
    ) {
        content()
    }
}

@Composable
internal fun WidgetLookHeader(
    look: WidgetLook,
    title: String,
    groupLabel: String,
    subtitle: String,
    colors: WidgetColors,
) {
    when (look) {
        WidgetLook.Vision, WidgetLook.Timeline, WidgetLook.Tiles, WidgetLook.Glass -> Column {
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                verticalAlignment = Alignment.Vertical.CenterVertically,
            ) {
                Text(
                    text = title,
                    modifier = GlanceModifier.defaultWeight(),
                    style = TextStyle(
                        color = colors.title,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                    maxLines = 1,
                )
                Text(
                    text = groupLabel,
                    style = TextStyle(
                        color = colors.accent,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                    maxLines = 1,
                )
            }
            Text(
                text = subtitle,
                style = TextStyle(color = colors.meta, fontSize = 11.sp),
                maxLines = 1,
            )
        }

        WidgetLook.Minimal -> Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.Vertical.CenterVertically,
        ) {
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = title.uppercase(),
                    style = TextStyle(
                        color = colors.subtle,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                    maxLines = 1,
                )
                Text(
                    text = subtitle,
                    style = TextStyle(color = colors.title, fontSize = 12.sp),
                    maxLines = 1,
                )
            }
            Text(
                text = groupLabel,
                style = TextStyle(
                    color = colors.accent,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                ),
                maxLines = 1,
            )
        }

        WidgetLook.Accent -> Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .background(colors.accent)
                .cornerRadius(16.dp)
                .padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.Vertical.CenterVertically,
        ) {
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = title,
                    style = TextStyle(
                        color = colors.accentOn,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                    maxLines = 1,
                )
                Text(
                    text = subtitle,
                    style = TextStyle(color = colors.accentOn, fontSize = 11.sp),
                    maxLines = 1,
                )
            }
            Text(
                text = groupLabel,
                style = TextStyle(
                    color = colors.accentOn,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                ),
                maxLines = 1,
            )
        }

        // Kompakt: zamiast tytułu widżetu pokazujemy od razu dzień (to jest
        // najważniejsza informacja), a po prawej grupę. Tytuł „Plan dnia”
        // i godzina pobrania planu nie mieszczą się w jednej linii.
        WidgetLook.Compact -> Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.Vertical.CenterVertically,
        ) {
            Text(
                text = subtitle.substringBefore(" · "),
                modifier = GlanceModifier.defaultWeight(),
                style = TextStyle(
                    color = colors.title,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                ),
                maxLines = 1,
            )
            Text(
                text = groupLabel,
                style = TextStyle(
                    color = colors.accent,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                ),
                maxLines = 1,
            )
        }
    }
}

/**
 * Plakietka notatki w wierszu widżetu („Kolos”, „Egzamin”).
 *
 * Ten sam język co w aplikacji: delikatne podbarwienie akcentem i tekst
 * w kolorze akcentu, więc plakietka pasuje do każdego motywu (także „Własnego”).
 * W widżecie nie ma miejsca na chorągiewkę z kafelka — zostaje zwarta pigułka
 * o rozmiarze tekstu metadanych.
 */
@Composable
internal fun WidgetNoteChip(note: String, colors: WidgetColors) {
    Text(
        text = note,
        modifier = GlanceModifier
            .background(colors.accentWash)
            .cornerRadius(7.dp)
            .padding(horizontal = 5.dp, vertical = 2.dp),
        style = TextStyle(
            color = colors.accent,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
        ),
        maxLines = 1,
    )
}

/** Chip notatki po prawej stronie wiersza — nic, gdy notatki nie ma. */
@Composable
private fun RowNote(row: WidgetRow, colors: WidgetColors, gap: Boolean = true) {
    val note = row.note?.takeIf { it.isNotBlank() } ?: return
    if (gap) Spacer(GlanceModifier.width(6.dp))
    WidgetNoteChip(note, colors)
}

/**
 * Jedne zajęcia: godziny, przedmiot, typ, sala/zdalnie i długość.
 * `compact` to widżet tygodnia — bez długości, żeby zmieścić więcej dni.
 */
@Composable
internal fun WidgetLookRow(
    look: WidgetLook,
    row: WidgetRow,
    colors: WidgetColors,
    compact: Boolean = false,
    last: Boolean = true,
) {
    val meta = if (compact) row.shortMetaLabel else row.metaLabel

    when (look) {
        WidgetLook.Vision -> Row(
            modifier = GlanceModifier.fillMaxWidth().padding(vertical = 5.dp),
            verticalAlignment = Alignment.Vertical.CenterVertically,
        ) {
            Column(modifier = GlanceModifier.width(54.dp)) {
                Text(
                    text = row.start,
                    style = TextStyle(
                        color = colors.accent,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                    maxLines = 1,
                )
                Text(
                    text = row.end,
                    style = TextStyle(color = colors.meta, fontSize = 11.sp),
                    maxLines = 1,
                )
            }
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = row.subject,
                    style = TextStyle(color = colors.title, fontSize = 15.sp),
                    maxLines = 1,
                )
                meta?.let { label ->
                    Text(
                        text = label,
                        style = TextStyle(color = colors.meta, fontSize = 12.sp),
                        maxLines = 1,
                    )
                }
            }
            RowNote(row, colors)
        }

        WidgetLook.Minimal -> Row(
            modifier = GlanceModifier.fillMaxWidth().padding(vertical = 5.dp),
            verticalAlignment = Alignment.Vertical.CenterVertically,
        ) {
            Text(
                text = row.timeRange,
                modifier = GlanceModifier.width(94.dp),
                style = TextStyle(color = colors.meta, fontSize = 13.sp),
                maxLines = 1,
            )
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = row.subject,
                    style = TextStyle(color = colors.title, fontSize = 15.sp),
                    maxLines = 1,
                )
                meta?.let { label ->
                    Text(
                        text = label,
                        style = TextStyle(color = colors.meta, fontSize = 12.sp),
                        maxLines = 1,
                    )
                }
            }
            RowNote(row, colors)
        }

        WidgetLook.Accent -> Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .padding(vertical = 3.dp)
                .background(colors.accentWash)
                .cornerRadius(14.dp)
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Vertical.CenterVertically,
        ) {
            Column(modifier = GlanceModifier.width(50.dp)) {
                Text(
                    text = row.start,
                    style = TextStyle(
                        color = colors.accent,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                    maxLines = 1,
                )
                Text(
                    text = row.end,
                    style = TextStyle(color = colors.meta, fontSize = 11.sp),
                    maxLines = 1,
                )
            }
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = row.subject,
                    style = TextStyle(
                        color = colors.title,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                    maxLines = 1,
                )
                meta?.let { label ->
                    Text(
                        text = label,
                        style = TextStyle(color = colors.meta, fontSize = 12.sp),
                        maxLines = 1,
                    )
                }
            }
            RowNote(row, colors)
        }

        WidgetLook.Timeline -> Row(
            modifier = GlanceModifier.fillMaxWidth().padding(vertical = 5.dp),
        ) {
            Column(
                modifier = GlanceModifier.width(16.dp),
                horizontalAlignment = Alignment.Horizontal.CenterHorizontally,
            ) {
                Box(
                    GlanceModifier
                        .width(9.dp)
                        .height(9.dp)
                        .background(colors.accent)
                        .cornerRadius(5.dp),
                ) {}
                if (!last) {
                    Box(
                        GlanceModifier
                            .width(2.dp)
                            .height(24.dp)
                            .background(colors.line),
                    ) {}
                }
            }
            Column(modifier = GlanceModifier.width(54.dp)) {
                Text(
                    text = row.start,
                    style = TextStyle(
                        color = colors.accent,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                    maxLines = 1,
                )
                Text(
                    text = row.end,
                    style = TextStyle(color = colors.meta, fontSize = 11.sp),
                    maxLines = 1,
                )
            }
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = row.subject,
                    style = TextStyle(color = colors.title, fontSize = 15.sp),
                    maxLines = 1,
                )
                meta?.let { label ->
                    Text(
                        text = label,
                        style = TextStyle(color = colors.meta, fontSize = 12.sp),
                        maxLines = 1,
                    )
                }
            }
            RowNote(row, colors)
        }

        // Kafelki jak w aplikacji: karta zajęć z paskiem w kolorze przedmiotu
        // (ten sam kolor co kropka w kalendarzu), godziną i metadanymi.
        // Glance nie ma obwódek, więc 1 dp „ramki” rysuje zewnętrzny Box
        // w ciemniejszym kolorze, a wewnętrzny — jaśniejszy — kartę.
        WidgetLook.Tiles -> Box(
            modifier = GlanceModifier
                .fillMaxWidth()
                // 5 dp przerwy: przy 2 dp karty zlewały się w jeden pas.
                .padding(vertical = 3.dp)
                .background(colors.tileEdge)
                .cornerRadius(15.dp)
                .padding(1.dp),
        ) {
            Row(
                modifier = GlanceModifier
                    .fillMaxWidth()
                    .background(colors.tile)
                    .cornerRadius(14.dp)
                    .padding(horizontal = 8.dp, vertical = 5.dp),
                verticalAlignment = Alignment.Vertical.CenterVertically,
            ) {
                Box(
                    GlanceModifier
                        .width(3.dp)
                        .height(34.dp)
                        .background(subjectColor(row.subject))
                        .cornerRadius(2.dp),
                ) {}
                Spacer(GlanceModifier.width(7.dp))
                Column(modifier = GlanceModifier.width(46.dp)) {
                    Text(
                        text = row.start,
                        style = TextStyle(
                            color = colors.accent,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                        maxLines = 1,
                    )
                    Text(
                        text = row.end,
                        style = TextStyle(color = colors.meta, fontSize = 11.sp),
                        maxLines = 1,
                    )
                }
                Column(modifier = GlanceModifier.defaultWeight()) {
                    Text(
                        text = row.subject,
                        style = TextStyle(
                            color = colors.title,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium,
                        ),
                        maxLines = 1,
                    )
                    meta?.let { label ->
                        Text(
                            text = label,
                            style = TextStyle(color = colors.meta, fontSize = 12.sp),
                            maxLines = 1,
                        )
                    }
                }
                RowNote(row, colors, gap = false)
            }
        }

        // Kompakt: jedna linia na zajęcia + cienki separator. Najgęstszy wariant —
        // w widżecie 4×3 mieści się dzięki temu o 2–3 zajęcia więcej.
        WidgetLook.Compact -> Column(GlanceModifier.fillMaxWidth()) {
            Row(
                modifier = GlanceModifier.fillMaxWidth().padding(vertical = 4.dp),
                verticalAlignment = Alignment.Vertical.CenterVertically,
            ) {
                Text(
                    text = if (compact) row.start else row.timeRange,
                    modifier = GlanceModifier.width(if (compact) 44.dp else 88.dp),
                    style = TextStyle(
                        color = colors.meta,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                    maxLines = 1,
                )
                Text(
                    text = row.subject,
                    modifier = GlanceModifier.defaultWeight(),
                    style = TextStyle(color = colors.title, fontSize = 14.sp),
                    maxLines = 1,
                )
                RowNote(row, colors, gap = false)
                if (!compact) {
                    row.formLabel?.let { label ->
                        Text(
                            text = label,
                            style = TextStyle(color = colors.meta, fontSize = 11.sp),
                            maxLines = 1,
                        )
                    }
                }
            }
            if (!last) {
                Box(GlanceModifier.fillMaxWidth().height(1.dp).background(colors.line)) {}
            }
        }

        // Szkło: duża godzina, przedmiot i metadane, typ zajęć w plakietce,
        // a między zajęciami cienka linia zamiast kart.
        WidgetLook.Glass -> Column(GlanceModifier.fillMaxWidth()) {
            Row(
                modifier = GlanceModifier.fillMaxWidth().padding(vertical = 5.dp),
                verticalAlignment = Alignment.Vertical.CenterVertically,
            ) {
                Column(modifier = GlanceModifier.width(54.dp)) {
                    Text(
                        text = row.start,
                        style = TextStyle(
                            color = colors.accent,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                        maxLines = 1,
                    )
                    Text(
                        text = row.end,
                        style = TextStyle(color = colors.meta, fontSize = 11.sp),
                        maxLines = 1,
                    )
                }
                Column(modifier = GlanceModifier.defaultWeight()) {
                    Text(
                        text = row.subject,
                        style = TextStyle(color = colors.title, fontSize = 15.sp),
                        maxLines = 1,
                    )
                    row.placeMetaLabel?.let { label ->
                        Text(
                            text = label,
                            style = TextStyle(color = colors.meta, fontSize = 11.sp),
                            maxLines = 1,
                        )
                    }
                }
                if (!compact) {
                    row.formLabel?.let { label ->
                        Text(
                            text = label,
                            modifier = GlanceModifier
                                .background(colors.accentWash)
                                .cornerRadius(7.dp)
                                .padding(horizontal = 5.dp, vertical = 2.dp),
                            style = TextStyle(
                                color = colors.accent,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Medium,
                            ),
                            maxLines = 1,
                        )
                    }
                }
                RowNote(row, colors)
            }
            if (!last) {
                Box(GlanceModifier.fillMaxWidth().height(1.dp).background(colors.line)) {}
            }
        }
    }
}

/** Nagłówek dnia w widżecie tygodnia — inny dla każdego wariantu. */
@Composable
internal fun WidgetLookDayLabel(look: WidgetLook, label: String, colors: WidgetColors) {
    when (look) {
        WidgetLook.Vision -> Text(
            text = label.uppercase(),
            style = TextStyle(
                color = colors.meta,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            ),
            maxLines = 1,
        )

        WidgetLook.Minimal, WidgetLook.Tiles -> Text(
            text = label,
            style = TextStyle(
                color = colors.accent,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            ),
            maxLines = 1,
        )

        WidgetLook.Accent -> Text(
            text = label.uppercase(),
            modifier = GlanceModifier
                .background(colors.accentWash)
                .cornerRadius(8.dp)
                .padding(horizontal = 7.dp, vertical = 2.dp),
            style = TextStyle(
                color = colors.accent,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            ),
            maxLines = 1,
        )

        WidgetLook.Timeline -> Text(
            text = label,
            style = TextStyle(
                color = colors.title,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            ),
            maxLines = 1,
        )

        WidgetLook.Compact -> Text(
            text = label.uppercase(),
            style = TextStyle(
                color = colors.accent,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
            ),
            maxLines = 1,
        )

        WidgetLook.Glass -> Text(
            text = label.uppercase(),
            style = TextStyle(
                color = colors.subtle,
                fontSize = 10.sp,
                fontWeight = FontWeight.Medium,
            ),
            maxLines = 1,
        )
    }
}

@Composable
internal fun WidgetLookEmpty(text: String, colors: WidgetColors) {
    Text(
        text = text,
        style = TextStyle(color = colors.meta, fontSize = 13.sp),
        maxLines = 2,
    )
}
