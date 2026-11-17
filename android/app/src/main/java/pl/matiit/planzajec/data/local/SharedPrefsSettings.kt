package pl.matiit.planzajec.data.local

import android.content.Context
import androidx.core.content.edit
import pl.matiit.planzajec.domain.PlanSelection
import pl.matiit.planzajec.update.UpdateSettings

/**
 * Ustawienia w SharedPreferences: mały odczyt, brak zależności, synchroniczny start.
 *
 * Klasa obsługuje dwa interfejsy, bo oba dotyczą tych samych preferencji:
 * plan/wygląd ([PlanSettings]) i aktualizacje aplikacji ([UpdateSettings]).
 */
class SharedPrefsSettings(context: Context) : PlanSettings, UpdateSettings {

    private val prefs = context.getSharedPreferences("plan-settings", Context.MODE_PRIVATE)

    override var groupId: String?
        get() = prefs.getString(KEY_GROUP_ID, null)
        set(value) {
            prefs.edit { putString(KEY_GROUP_ID, value) }
        }

    /**
     * Grupy planu trzymamy jako jedną linię „21613+21614” — `SharedPreferences`
     * nie umie zapisać listy, a format jest ten sam co klucz wpisu planu.
     */
    override var planGroups: List<String>
        get() = prefs.getString(KEY_PLAN_GROUPS, null)
            ?.split('+')
            ?.filter { it.isNotBlank() }
            .orEmpty()
        set(value) {
            prefs.edit { putString(KEY_PLAN_GROUPS, value.joinToString("+")) }
        }

    /**
     * Wybór w pickerze trzymamy jako sześć osobnych kluczy: `SharedPreferences`
     * nie umie zapisać obiektu, a rozbicie na klucze pozwala dopisać wymiar
     * bez migracji starych zapisów (brakujący klucz = „dowolny”).
     */
    override var selection: PlanSelection
        get() = PlanSelection(
            nabor = prefs.getString(KEY_SEL_NABOR, null) ?: PlanSelection.ANY,
            field = prefs.getString(KEY_SEL_FIELD, null) ?: PlanSelection.ANY,
            spec = prefs.getString(KEY_SEL_SPEC, null) ?: PlanSelection.ANY,
            year = prefs.getString(KEY_SEL_YEAR, null) ?: PlanSelection.ANY,
            degree = prefs.getString(KEY_SEL_DEGREE, null) ?: PlanSelection.ANY,
            mode = prefs.getString(KEY_SEL_MODE, null) ?: PlanSelection.ANY,
            sem = prefs.getString(KEY_SEL_SEM, null) ?: PlanSelection.ANY,
        )
        set(value) {
            prefs.edit {
                putString(KEY_SEL_NABOR, value.nabor)
                putString(KEY_SEL_FIELD, value.field)
                putString(KEY_SEL_SPEC, value.spec)
                putString(KEY_SEL_YEAR, value.year)
                putString(KEY_SEL_DEGREE, value.degree)
                putString(KEY_SEL_MODE, value.mode)
                putString(KEY_SEL_SEM, value.sem)
            }
        }

    override var groupsFetchedAt: Long
        get() = prefs.getLong(KEY_GROUPS_FETCHED_AT, 0L)
        set(value) {
            prefs.edit { putLong(KEY_GROUPS_FETCHED_AT, value) }
        }

    override var styleId: String?
        get() = prefs.getString(KEY_STYLE_ID, null)
        set(value) {
            prefs.edit { putString(KEY_STYLE_ID, value) }
        }

    override var hasChosenGroup: Boolean
        get() = prefs.getBoolean(KEY_HAS_CHOSEN_GROUP, false)
        set(value) {
            prefs.edit { putBoolean(KEY_HAS_CHOSEN_GROUP, value) }
        }

    override var whatsNewSeenVersion: Int
        get() = prefs.getInt(KEY_WHATS_NEW_SEEN, 0)
        set(value) {
            prefs.edit { putInt(KEY_WHATS_NEW_SEEN, value) }
        }

    override fun checkedAt(key: String): Long = prefs.getLong(KEY_CHECKED_PREFIX + key, 0L)

    override fun setCheckedAt(key: String, millis: Long) {
        prefs.edit { putLong(KEY_CHECKED_PREFIX + key, millis) }
    }

    /** Domyślnie sprawdzamy i pobieramy w tle — aplikacja nie jest w sklepie. */
    override var updatesAutoCheck: Boolean
        get() = prefs.getBoolean(KEY_UPDATES_AUTO_CHECK, true)
        set(value) {
            prefs.edit { putBoolean(KEY_UPDATES_AUTO_CHECK, value) }
        }

    override var updatesAutoDownload: Boolean
        get() = prefs.getBoolean(KEY_UPDATES_AUTO_DOWNLOAD, true)
        set(value) {
            prefs.edit { putBoolean(KEY_UPDATES_AUTO_DOWNLOAD, value) }
        }

    override var updatesSkippedVersion: Int
        get() = prefs.getInt(KEY_UPDATES_SKIPPED, 0)
        set(value) {
            prefs.edit { putInt(KEY_UPDATES_SKIPPED, value) }
        }

    override var updatesLastCheckAt: Long
        get() = prefs.getLong(KEY_UPDATES_LAST_CHECK, 0L)
        set(value) {
            prefs.edit { putLong(KEY_UPDATES_LAST_CHECK, value) }
        }

    override var updatesLastPromptAt: Long
        get() = prefs.getLong(KEY_UPDATES_LAST_PROMPT, 0L)
        set(value) {
            prefs.edit { putLong(KEY_UPDATES_LAST_PROMPT, value) }
        }

    override var updatesLastPromptVersion: Int
        get() = prefs.getInt(KEY_UPDATES_LAST_PROMPT_VERSION, 0)
        set(value) {
            prefs.edit { putInt(KEY_UPDATES_LAST_PROMPT_VERSION, value) }
        }

    override var updatesLatest: String?
        get() = prefs.getString(KEY_UPDATES_LATEST, null)
        set(value) {
            prefs.edit { putString(KEY_UPDATES_LATEST, value) }
        }

    private companion object {
        const val KEY_GROUP_ID = "group-id"
        const val KEY_PLAN_GROUPS = "plan-groups"
        const val KEY_SEL_NABOR = "selection-nabor"
        const val KEY_SEL_FIELD = "selection-field"
        const val KEY_SEL_SPEC = "selection-spec"
        const val KEY_SEL_YEAR = "selection-year"
        const val KEY_SEL_DEGREE = "selection-degree"
        const val KEY_SEL_MODE = "selection-mode"
        const val KEY_SEL_SEM = "selection-sem"
        const val KEY_GROUPS_FETCHED_AT = "groups-fetched-at"
        const val KEY_STYLE_ID = "style-id"
        const val KEY_HAS_CHOSEN_GROUP = "has-chosen-group"
        const val KEY_WHATS_NEW_SEEN = "whats-new-seen-version"
        const val KEY_CHECKED_PREFIX = "checked-at:"
        const val KEY_UPDATES_AUTO_CHECK = "updates-auto-check"
        const val KEY_UPDATES_AUTO_DOWNLOAD = "updates-auto-download"
        const val KEY_UPDATES_SKIPPED = "updates-skipped-version"
        const val KEY_UPDATES_LAST_CHECK = "updates-last-check-at"
        const val KEY_UPDATES_LAST_PROMPT = "updates-last-prompt-at"
        const val KEY_UPDATES_LAST_PROMPT_VERSION = "updates-last-prompt-version"
        const val KEY_UPDATES_LATEST = "updates-latest"
    }
}
