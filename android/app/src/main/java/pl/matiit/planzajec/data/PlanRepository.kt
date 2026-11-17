package pl.matiit.planzajec.data

import java.io.IOException
import pl.matiit.planzajec.core.PlanConfig
import pl.matiit.planzajec.data.local.PlanSettings
import pl.matiit.planzajec.data.local.PlanStorage
import pl.matiit.planzajec.data.local.StoredGroups
import pl.matiit.planzajec.data.local.StoredPlan
import pl.matiit.planzajec.data.remote.PlanRemote
import pl.matiit.planzajec.data.model.KierunkiDto
import pl.matiit.planzajec.data.model.PlanVersionDto
import pl.matiit.planzajec.data.model.SpecjalnosciDto
import pl.matiit.planzajec.data.model.TrybyDto
import pl.matiit.planzajec.data.model.VersionDto
import pl.matiit.planzajec.domain.AcademicYear
import pl.matiit.planzajec.domain.PlanSelection

/**
 * Czy plan w pamięci to ta sama treść, którą ma serwer?
 *
 * Porównujemy **odcisk treści**, nie numer wersji: numer jest licznikiem
 * w pamięci serwera, więc po jego restarcie wraca do #1 i klient ze starym
 * planem uznawałby go za aktualny już na zawsze. Starsze serwery nie znają
 * odcisku — dla nich zostaje porównanie po `fetchedAt` (czas pobrania zmienia
 * się dokładnie razem z treścią), a na końcu po numerze.
 */
internal fun samePlanVersion(cached: PlanVersionDto?, remote: VersionDto?): Boolean {
    if (remote == null) return false
    val remotePrint = remote.currentFingerprint
    val cachedPrint = cached?.fingerprint
    if (remotePrint != null && cachedPrint != null) return remotePrint == cachedPrint
    val remoteFetchedAt = remote.currentFetchedAt
    val cachedFetchedAt = cached?.fetchedAt
    if (remoteFetchedAt != null && cachedFetchedAt != null) return remoteFetchedAt == cachedFetchedAt
    val remoteId = remote.currentId
    return remoteId != null && cached?.id == remoteId
}

/** Wynik odświeżenia planu — UI rozróżnia „nowy”, „ten sam”, „offline”. */
sealed interface RefreshOutcome {
    val stored: StoredPlan?

    data class Updated(override val stored: StoredPlan) : RefreshOutcome
    data class NotModified(override val stored: StoredPlan?) : RefreshOutcome
    data class Cached(override val stored: StoredPlan) : RefreshOutcome
    data class Offline(override val stored: StoredPlan) : RefreshOutcome
    data class Failed(val message: String) : RefreshOutcome {
        override val stored: StoredPlan? = null
    }
}

/**
 * Sedno logiki danych: najpierw tani `GET /api/version`, a pełny plan pobieramy
 * tylko wtedy, gdy wersja na serwerze naprawdę się zmieniła. Dzięki temu
 * odświeżanie w tle nie ściąga ~250 kB przy każdym uruchomieniu.
 *
 * Wpis planu to [PlanTarget] (grupa + rok akademicki), bo ten sam numer grupy
 * ma inny plan w każdym naborze.
 */
class PlanRepository(
    private val remote: PlanRemote,
    private val storage: PlanStorage,
    private val settings: PlanSettings,
    private val clock: () -> Long = System::currentTimeMillis,
    private val currentAcademicYear: () -> Int = { AcademicYear.currentStart() },
) {

    fun currentGroup(): String = settings.groupId ?: PlanConfig.DEFAULT_GROUP

    /** Grupy planu: pierwsza to wykład (baza), reszta — ćwiczenia/laby/lektorat. */
    fun currentPlanGroups(): List<String> =
        settings.planGroups.ifEmpty { listOf(currentGroup()) }

    /** Wybór w pickerze (nabór, kierunek, specjalność, rok, typ, tryb). */
    fun currentSelection(): PlanSelection = settings.selection

    fun hasChosenGroup(): Boolean = settings.hasChosenGroup

    /** Co użytkownik ogląda: grupy + rok akademicki planu. */
    fun currentTarget(): PlanTarget = target(currentPlanGroups(), currentSelection())

    /**
     * Wybór planu: lista grup (baza + dodane) i wymiary, które ją opisują.
     * Numer grupy bez naboru nie wskazuje jednego konkretnego planu, więc
     * zapisujemy oba.
     */
    fun selectPlan(groups: List<String>, selection: PlanSelection) {
        val list = groups.filter { it.isNotBlank() }.ifEmpty { listOf(PlanConfig.DEFAULT_GROUP) }
        settings.planGroups = list
        settings.groupId = list.first()
        settings.selection = selection
        settings.hasChosenGroup = true
    }

    /** Wybór jednej grupy (ręczny numer, stare ekrany) — baza to ta grupa. */
    fun selectGroup(group: String, selection: PlanSelection) = selectPlan(listOf(group), selection)

    /** Grupy + rok akademicki: nabór 2024 i 2. rok → plan 2025/2026. */
    fun target(groups: List<String>, selection: PlanSelection): PlanTarget =
        PlanTarget(groups.firstOrNull() ?: PlanConfig.DEFAULT_GROUP, selection.academicYear(), groups)

    fun target(group: String, selection: PlanSelection): PlanTarget = target(listOf(group), selection)

    /** Wybrany styl (null = domyślny Liquid Glass 2 ciemny, jak w wersji web). */
    fun currentStyle(): String? = settings.styleId

    fun selectStyle(styleId: String) {
        settings.styleId = styleId
    }

    /** Wersja, dla której użytkownik widział już ekran „Co nowego” (0 = nigdy). */
    fun whatsNewSeenVersion(): Int = settings.whatsNewSeenVersion

    fun markWhatsNewSeen(versionCode: Int) {
        settings.whatsNewSeenVersion = versionCode
    }

    fun cachedPlan(target: PlanTarget = currentTarget()): StoredPlan? {
        val key = target.key(currentAcademicYear())
        return runCatching { storage.readPlan(key) }.getOrNull()?.let { plan ->
            plan.copy(savedAtMillis = maxOf(plan.savedAtMillis, settings.checkedAt(key)))
        }
    }

    suspend fun refresh(
        target: PlanTarget = currentTarget(),
        force: Boolean = false,
    ): RefreshOutcome {
        val now = clock()
        val key = target.key(currentAcademicYear())
        val cached = cachedPlan(target)

        if (!force && cached != null && now - cached.savedAtMillis < PlanConfig.FOREGROUND_FRESH_MS) {
            return RefreshOutcome.Cached(cached)
        }

        val remoteVersion = try {
            remote.version(target)
        } catch (e: IOException) {
            null
        }

        if (samePlanVersion(cached?.plan?.version, remoteVersion) && cached != null) {
            settings.setCheckedAt(key, now)
            return RefreshOutcome.NotModified(cached.copy(savedAtMillis = now))
        }

        return try {
            val plan = remote.plan(target)
            if (!plan.ok) {
                if (cached != null) {
                    RefreshOutcome.Offline(cached)
                } else {
                    RefreshOutcome.Failed(plan.error ?: "Nieprawidłowa odpowiedź API")
                }
            } else {
                // Cache jest tylko optymalizacją: błąd dysku nie może wywalić UI.
                runCatching { storage.writePlan(key, plan) }
                settings.setCheckedAt(key, now)
                RefreshOutcome.Updated(StoredPlan(plan, now))
            }
        } catch (e: IOException) {
            if (cached != null) {
                RefreshOutcome.Offline(cached)
            } else {
                RefreshOutcome.Failed(e.message ?: "Błąd sieci")
            }
        }
    }

    /**
     * Tani test „czy treść planu się zmieniła” — pyta tylko `/api/version`.
     *
     * `true` = brak cache (trzeba pobrać) albo inna treść; `false` = ta sama
     * wersja **albo brak sieci**. Błąd sieci nie może udawać zmiany, bo
     * `force = true` (czyli `POST /api/refresh`) dotyka harmonogramu uczelni
     * i jest po jego stronie throttlowany.
     */
    suspend fun planChanged(target: PlanTarget = currentTarget()): Boolean {
        val known = cachedPlan(target)?.plan?.version ?: return true
        val remoteVersion = runCatching { remote.version(target) }.getOrNull() ?: return false
        return !samePlanVersion(known, remoteVersion)
    }

    /** Katalog grup: cache 24 h, a przy błędzie sieci wracamy do ostatniego znanego. */
    suspend fun groups(force: Boolean = false): StoredGroups? {
        val now = clock()
        val cached = runCatching { storage.readGroups() }.getOrNull()
        if (!force && cached != null && now - cached.savedAtMillis < PlanConfig.GROUPS_TTL_MS) {
            return cached
        }
        return try {
            val dto = remote.groups()
            if (!dto.ok || dto.groups.isEmpty()) {
                cached
            } else {
                runCatching { storage.writeGroups(dto) }
                settings.groupsFetchedAt = now
                StoredGroups(dto, now)
            }
        } catch (e: IOException) {
            cached
        }
    }

    /** Kierunki z formularza uczelni — lista jest mała i cache'owana po stronie serwera. */
    suspend fun kierunki(): KierunkiDto = remote.kierunki()

    /** Specjalności kierunku w roczniku (oferta uczelni + starsze nazwy z katalogu). */
    suspend fun specjalnosci(kierunekId: String, nabor: String = ""): SpecjalnosciDto =
        remote.specjalnosci(kierunekId, nabor)

    /** Tryby studiów, które mają grupy w wyborze. */
    suspend fun tryby(kierunekId: String, nabor: String, spec: String): TrybyDto =
        remote.tryby(kierunekId, nabor, spec)
}
