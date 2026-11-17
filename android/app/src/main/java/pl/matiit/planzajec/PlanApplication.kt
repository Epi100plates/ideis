package pl.matiit.planzajec

import android.app.Application
import android.content.Context
import android.content.res.Configuration
import java.util.Locale
import pl.matiit.planzajec.widget.WidgetNight
import pl.matiit.planzajec.widget.WidgetUpdater

/**
 * Aplikacja jest polska z założenia (plan polskiej uczelni), więc wymuszamy
 * polskie reguły języka także na telefonie z innym ustawieniem systemu —
 * inaczej liczba mnoga w widżecie („3 zajęcia” vs „3 zajęć”) zależałaby od
 * języka launchera, a nie od języka treści.
 *
 * Druga rola: pilnowanie zmiany trybu jasny/ciemny w systemie. Widżety nie
 * dostają `ACTION_CONFIGURATION_CHANGED`, a tonacja jest zapisana w ich stanie,
 * więc bez tego przechwycenia widżet zostałby w starych kolorach do najbliższego
 * odświeżenia planu. Application jest jedynym komponentem, który tę zmianę
 * widzi bez otwierania ekranu aplikacji.
 */
class PlanApplication : Application() {

    /** Ostatnio widziana tonacja systemu; `null` przed pierwszym `onCreate`. */
    private var night: Boolean? = null

    override fun attachBaseContext(base: Context) {
        val configuration = Configuration(base.resources.configuration)
        configuration.setLocale(Locale.forLanguageTag("pl"))
        super.attachBaseContext(base.createConfigurationContext(configuration))
    }

    override fun onCreate() {
        super.onCreate()
        // `UiModeManager` (a nie konfiguracja zasobów), bo ta jest zamrożona przez
        // `createConfigurationContext` w [attachBaseContext].
        night = WidgetNight.isNight(this)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // `newConfig` jest świeży od systemu — inaczej niż zasoby aplikacji.
        val current = newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
            Configuration.UI_MODE_NIGHT_YES
        val previous = night
        night = current
        if (previous == null || previous == current) return
        WidgetUpdater.requestUpdate(this, force = true)
    }
}
