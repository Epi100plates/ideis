package pl.matiit.planzajec.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import pl.matiit.planzajec.data.PlanGraph
import pl.matiit.planzajec.ui.theme.StyleCatalog

/**
 * Centralna aktualizacja obu widżetów (tydzień i dzień). Kluczowa optymalizacja:
 * fingerprint treści **i wyglądu** porównywany z zapisanym per instancja — jeśli
 * nic się nie zmieniło, nie dotykamy RemoteViews (launcher nie przerysowuje
 * widoku, brak zużycia baterii).
 */
object WidgetUpdater {

    /**
     * Serializuje aktualizacje — dwa równoległe wywołania mogłyby narysować
     * starszą grupę po nowszej i zostawić widżet w niespójnym stanie.
     */
    private val mutex = Mutex()

    fun requestUpdate(context: Context, force: Boolean = false) {
        val app = context.applicationContext
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            runCatching { updateIfChanged(app, force) }
        }
    }

    suspend fun updateIfChanged(context: Context, force: Boolean = false) = mutex.withLock {
        val app = context.applicationContext
        val repository = PlanGraph.repository(app)
        val target = repository.currentTarget()
        val group = target.groupId
        val stored = withContext(Dispatchers.IO) { repository.cachedPlan(target) }
        val settings = PlanGraph.settings(app)
        val today = LocalDate.now()
        val now = System.currentTimeMillis()
        val zone = ZoneId.systemDefault()

        val weekModel = WidgetModelBuilder.build(
            plan = stored?.plan,
            groupId = group,
            today = today,
            nowMillis = now,
            savedAtMillis = stored?.savedAtMillis,
            zone = zone,
        )
        val dayModel = DayWidgetModelBuilder.build(
            plan = stored?.plan,
            groupId = group,
            today = today,
            nowMillis = now,
            savedAtMillis = stored?.savedAtMillis,
            zone = zone,
        )
        val styleId = settings.styleId ?: StyleCatalog.DEFAULT_STYLE
        val night = WidgetNight.isNight(app)

        updateInstances(
            app = app,
            receiver = ScheduleWidgetReceiver::class.java,
            widget = ScheduleWidget(),
            kind = WidgetPrefs.KIND_WEEK,
            content = WidgetTheme.contentKey(today, styleId, night, weekModel.fingerprint()),
            styleId = styleId,
            night = night,
            today = today,
            force = force,
        )
        updateInstances(
            app = app,
            receiver = DayScheduleWidgetReceiver::class.java,
            widget = DayScheduleWidget(),
            kind = WidgetPrefs.KIND_DAY,
            content = WidgetTheme.contentKey(today, styleId, night, dayModel.fingerprint()),
            styleId = styleId,
            night = night,
            today = today,
            force = force,
        )
        Unit
    }

    /**
     * Rysuje instancje po identyfikatorach z systemu. `GlanceAppWidget.updateAll`
     * opiera się na wewnętrznym rejestrze odbiorników, który bywa pusty po
     * instalacji — wtedy aktualizacja jest cichym no-op.
     */
    private suspend fun updateInstances(
        app: Context,
        receiver: Class<out AppWidgetProvider>,
        widget: GlanceAppWidget,
        kind: String,
        content: String,
        styleId: String,
        night: Boolean,
        today: LocalDate,
        force: Boolean,
    ) {
        val ids = AppWidgetManager.getInstance(app)
            .getAppWidgetIds(ComponentName(app, receiver))
        if (ids.isEmpty()) return

        val manager = GlanceAppWidgetManager(app)
        ids.forEach { id ->
            // Wygląd jest częścią fingerprintu: zmiana wariantu musi przerysować
            // widżet, nawet gdy plan i motyw się nie zmieniły.
            val look = WidgetPrefs.look(app, id)
                ?: WidgetLookStore.look(app, id)
                ?: WidgetLook.default
            val fingerprint = "${look.id}|$content"
            if (!force && WidgetPrefs.fingerprint(app, id, kind) == fingerprint) return@forEach

            // Motyw, tonacja i dzień w stanie Glance: zmiana unieważnia kompozycję,
            // więc widżet przemalowuje się i przelicza plan bez nowej sesji.
            runCatching { writeWidgetContext(app, id, styleId, night, today) }
            runCatching { widget.update(app, manager.getGlanceIdBy(id)) }
                .onSuccess { WidgetPrefs.setFingerprint(app, id, kind, fingerprint) }
                .onFailure {
                    // Bez udanej aktualizacji nie zapamiętujemy fingerprintu —
                    // następne wejście do aplikacji ponowi próbę.
                    WidgetPrefs.setFingerprint(app, id, kind, null)
                }
        }
    }
}

