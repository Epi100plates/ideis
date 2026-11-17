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
import pl.matiit.planzajec.core.PlanJson
import pl.matiit.planzajec.data.local.StoredNotes
import pl.matiit.planzajec.ui.theme.CustomColors

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

/**
 * Dwa kolory motywu „Własny” w stanie widżetu.
 *
 * Bez nich zmiana samej barwy (bez zmiany `styleId`) nie przerysowywałaby
 * widżetu: kompozycja Glance trzyma wartości złapane przy jej utworzeniu.
 */
internal val WidgetCustomPrimaryKey = stringPreferencesKey("widget-custom-primary")
internal val WidgetCustomBackgroundKey = stringPreferencesKey("widget-custom-background")

/**
 * Notatki na kafelkach (`id zajęć → tekst`, JSON) w stanie widżetu.
 *
 * Notatki przychodzą z serwera i zmieniają się niezależnie od planu — tak samo
 * jak motyw muszą więc siedzieć w stanie, inaczej widżet pokazywałby plakietki
 * z chwili utworzenia sesji kompozycji.
 */
internal val WidgetNotesKey = stringPreferencesKey("widget-notes")

internal fun Preferences.widgetLook(): WidgetLook = WidgetLook.fromId(this[WidgetLookKey])

/** Motyw aplikacji zapisany przy ostatniej aktualizacji (albo `null`). */
internal fun Preferences.widgetStyle(): String? = this[WidgetStyleKey]

/** Kolory motywu własnego; brak zapisu = [fallback] z ustawień aplikacji. */
internal fun Preferences.widgetCustomColors(fallback: CustomColors): CustomColors {
    if (this[WidgetCustomPrimaryKey] == null && this[WidgetCustomBackgroundKey] == null) return fallback
    return CustomColors.normalize(this[WidgetCustomPrimaryKey], this[WidgetCustomBackgroundKey])
}

/** Notatki z ostatniej aktualizacji widżetu; brak zapisu = kopia z dysku. */
internal fun Preferences.widgetNotes(fallback: Map<String, String>): Map<String, String> {
    val raw = this[WidgetNotesKey] ?: return fallback
    return decodeWidgetNotes(raw)
}

/** Notatki jako JSON — jedna wartość w stanie Glance (mapy nie da się zapisać wprost). */
internal fun encodeWidgetNotes(notes: Map<String, String>): String =
    PlanJson.encodeToString(StoredNotes.serializer(), StoredNotes(notes))

internal fun decodeWidgetNotes(text: String): Map<String, String> =
    runCatching { PlanJson.decodeFromString(StoredNotes.serializer(), text) }
        .getOrNull()
        ?.notes
        .orEmpty()

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

/** Jednym zapisem: motyw, tonacja, dzień, kolory motywu własnego i notatki. */
internal suspend fun writeWidgetContext(
    context: Context,
    appWidgetId: Int,
    styleId: String,
    night: Boolean,
    today: LocalDate,
    custom: CustomColors = CustomColors.DEFAULT,
    notes: Map<String, String> = emptyMap(),
) {
    val glanceId = GlanceAppWidgetManager(context).getGlanceIdBy(appWidgetId)
    updateAppWidgetState(context, glanceId) { prefs ->
        prefs[WidgetStyleKey] = styleId
        prefs[WidgetNightKey] = night
        prefs[WidgetTodayKey] = today.toString()
        prefs[WidgetCustomPrimaryKey] = custom.primary
        prefs[WidgetCustomBackgroundKey] = custom.background
        prefs[WidgetNotesKey] = encodeWidgetNotes(notes)
    }
}
