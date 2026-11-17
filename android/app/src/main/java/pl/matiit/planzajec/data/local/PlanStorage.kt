package pl.matiit.planzajec.data.local

import pl.matiit.planzajec.data.model.GroupsDto
import pl.matiit.planzajec.data.model.PlanDto
import pl.matiit.planzajec.domain.PlanSelection

/** Plan zapisany na dysku wraz z czasem ostatniego potwierdzenia z sieci. */
data class StoredPlan(val plan: PlanDto, val savedAtMillis: Long)

data class StoredGroups(val groups: GroupsDto, val savedAtMillis: Long)

/**
 * Trwały magazyn planu. Interfejs pozwala podmienić dysk na pamięć w testach
 * i w przyszłości np. na Room.
 *
 * Klucz wpisu to `PlanTarget.key()` — „21188” (bieżący rok akademicki) albo
 * „21188@2025” (starszy nabór), więc plany różnych roczników się nie nadpisują.
 */
interface PlanStorage {
    fun readPlan(key: String): StoredPlan?
    fun writePlan(key: String, plan: PlanDto)
    fun readGroups(): StoredGroups?
    fun writeGroups(groups: GroupsDto)
}

/** Ustawienia użytkownika i znaczniki czasu niezależne od pliku planu. */
interface PlanSettings {
    var groupId: String?

    /** Grupy planu: pierwsza to wykład (baza), reszta — ćwiczenia/laby/lektorat. */
    var planGroups: List<String>

    /** Wybór w pickerze: nabór, kierunek, specjalność, rok, typ, tryb, semestr. */
    var selection: PlanSelection

    var groupsFetchedAt: Long
    var styleId: String?

    /**
     * Dwa kolory motywu „Własny” (`#RRGGBB`). Trzymamy je osobno od `styleId`,
     * bo wybór motywu i jego barwy zmieniają się niezależnie — a widżet musi
     * umieć narysować paletę bez uruchamiania aplikacji.
     */
    var customPrimary: String?
    var customBackground: String?
    var hasChosenGroup: Boolean

    /** Ostatnia wersja, dla której pokazano ekran „Co nowego” (0 = jeszcze nigdy). */
    var whatsNewSeenVersion: Int
    fun checkedAt(key: String): Long
    fun setCheckedAt(key: String, millis: Long)
}
