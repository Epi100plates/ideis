package pl.matiit.planzajec.widget

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import java.time.LocalDate

/**
 * Wybrany wygląd widżetu trzymany w **stanie Glance** (per instancja).
 *
 * Własne SharedPreferences nie wystarczą: Glance buforuje kompozycję sesji
 * widżetu, więc zwykłe `update()` nie przerysowuje widoku po zmianie danych
 * czytanych spoza stanu Glance. Zapis do stanu unieważnia kompozycję i widżet
 * naprawdę zmienia wygląd od razu po zapisaniu w konfiguratorze.
 */
internal val WidgetLookKey = stringPreferencesKey("widget-look")

/** Tonacja dnia/nocy wyliczona przez [WidgetUpdater] (system bywa nieaktualny w kompozycji). */
internal val WidgetNightKey = booleanPreferencesKey("widget-night")

/**
 * Motyw aplikacji, dla którego zbudowano widok.
 *
 * Musi być w stanie, a nie czytany raz w `provideGlance`: Glance trzyma sesję
 * kompozycji, więc wartość złapana przy jej tworzeniu zostaje **stara** po
 * zmianie motywu w aplikacji (widżet przerysowywał się w poprzednich kolorach).
 */
internal val WidgetStyleKey = stringPreferencesKey("widget-style")

/**
 * Dzień, dla którego zbudowano widok (ISO). Zmiana daty unieważnia kompozycję,
 * więc widżet nie zostaje przy wczorajszym planie do restartu procesu.
 */
internal val WidgetTodayKey = stringPreferencesKey("widget-today")

internal fun Preferences.widgetLook(): WidgetLook = WidgetLook.fromId(this[WidgetLookKey])

/** Motyw aplikacji zapisany przy ostatniej aktualizacji (albo `null`). */
internal fun Preferences.widgetStyle(): String? = this[WidgetStyleKey]

internal fun Preferences.widgetToday(): LocalDate =
    this[WidgetTodayKey]?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: LocalDate.now()

internal suspend fun readWidgetLook(context: Context, appWidgetId: Int): WidgetLook {
    val glanceId = GlanceAppWidgetManager(context).getGlanceIdBy(appWidgetId)
    return getAppWidgetState(context, PreferencesGlanceStateDefinition, glanceId).widgetLook()
}

internal suspend fun writeWidgetLook(context: Context, appWidgetId: Int, look: WidgetLook) {
    val glanceId = GlanceAppWidgetManager(context).getGlanceIdBy(appWidgetId)
    updateAppWidgetState(context, glanceId) { prefs -> prefs[WidgetLookKey] = look.id }
}

/** Jednym zapisem: motyw, tonacja i dzień, dla którego policzono plan. */
internal suspend fun writeWidgetContext(
    context: Context,
    appWidgetId: Int,
    styleId: String,
    night: Boolean,
    today: LocalDate,
) {
    val glanceId = GlanceAppWidgetManager(context).getGlanceIdBy(appWidgetId)
    updateAppWidgetState(context, glanceId) { prefs ->
        prefs[WidgetStyleKey] = styleId
        prefs[WidgetNightKey] = night
        prefs[WidgetTodayKey] = today.toString()
    }
}
