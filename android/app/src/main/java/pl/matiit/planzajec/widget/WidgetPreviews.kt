package pl.matiit.planzajec.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.provideContent
import pl.matiit.planzajec.data.PlanGraph

/**
 * Widżety używane **tylko** jako miniaturka w systemowym okienku przypinania
 * (`requestPinGlanceAppWidget`).
 *
 * Muszą rysować treść bez `currentState`: Glance komponuje podgląd bez sesji
 * widżetu i podstawia pod stan inny obiekt (`DpSize`), więc odczyt preferencji
 * kończy się `ClassCastException`, a przypięcie jest przerywane. Zwykły widżet
 * dodatkowo potrzebowałby grupy i planu z pamięci — podgląd tego nie wymaga.
 *
 * Miniatura nie zależy od rozmiaru: te same komponenty rysują nagłówek i listę
 * zajęć, więc w okienku przypinania widać prawdziwy układ widżetu. Kolory biorą
 * się z motywu aplikacji ([WidgetTheme]) — tak samo jak w docelowym widżecie,
 * żeby miniatura nie obiecywała innego wyglądu.
 */
internal class WeekWidgetPreview : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val night = WidgetNight.isNight(context)
        val colors = WidgetTheme.colors(PlanGraph.settings(context).styleId, night)
        provideContent {
            WidgetContent(
                model = WidgetPreview.weekModel(),
                look = WidgetLook.default,
                colors = colors,
            )
        }
    }
}

/** Odpowiednik [WeekWidgetPreview] dla widżetu „Dzień”. */
internal class DayWidgetPreview : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val night = WidgetNight.isNight(context)
        val colors = WidgetTheme.colors(PlanGraph.settings(context).styleId, night)
        provideContent {
            DayWidgetContent(
                model = WidgetPreview.dayModel(),
                look = WidgetLook.default,
                colors = colors,
            )
        }
    }
}
