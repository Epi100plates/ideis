package pl.matiit.planzajec.widget

import android.content.Context
import androidx.core.content.edit

/**
 * Odciski treści **dla konkretnych instancji** widżetu.
 *
 * Trzymamy je poza Glance, bo służą wyłącznie do pomijania zbędnych aktualizacji:
 * dwie kopie widżetu mogą mieć różny wygląd i inną grupę, więc wspólny
 * fingerprint gubiłby zmianę jednej z nich.
 */
internal object WidgetPrefs {

    private const val FILE = "widget_state"
    internal const val KIND_WEEK = "week"
    internal const val KIND_DAY = "day"

    fun fingerprint(context: Context, appWidgetId: Int, kind: String): String? =
        prefs(context).getString(fingerprintKey(appWidgetId, kind), null)

    fun setFingerprint(context: Context, appWidgetId: Int, kind: String, value: String?) {
        if (appWidgetId <= 0) return
        val key = fingerprintKey(appWidgetId, kind)
        prefs(context).edit {
            if (value == null) remove(key) else putString(key, value)
        }
    }

    /**
     * Wybrany wygląd kopii. To jest źródło prawdy: trafia też do stanu Glance
     * (potrzebnego do przerysowania widżetu), ale czytanie z SharedPreferences
     * jest natychmiastowe i nie koliduje z sesją widżetu.
     */
    fun look(context: Context, appWidgetId: Int): WidgetLook? =
        prefs(context).getString(lookKey(appWidgetId), null)?.let(WidgetLook::fromId)

    fun setLook(context: Context, appWidgetId: Int, look: WidgetLook) {
        if (appWidgetId <= 0) return
        prefs(context).edit { putString(lookKey(appWidgetId), look.id) }
    }

    fun forget(context: Context, appWidgetIds: IntArray) {
        if (appWidgetIds.isEmpty()) return
        prefs(context).edit {
            appWidgetIds.forEach { id ->
                remove(fingerprintKey(id, KIND_WEEK))
                remove(fingerprintKey(id, KIND_DAY))
                remove(lookKey(id))
            }
        }
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    private fun fingerprintKey(appWidgetId: Int, kind: String) = "fp_${kind}_$appWidgetId"

    private fun lookKey(appWidgetId: Int) = "look_$appWidgetId"
}
