package pl.matiit.planzajec.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import pl.matiit.planzajec.work.RefreshScheduler

class ScheduleWidgetReceiver : GlanceAppWidgetReceiver() {

    override val glanceAppWidget: GlanceAppWidget = ScheduleWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        RefreshScheduler.ensurePeriodic(context)
        // Pierwszy widżet: dociągamy plan, żeby kafel nie czekał na otwarcie
        // aplikacji ani na cykliczną pracę w tle.
        RefreshScheduler.refreshNow(context)
        WidgetUpdater.requestUpdate(context, force = true)
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        RefreshScheduler.ensurePeriodic(context)
        // System woła `onUpdate` także po zmianie konfiguracji (tryb nocny,
        // język) i cyklicznie (`updatePeriodMillis`). Rysujemy z cache —
        // bez wymuszonego przerysowania widżet zostałby w starej tonacji.
        // Sieci nie ruszamy: plan odświeża praca cykliczna i wejście do aplikacji.
        WidgetUpdater.requestUpdate(context, force = true)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        WidgetPrefs.forget(context, appWidgetIds)
    }
}
