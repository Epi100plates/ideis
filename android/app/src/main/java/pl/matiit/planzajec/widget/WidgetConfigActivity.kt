package pl.matiit.planzajec.widget

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import pl.matiit.planzajec.data.PlanGraph
import pl.matiit.planzajec.ui.theme.CustomColors
import pl.matiit.planzajec.ui.theme.PlanTheme
import pl.matiit.planzajec.ui.theme.StyleCatalog
import pl.matiit.planzajec.ui.theme.SystemBarsEffect

/**
 * Konfigurator widżetu: launcher otwiera go przy dodawaniu (atrybut
 * `android:configure`) oraz przy „Edytuj” dla już dodanego widżetu
 * (`android:widgetFeatures="reconfigurable"`).
 *
 * Wybór zapisujemy w stanie Glance tej instancji i od razu ją przerysowujemy,
 * więc zmiana wyglądu nie czeka na kolejne odświeżenie planu.
 */
class WidgetConfigActivity : ComponentActivity() {

    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        appWidgetId = intent?.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        Log.i(TAG, "Konfigurator widżetu, appWidgetId=$appWidgetId")

        // Anulowanie (przycisk wstecz) nie może dodać widżetu do pulpitu.
        setResult(RESULT_CANCELED)
        enableEdgeToEdge()

        setContent {
            val settings = PlanGraph.settings(applicationContext)
            val styleId = settings.styleId
            // Motyw własny: konfigurator ma wyglądać tak samo jak widżet.
            val custom = CustomColors.normalize(settings.customPrimary, settings.customBackground)
            val palette = StyleCatalog.palette(styleId, isSystemInDarkTheme(), custom)
            SystemBarsEffect(window, palette)

            // Wygląd trzymamy w SharedPreferences, więc zwykle znamy go od razu
            // i ekran nie miga tłem. Stan Glance czytamy tylko dla kopii
            // dodanych starszą wersją aplikacji (jednorazowa migracja).
            var initial by remember {
                mutableStateOf(WidgetPrefs.look(applicationContext, appWidgetId))
            }
            LaunchedEffect(appWidgetId) {
                if (initial != null) return@LaunchedEffect
                initial = if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
                    WidgetLook.default
                } else {
                    WidgetLookStore.look(applicationContext, appWidgetId) ?: WidgetLook.default
                }
            }

            PlanTheme(styleId = styleId, customColors = custom) {
                val start = initial
                if (start == null) {
                    // Odczyt stanu widżetu jest asynchroniczny (DataStore) —
                    // chwila na tło zamiast migającego domyślnego wyboru.
                    Box(Modifier.fillMaxSize().background(palette.page))
                } else {
                    WidgetConfigScreen(
                        initial = start,
                        onConfirm = ::save,
                        onCancel = { finish() },
                    )
                }
            }
        }
    }

    private fun save(look: WidgetLook) {
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }
        lifecycleScope.launch {
            // Najpierw pamięć wyboru (źródło prawdy), potem stan Glance, którego
            // zapis unieważnia kompozycję widżetu i przerysowuje go od razu.
            WidgetPrefs.setLook(applicationContext, appWidgetId, look)
            runCatching { writeWidgetLook(applicationContext, appWidgetId, look) }
            WidgetUpdater.requestUpdate(applicationContext, force = true)
            refreshWidget()
            setResult(
                RESULT_OK,
                Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId),
            )
            finish()
        }
    }

    /** Standardowy broadcast systemowy do odbiornika tego widżetu. */
    private fun refreshWidget() {
        val manager = AppWidgetManager.getInstance(applicationContext)
        val provider = manager.getAppWidgetInfo(appWidgetId)?.provider ?: return
        applicationContext.sendBroadcast(
            Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
                component = provider
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(appWidgetId))
            },
        )
    }

    private companion object {
        private const val TAG = "WidgetConfig"
    }
}
