package pl.matiit.planzajec.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import pl.matiit.planzajec.work.RefreshScheduler

class DayScheduleWidgetReceiver : GlanceAppWidgetReceiver() {

    override val glanceAppWidget: GlanceAppWidget = DayScheduleWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        RefreshScheduler.ensurePeriodic(context)
        // Jak w widżecie tygodnia: pierwszy kafel dociąga plan od razu.
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
        // Wymuszone przerysowanie z cache po zmianie konfiguracji i cyklicznie —
        // bez sieci, którą zajmuje się praca cykliczna (patrz `onEnabled`).
        WidgetUpdater.requestUpdate(context, force = true)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        WidgetPrefs.forget(context, appWidgetIds)
    }
}
