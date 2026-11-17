package pl.matiit.planzajec.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.GlanceAppWidgetManager

/**
 * Mostek między panelem ustawień a systemem widżetów.
 *
 * Powód istnienia: od Androida 14 część launcherów (Launcher3 i nakładki na
 * nim) nie uruchamia aktywności konfiguracji widżetu — system blokuje start
 * z PendingIntentu bez opt-inu po stronie nadawcy (BAL), a aplikacja nie ma
 * wpływu na ten intent. Dlatego dodawanie i zmianę wyglądu wystawiamy też
 * z aplikacji: przypięcie idzie przez `requestPinGlanceAppWidget`, a edycję
 * robi ten sam konfigurator uruchomiony z naszej, widocznej aktywności.
 */
object WidgetBridge {

    private const val TAG = "WidgetBridge"

    /**
     * Rozmiar podglądu w okienku przypinania — mniej więcej domyślny widżet
     * (4×3 komórki), więc miniatura pokazuje tyle wierszy, ile realnie widać.
     */
    private val PIN_SIZE = DpSize(250.dp, 150.dp)

    /** Widżety stojące teraz na pulpicie: najpierw tygodnie, potem dni. */
    suspend fun instances(context: Context): List<WidgetInstance> {
        val weekIds = ids(context, ScheduleWidgetReceiver::class.java)
        val dayIds = ids(context, DayScheduleWidgetReceiver::class.java)
        val looks = HashMap<Int, WidgetLook>()
        (weekIds + dayIds).forEach { id ->
            WidgetLookStore.look(context, id)?.let { looks[id] = it }
        }
        return WidgetInstances.build(weekIds, dayIds) { _, id -> looks[id] }
    }

    /**
     * Systemowe okno „dodać widżet?”. `false` oznacza, że launcher nie obsługuje
     * przypinania (albo użytkownik je odrzucił) — wtedy zostaje lista widżetów.
     */
    suspend fun pin(context: Context, kind: WidgetKind): Boolean = runCatching {
        val manager = GlanceAppWidgetManager(context)
        when (kind) {
            WidgetKind.WEEK -> manager.requestPinGlanceAppWidget(
                receiver = ScheduleWidgetReceiver::class.java,
                // Miniaturka nie może czytać stanu Glance — patrz WidgetPreviews.
                preview = WeekWidgetPreview(),
                previewState = PIN_SIZE,
            )

            WidgetKind.DAY -> manager.requestPinGlanceAppWidget(
                receiver = DayScheduleWidgetReceiver::class.java,
                preview = DayWidgetPreview(),
                previewState = PIN_SIZE,
            )
        }
    }.onFailure { Log.w(TAG, "Nie udało się przypiąć widżetu ${kind.id}", it) }
        .getOrDefault(false)

    /**
     * Konfigurator dla konkretnej kopii. Uruchamiamy go z ustawień, więc start
     * pochodzi z widocznej aktywności i nie łapie blokady BAL.
     */
    fun configureIntent(context: Context, appWidgetId: Int): Intent =
        Intent(context, WidgetConfigActivity::class.java)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)

    private fun ids(context: Context, receiver: Class<out AppWidgetProvider>): List<Int> =
        AppWidgetManager.getInstance(context)
            .getAppWidgetIds(ComponentName(context, receiver))
            .toList()
}
