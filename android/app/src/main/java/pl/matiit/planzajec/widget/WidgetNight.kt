package pl.matiit.planzajec.widget

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build

/**
 * Tryb nocny systemu dla widżetów.
 *
 * `context.resources.configuration` bywa nieaktualne, gdy proces aplikacji żyje
 * dłużej niż zmiana motywu systemowego (zwłaszcza po `createConfigurationContext`
 * w [pl.matiit.planzajec.PlanApplication]), dlatego na Androidzie 10+ pytamy
 * wprost `UiModeManager`. Na starszych wersjach zostaje konfiguracja zasobów.
 */
object WidgetNight {

    // MODE_NIGHT_AUTO/CUSTOM nie mówią, jaka jest bieżąca tonacja — dla nich
    // (i dla braku usługi) zostaje odczyt konfiguracji zasobów.
    @android.annotation.SuppressLint("SwitchIntDef")
    fun isNight(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val manager = context.getSystemService(UiModeManager::class.java)
            when (manager?.nightMode) {
                UiModeManager.MODE_NIGHT_YES -> return true
                UiModeManager.MODE_NIGHT_NO -> return false
            }
        }
        val mode = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        return mode == Configuration.UI_MODE_NIGHT_YES
    }
}
