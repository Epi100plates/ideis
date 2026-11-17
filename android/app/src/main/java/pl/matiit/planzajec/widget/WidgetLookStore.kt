package pl.matiit.planzajec.widget

import android.content.Context
import android.util.Log

/**
 * Odczyt wyglądu konkretnej kopii widżetu.
 *
 * Źródłem prawdy są SharedPreferences ([WidgetPrefs]): odczyt jest natychmiastowy
 * i niezależny od sesji widżetu. Stan Glance czytamy tylko raz — dla kopii
 * dodanych przed wprowadzeniem tej pamięci (migracja) — i od razu go tam
 * zapisujemy.
 *
 * Powód: wcześniej każdy odczyt tworzył DataStore na ten sam plik stanu.
 * Dwa równoległe odczyty (panel ustawień + konfigurator otwierany z niego)
 * potrafiły się wywrócić, a że wynik owijaliśmy w `runCatching`, ekran po cichu
 * pokazywał domyślny wariant zamiast zapisanego — i „Gotowe” nadpisywało wygląd.
 */
internal object WidgetLookStore {

    private const val TAG = "WidgetLookStore"

    /** Zapisany wygląd kopii albo `null`, jeśli nic nie wybrano. */
    suspend fun look(context: Context, appWidgetId: Int): WidgetLook? {
        WidgetPrefs.look(context, appWidgetId)?.let { return it }
        val stored = runCatching { readWidgetLook(context, appWidgetId) }
            .onFailure { Log.w(TAG, "Nie udało się odczytać wyglądu widżetu $appWidgetId", it) }
            .getOrNull()
            ?: return null
        WidgetPrefs.setLook(context, appWidgetId, stored)
        return stored
    }
}
