package pl.matiit.planzajec

import android.graphics.Color as AndroidColor
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import pl.matiit.planzajec.data.PlanGraph
import pl.matiit.planzajec.ui.PlanViewModel
import pl.matiit.planzajec.ui.ScheduleApp
import pl.matiit.planzajec.ui.theme.PlanTheme
import pl.matiit.planzajec.ui.theme.StyleCatalog
import pl.matiit.planzajec.ui.theme.SystemBarsEffect
import pl.matiit.planzajec.widget.WidgetUpdater
import pl.matiit.planzajec.work.RefreshScheduler
import pl.matiit.planzajec.work.UpdateScheduler

class MainActivity : ComponentActivity() {

    private val viewModel: PlanViewModel by viewModels { PlanViewModel.Factory(applicationContext) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(AndroidColor.TRANSPARENT, AndroidColor.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(AndroidColor.TRANSPARENT, AndroidColor.TRANSPARENT),
        )
        RefreshScheduler.ensurePeriodic(applicationContext)
        UpdateScheduler.ensurePeriodic(applicationContext)

        // Licznik wejść (web/PWA/APK pod /licznik): jedno otwarcie = jedno
        // zdarzenie, wysyłane w tle z krótkim timeoutem.
        pl.matiit.planzajec.data.remote.VisitPing.pingOnce()

        // Sprawdzenie aktualizacji przy starcie: tanie `GET /api/app/latest`
        // (manifest to kilkaset bajtów) i najwyżej raz na 6 godzin.
        val updates = PlanGraph.updates(applicationContext)
        lifecycleScope.launch { updates.check() }

        setContent {
            val state by viewModel.state.collectAsStateWithLifecycle()
            val palette = StyleCatalog.palette(state.styleId, isSystemInDarkTheme())

            // Paski systemowe muszą pasować do wybranego stylu (jasne/ciemne ikony),
            // niezależnie od tego, czy system jest w trybie nocnym.
            SystemBarsEffect(window, palette)

            PlanTheme(styleId = state.styleId) {
                ScheduleApp(viewModel, updates)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Wejście do aplikacji to najtańszy moment na odświeżenie widżetu.
        WidgetUpdater.requestUpdate(applicationContext, force = true)
    }
}
