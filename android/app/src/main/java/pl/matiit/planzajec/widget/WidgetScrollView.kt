package pl.matiit.planzajec.widget

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceModifier
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.layout.Box
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding

/** Odstęp między nagłówkiem widżetu i pierwszą pozycją listy. */
private val HEADER_GAP = 6.dp

/** Odstęp nad etykietą kolejnego dnia w widżecie tygodnia. */
private val DAY_GAP = 6.dp

/**
 * Przewijana zawartość widżetu: nagłówek, etykiety dni i wszystkie zajęcia.
 *
 * Glance nie ma własnego mechanizmu przewijania poza `LazyColumn`, które
 * tłumaczy na systemowy `ListView` — a ten przewija się w kaflu tak samo jak
 * każda inna lista. Dlatego **nic nie jest obcinane do wysokości widżetu**:
 * pozycje ponad krawędź są po prostu poniżej i dochodzi się do nich palcem.
 *
 * Nagłówek jest pierwszą pozycją listy, a nie osobnym elementem nad nią. Inaczej
 * na niskim widżecie (4×2) sam nagłówek zajmowałby całe miejsce i lista miałaby
 * wysokość kilku pikseli, czyli nie dałoby się przewinąć do żadnych zajęć.
 *
 * `LazyColumn` nie może być zagnieżdżone w innym `LazyColumn` (Glance rzuca
 * „Glance does not support nested list views”), więc lista jest dokładnie jedna,
 * a wszystkie pozycje różnią się tylko zawartością.
 *
 * Każda pozycja jest klikalna osobno: `ListView` przechwytuje dotknięcia, więc
 * samo `clickable` na panelu widżetu nie zadziałałoby na liście.
 */
@Composable
internal fun WidgetScrollList(
    items: List<WidgetListItem>,
    look: WidgetLook,
    colors: WidgetColors,
    compact: Boolean,
    onClick: Action,
    header: @Composable () -> Unit,
) {
    LazyColumn(modifier = GlanceModifier.fillMaxWidth()) {
        item(itemId = WidgetScroll.HEADER_ITEM_ID) {
            Box(
                modifier = GlanceModifier
                    .fillMaxWidth()
                    .padding(bottom = HEADER_GAP)
                    .clickable(onClick),
            ) {
                header()
            }
        }
        items.forEach { item ->
            item(itemId = item.id) {
                when (item) {
                    is WidgetListItem.Day -> Box(
                        modifier = GlanceModifier
                            .fillMaxWidth()
                            .padding(top = if (item.first) 0.dp else DAY_GAP)
                            .clickable(onClick),
                    ) {
                        WidgetLookDayLabel(look = look, label = item.label, colors = colors)
                    }

                    is WidgetListItem.ClassRow -> Box(
                        modifier = GlanceModifier.fillMaxWidth().clickable(onClick),
                    ) {
                        WidgetLookRow(
                            look = look,
                            row = item.row,
                            colors = colors,
                            compact = compact,
                            last = item.last,
                        )
                    }
                }
            }
        }
    }
}
