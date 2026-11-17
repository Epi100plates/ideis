package pl.matiit.planzajec.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import pl.matiit.planzajec.BuildConfig
import pl.matiit.planzajec.core.PlanConfig
import pl.matiit.planzajec.data.AttachmentsRepository
import pl.matiit.planzajec.data.FeedbackRepository
import pl.matiit.planzajec.data.NotesRepository
import pl.matiit.planzajec.data.PlanGraph
import pl.matiit.planzajec.data.PlanRepository
import pl.matiit.planzajec.data.PlanTarget
import pl.matiit.planzajec.data.RefreshOutcome
import pl.matiit.planzajec.data.local.StoredPlan
import pl.matiit.planzajec.data.model.CohortDto
import pl.matiit.planzajec.data.model.FeedbackPayload
import pl.matiit.planzajec.data.model.GroupDto
import pl.matiit.planzajec.data.model.SelectionItemDto
import pl.matiit.planzajec.data.model.TrybDto
import pl.matiit.planzajec.domain.AcademicYear
import pl.matiit.planzajec.domain.ClassSlot
import pl.matiit.planzajec.domain.Format
import pl.matiit.planzajec.domain.NoteText
import pl.matiit.planzajec.domain.PickerSteps
import pl.matiit.planzajec.domain.PlanSelection
import pl.matiit.planzajec.domain.PlanSelectionLogic
import pl.matiit.planzajec.domain.PlanWizard
import pl.matiit.planzajec.domain.ReleaseNotes
import pl.matiit.planzajec.domain.ScheduleMapper
import pl.matiit.planzajec.domain.ScheduleViewMode
import pl.matiit.planzajec.domain.SelectionLabels
import pl.matiit.planzajec.domain.WhatsNew
import pl.matiit.planzajec.domain.toSelection
import pl.matiit.planzajec.ui.settings.FeedbackKind
import pl.matiit.planzajec.ui.selection.SiteLabels
import pl.matiit.planzajec.ui.selection.WizardContext
import pl.matiit.planzajec.ui.theme.StyleCatalog
import pl.matiit.planzajec.widget.WidgetUpdater

data class PlanUiState(
    val groupId: String = PlanConfig.DEFAULT_GROUP,
    /** Grupy planu: pierwsza to wykład (baza), reszta — ćwiczenia/laby/lektorat. */
    val planGroups: List<String> = emptyList(),
    val groupName: String? = null,
    val groups: List<GroupDto> = emptyList(),
    /** Wybór w pickerze: nabór, kierunek, specjalność, rok, typ studiów, tryb, semestr. */
    val selection: PlanSelection = PlanConfig.DEFAULT_SELECTION,

    /**
     * Wybór, który opisuje **wczytany** plan (ten sam, co w ustawieniach).
     * Picker zmienia [selection], a karta „Plan” i lista „Dodaj grupy” muszą
     * mówić o planie, nie o szkicu — inaczej po zamknięciu Opcji w połowie
     * wyboru widać rocznik, którego plan nie dotyczy.
     */
    val appliedSelection: PlanSelection = PlanConfig.DEFAULT_SELECTION,
    /** Etykiety wyboru opisującego plan (kierunek/specjalność z formularza). */
    val appliedSite: SiteSelection = SiteSelection(),

    /** Wybór początkowy z serwera (`DEFAULT_*`) — używany, dopóki nic nie wybrano. */
    val defaults: PlanSelection? = null,

    /** Kierunki z formularza uczelni (stały wydział) — krok 1 kreatora. */
    val kierunki: List<SelectionItemDto> = emptyList(),
    /** Specjalności wybranego kierunku **w roczniku** — krok 3 kreatora. */
    val specjalnosci: List<SelectionItemDto> = emptyList(),
    /** Ile grup rocznika nie ma specjalności (podpis „Pomiń specjalność”). */
    val noSpecGroups: Int = 0,
    /** Tryby studiów, które mają grupy w wyborze — krok 4 kreatora. */
    val tryby: List<TrybDto> = emptyList(),
    /** Klucze cache list kreatora: „kierunek@rocznik” i „kierunek@rocznik@specjalność”. */
    val specsKey: String = "",
    val trybyKey: String = "",
    /** Litery wpisane w polu „Szukaj kierunku” (krok „Kierunek”). */
    val pickerQuery: String = "",
    val wizardLoading: Boolean = false,
    val wizardError: String? = null,
    val wizardWarning: String? = null,
    /** Etykiety wyboru z formularza (oficjalne nazwy do podpisu). */
    val site: SiteSelection = SiteSelection(),
    /** Bieżący rok akademicki serwera (np. 2026 dla 2026/2027) — do kreatora. */
    val academicYearStart: Int? = null,
    /** Grupa + rok akademicki planu, który jest na ekranie. */
    val target: PlanTarget = PlanTarget(PlanConfig.DEFAULT_GROUP),
    val slots: List<ClassSlot> = emptyList(),
    val savedAtMillis: Long = 0L,
    val today: LocalDate = LocalDate.now(),
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val offline: Boolean = false,
    val error: String? = null,
    val styleId: String = StyleCatalog.DEFAULT_STYLE,
    val viewMode: ScheduleViewMode = ScheduleViewMode.default,
    val needsGroupSelection: Boolean = false,
    /** Identyfikatory zajęć, do których są materiały — do ikony spinacza. */
    val classesWithAttachments: Set<String> = emptySet(),
    /**
     * Notatki na kafelkach: identyfikator zajęć → tekst („Kolos”, „Egzamin”).
     * Notatka jest wspólna dla wszystkich, więc przychodzi z serwera, a nie
     * z pamięci urządzenia.
     */
    val notes: Map<String, String> = emptyMap(),
    /** Pytanie „Dodaj swoje grupy / Pomiń” po pierwszej konfiguracji planu. */
    val showAddGroupsPrompt: Boolean = false,
    /** Wydania do pokazania w „Co nowego” (puste, gdy już widziane). */
    val whatsNew: List<ReleaseNotes> = emptyList(),
) {
    /** Grupy pasujące do wyboru — to, co widać na liście w pickerze. */
    val matchingGroups: List<GroupDto>
        get() = if (groups.isEmpty()) emptyList() else PlanSelectionLogic.filter(groups, selection)

    /** Plany bazowe (grupy wykładowe) dla bieżącego wyboru — krok „plan”. */
    val planCandidates: List<GroupDto>
        get() = if (groups.isEmpty()) emptyList() else PlanWizard.planStep(groups, selection).second

    /** Wybór po korekcie kroku „plan” (bez semestru, gdy ten jest pusty). */
    val preparedSelection: PlanSelection
        get() = if (groups.isEmpty()) selection else PlanWizard.planStep(groups, selection).first

    /** Grupy, które można dodać do planu (wykłady są wliczone automatycznie). */
    val addableGroups: List<GroupDto>
        get() = if (groups.isEmpty()) {
            emptyList()
        } else {
            PlanWizard.addableGroups(groups, appliedSelection, planGroups)
        }

    /**
     * Roczniki wybranego kierunku — z listy `/api/ideis/kierunki`. Liczy je
     * serwer, więc aplikacja nie zgaduje, który rocznik ma jeszcze grupy.
     */
    val cohorts: List<CohortDto>
        get() = kierunki.firstOrNull { it.id == site.kierunekId }?.nabory.orEmpty()

    /**
     * Podpis planu: kod grupy bazowej z katalogu + licznik dodanych grup.
     * `groupName` z planu jest przy scalonym planie sklejeniem nazw („A + B”),
     * więc nie nadaje się do nagłówka.
     */
    val planLabel: String
        get() {
            val baseId = planGroups.firstOrNull() ?: groupId
            val base = groups.firstOrNull { it.id == baseId }
            val name = base?.code
                ?: groupName?.let { Format.shortGroupName(it) }
                ?: "grupa $baseId"
            val extra = (planGroups.size - 1).coerceAtLeast(0)
            return if (extra > 0) "$name +$extra" else name
        }
}

/** Opis wyboru z formularza uczelni (nazwy oficjalne, nie skróty katalogu). */
data class SiteSelection(
    val kierunekId: String = "",
    val kierunekLabel: String = "",
    val specId: String = "",
    val specLabel: String = "",
    val specSkipped: Boolean = false,
)

/**
 * Kierunek bywa znany tylko z nazwy (`selection.field` z domyślnych serwera).
 * Dopasowanie po nazwie daje `kierunekId`, którego wymagają endpointy
 * `/api/ideis/specjalnosci` i `/api/ideis/tryby` — bez niego kroki pickera były
 * puste, dopóki użytkownik nie kliknął „Kierunek”.
 */
private fun SiteSelection.withKierunek(
    items: List<SelectionItemDto>,
    selection: PlanSelection,
): SiteSelection {
    if (kierunekId.isNotBlank() || selection.field.isBlank()) return this
    val match = items.firstOrNull {
        it.label == selection.field || it.field == selection.field
    } ?: return this
    return copy(kierunekId = match.id, kierunekLabel = match.label)
}

/** Tryby studiów policzone z katalogu — zapas, gdy nie ma numeru kierunku. */
private fun catalogTryby(groups: List<GroupDto>, selection: PlanSelection): List<TrybDto> =
    PlanSelectionLogic.facets(groups, selection).mode
        .filterNotNull()
        .map { mode ->
            TrybDto(
                value = mode,
                groups = PlanSelectionLogic.filter(groups, selection.copy(mode = mode)).size,
            )
        }

/**
 * Stan ekranu → dane kreatora. Jedno miejsce mapowania zamiast kilkunastu
 * parametrów przekazywanych do ekranu powitalnego i do Opcji.
 */
fun PlanUiState.wizardContext(): WizardContext = WizardContext(
    selection = selection,
    site = SiteLabels(
        kierunekId = site.kierunekId,
        kierunekLabel = site.kierunekLabel,
        specId = site.specId,
        specLabel = site.specLabel,
    ),
    kierunki = kierunki,
    cohorts = cohorts,
    specjalnosci = specjalnosci,
    noSpecGroups = noSpecGroups,
    // Gdy endpoint trybów jeszcze nie odpowiedział (albo krok specjalności
    // został pominięty, więc `loadTryby` nie wystartował), liczymy tryby
    // z katalogu — tak samo jak `wizardTrybHtml` w webie. Krok nie może być
    // ślepą uliczką.
    tryby = tryby.ifEmpty { catalogTryby(groups, selection) },
    planCandidates = planCandidates,
    planGroups = planGroups,
    academicYearStart = academicYearStart,
    query = pickerQuery,
    specsKnown = specsKey.isNotBlank(),
    // Nota jak w webie: gdy w wybranym semestrze nie ma grup, luzujemy filtr
    // i mówimy o tym wprost — inaczej krok „Plan” wygląda na pusty bez powodu.
    planNote = if (groups.isNotEmpty() && preparedSelection != selection) {
        "W tym semestrze nie ma grup — pokazuję wszystkie semestry tego wyboru."
    } else {
        null
    },
    loading = wizardLoading,
    error = wizardError,
    warning = wizardWarning,
)

/**
 * Opis wyboru opisującego plan: „Informatyka · 2024/2025 · niestacjonarne”.
 *
 * Liczony z [PlanUiState.appliedSelection], a nie z bieżącego szkicu pickera —
 * karta „Plan” ma mówić o planie, który jest na ekranie. Etykiety z formularza
 * ([PlanUiState.appliedSite]) są tylko uzupełnieniem: po restarcie ich nie ma,
 * więc zostają wartości z katalogu (te same teksty).
 */
fun PlanUiState.selectionSummary(): String {
    val applied = appliedSelection
    val kierunek = appliedSite.kierunekLabel.ifBlank {
        applied.field.takeIf { it.isNotBlank() && it != PlanSelection.NONE }.orEmpty()
    }
    val spec = appliedSite.specLabel.ifBlank {
        applied.spec.takeIf { it.isNotBlank() && it != PlanSelection.NONE }.orEmpty()
    }
    return listOfNotNull(
        kierunek.takeIf { it.isNotBlank() },
        applied.nabor.takeIf { it.isNotBlank() }?.let(SelectionLabels::nabor),
        spec.takeIf { it.isNotBlank() },
        SelectionLabels.MODE[applied.mode],
    ).joinToString(" · ")
}

/**
 * Stan ekranu: cache z dysku rysowany od razu, potem ciche odświeżenie
 * (`/api/version` → ewentualnie plan). Błąd sieci nie czyści tego, co już mamy.
 *
 * Wybór grupy to para (numer grupy, wymiary), bo ten sam numer ma inny plan
 * w każdym naborze — `PlanTarget` liczy z tego rok akademicki (`ay`).
 */
class PlanViewModel(
    private val repository: PlanRepository,
    private val attachments: AttachmentsRepository,
    private val notes: NotesRepository,
    private val feedback: FeedbackRepository,
    private val currentVersionCode: Int,
    private val currentVersionName: String,
    private val onPlanChanged: () -> Unit,
    /**
     * Zmiana motywu wymaga **wymuszonego** przerysowania widżetów: plan się nie
     * zmienił, więc zwykłe „odśwież, jeśli inny” mogłoby nic nie zrobić.
     */
    private val onStyleChanged: () -> Unit = onPlanChanged,
) : ViewModel() {

    private val _state = MutableStateFlow(
        PlanUiState(
            groupId = repository.currentGroup(),
            planGroups = repository.currentPlanGroups(),
            selection = repository.currentSelection(),
            // W ustawieniach leży wybór, z którym zapisano plan — picker startuje
            // od niego i do niego wraca po zamknięciu arkusza bez wyboru.
            appliedSelection = repository.currentSelection(),
            target = repository.currentTarget(),
            styleId = StyleCatalog.normalize(repository.currentStyle()),
            // Zawsze „Dzień”: wybór kafelka jest stanem sesji, nie ustawieniem.
            // Wcześniej zapamiętany tryb (np. Semestr) wracał po restarcie
            // i aplikacja otwierała się na widoku, którego nikt nie chciał.
            viewMode = ScheduleViewMode.default,
            needsGroupSelection = !repository.hasChosenGroup(),
            whatsNew = WhatsNew.pending(
                seenVersionCode = repository.whatsNewSeenVersion(),
                currentVersionCode = currentVersionCode,
            ),
        ),
    )
    val state: StateFlow<PlanUiState> = _state.asStateFlow()

    private var loadJob: Job? = null
    private var lastLoadAt: Long = 0L

    init {
        load()
    }

    fun load(force: Boolean = false) {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            val target = repository.currentTarget()
            lastLoadAt = System.currentTimeMillis()

            val cached = withContext(Dispatchers.IO) { repository.cachedPlan(target) }
            _state.update { current ->
                current.copy(
                    groupId = target.groupId,
                    planGroups = target.orderedGroups,
                    target = target,
                    loading = cached == null && current.slots.isEmpty(),
                    today = LocalDate.now(),
                )
            }
            cached?.let(::applyStored)

            _state.update { it.copy(refreshing = true, error = null) }

            val catalog = withContext(Dispatchers.IO) {
                runCatching { repository.groups(force = force) }.getOrNull()
            }
            val groups = catalog?.groups?.groups.orEmpty()
            val defaults = catalog?.groups?.defaults?.toSelection()
            val ayStart = catalog?.groups?.academicYear?.start?.toIntOrNull()
            if (groups.isNotEmpty()) {
                _state.update { current ->
                    current.copy(
                        groups = groups,
                        defaults = current.defaults ?: defaults,
                        // Picker startuje **pusty**, tak jak w wersji web
                        // („na starcie widać wyłącznie Rocznik”). Wcześniej
                        // podstawialiśmy wybór domyślny serwera i ekran od razu
                        // pokazywał cztery wypełnione kroki — inaczej niż w PWA.
                        academicYearStart = ayStart ?: current.academicYearStart,
                        groupName = current.groupName ?: groups.firstOrNull { it.id == target.groupId }?.name,
                    )
                }
            }

            val outcome = withContext(Dispatchers.IO) {
                runCatching { repository.refresh(target, force) }.getOrElse { error ->
                    RefreshOutcome.Failed(error.message ?: "Nie udało się odświeżyć planu.")
                }
            }
            when (outcome) {
                is RefreshOutcome.Updated -> {
                    applyStored(outcome.stored)
                    _state.update { it.copy(offline = false, error = null) }
                }

                is RefreshOutcome.NotModified -> {
                    outcome.stored?.let(::applyStored)
                    _state.update { it.copy(offline = false, error = null) }
                }

                is RefreshOutcome.Cached -> {
                    applyStored(outcome.stored)
                    _state.update { it.copy(offline = false) }
                }

                is RefreshOutcome.Offline -> {
                    applyStored(outcome.stored)
                    _state.update { it.copy(offline = true, error = null) }
                }

                is RefreshOutcome.Failed -> {
                    _state.update { it.copy(error = outcome.message) }
                }
            }

            _state.update { it.copy(loading = false, refreshing = false) }

            // Widżet musi podążać za wybraną grupą także wtedy, gdy wersja planu
            // na serwerze się nie zmieniła (NotModified/Cached/Offline).
            if (_state.value.slots.isNotEmpty()) {
                onPlanChanged()
            }

            refreshAttachmentIndex()
            refreshNotes()
        }
    }

    /**
     * Odświeża indeks materiałów („które zajęcia mają spinacz”). Błąd jest
     * ignorowany — brak indeksu oznacza po prostu brak ikon, nie błąd planu.
     */
    fun refreshAttachmentIndex() {
        viewModelScope.launch {
            val found = withContext(Dispatchers.IO) {
                runCatching { attachments.index() }.getOrNull()
            } ?: return@launch
            _state.update { current ->
                current.copy(
                    classesWithAttachments = found.classes
                        .filterValues { it.hasAny }
                        .keys
                        .toSet(),
                )
            }
        }
    }

    fun refresh() = load(force = true)

    /**
     * Notatki na kafelkach (`GET /api/notes`) — jedna mapa na cały plan, tak
     * samo jak indeks materiałów. Błąd jest ignorowany: brak notatek oznacza
     * po prostu brak plakietek, nie błąd planu.
     */
    fun refreshNotes() {
        viewModelScope.launch {
            val found = withContext(Dispatchers.IO) {
                runCatching { notes.all() }.getOrNull()
            } ?: return@launch
            _state.update { current -> current.copy(notes = found) }
        }
    }

    /**
     * Zapis notatki (puste `text` usuwa). Zwraca komunikat błędu albo `null`,
     * gdy serwer potwierdził zapis — wtedy kafelek rysuje się od razu, bez
     * czekania na kolejne odświeżenie planu.
     */
    suspend fun saveNote(classId: String, text: String): String? {
        val clean = NoteText.sanitize(text)
        // Grupy i rok planu muszą pojechać razem z notatką: serwer sprawdza,
        // czy takie zajęcia naprawdę są w planie (od 17.11.2026).
        val target = repository.currentTarget()
        val saved = withContext(Dispatchers.IO) {
            runCatching { notes.save(classId, clean, target) }
        }.getOrElse { error ->
            return error.message?.takeIf { it.isNotBlank() }
                ?: "Nie udało się zapisać notatki."
        }
        _state.update { current ->
            val next = current.notes.toMutableMap()
            if (saved.isBlank()) next.remove(classId) else next[classId] = saved
            current.copy(notes = next)
        }
        return null
    }

    /**
     * Wybór jednej grupy z katalogu (starsze ekrany): wymiary trafiają do
     * ustawień, a plan wczytuje `selectGroup`.
     */
    fun selectGroup(groupId: String, selection: PlanSelection) {
        val normalized = groupId.trim()
        selectPlan(listOf(normalized), selection)
    }

    /**
     * Ustawia plan (lista grup: baza + ćwiczenia/laby/lektorat) i wczytuje go,
     * jeśli zmiana jest realna. Wybór z ekranu powitalnego jest świadomą
     * decyzją użytkownika — nawet gdy to ta sama, domyślna grupa.
     */
    fun selectPlan(groups: List<String>, selection: PlanSelection) {
        applyPlan(groups, selection, _state.value.site)
    }

    /**
     * Wspólna droga każdej zmiany planu. `site` to etykiety wyboru, który plan
     * opisuje — przy dodawaniu grupy zostają etykiety planu, a nie szkicu
     * pickera (inaczej karta „Plan” pokazywałaby przeglądany rocznik).
     */
    private fun applyPlan(groups: List<String>, selection: PlanSelection, site: SiteSelection) {
        val list = groups.map(String::trim).filter { it.isNotEmpty() }.distinct()
        if (list.isEmpty()) return
        val target = repository.target(list, selection)
        val changed = target != repository.currentTarget()
        repository.selectPlan(list, selection)

        _state.update {
            val next = it.copy(
                groupId = list.first(),
                planGroups = list,
                selection = selection,
                appliedSelection = selection,
                site = site,
                appliedSite = site,
                target = target,
                needsGroupSelection = false,
            )
            if (!changed) {
                next
            } else {
                next.copy(
                    groupName = null,
                    slots = emptyList(),
                    savedAtMillis = 0L,
                    loading = true,
                    error = null,
                    offline = false,
                )
            }
        }
        if (changed) load(force = true)
    }

    /** Dodanie grup (ćwiczenia, laby, lektorat) do planu. */
    fun addGroups(groupIds: List<String>) {
        val current = _state.value
        val next = (current.planGroups + groupIds).distinct()
        if (next.size == current.planGroups.size) return
        applyPlan(next, current.appliedSelection, current.appliedSite)
    }

    /** Usunięcie grupy z planu — bazy nie można usunąć. */
    fun removeGroup(groupId: String) {
        val current = _state.value
        if (current.planGroups.size < 2) return
        applyPlan(
            current.planGroups.filter { it != groupId },
            current.appliedSelection,
            current.appliedSite,
        )
    }

    /**
     * Zamknięcie Opcji bez wyboru planu: szkic pickera wraca do wyboru
     * opisującego plan (rocznik planu, nie przeglądanej oferty). Dzięki temu
     * „Dodaj grupy” filtruje po roczniku planu, a karta „Plan” nie kłamie.
     */
    fun restoreAppliedSelection() {
        _state.update { state ->
            if (state.selection == state.appliedSelection && state.site == state.appliedSite) {
                state
            } else {
                state.copy(
                    selection = state.appliedSelection,
                    site = state.appliedSite,
                    specjalnosci = emptyList(),
                    specsKey = "",
                    noSpecGroups = 0,
                    tryby = emptyList(),
                    trybyKey = "",
                )
            }
        }
    }

    // --- kreator wyboru (kierunek → rocznik → specjalność → tryb) ---------

    /** Lista kierunków z formularza uczelni (stały wydział). */
    fun loadKierunki(force: Boolean = false) {
        if (!force && _state.value.kierunki.isNotEmpty()) return
        viewModelScope.launch {
            _state.update { it.copy(wizardLoading = true, wizardError = null) }
            val result = withContext(Dispatchers.IO) { runCatching { repository.kierunki() } }
            _state.update { current ->
                result.fold(
                    onSuccess = { dto ->
                        current.copy(
                            kierunki = dto.items,
                            site = current.site.withKierunek(dto.items, current.selection),
                            wizardLoading = false,
                            wizardWarning = dto.warning,
                        )
                    },
                    onFailure = { error ->
                        current.copy(
                            wizardLoading = false,
                            wizardError = error.message ?: "Nie udało się pobrać listy kierunków.",
                        )
                    },
                )
            }
            // Wybór z domyślnych serwera nie ma `site.kierunekId` (nikt nie
            // kliknął kroku „Kierunek”). Gdy udało się go dopasować po nazwie,
            // dociągamy listy, żeby kroki „specjalność” i „tryb” nie były puste.
            val state = _state.value
            val kierunekId = state.site.kierunekId
            if (kierunekId.isNotBlank()) {
                loadSpecjalnosci(kierunekId, state.selection.nabor)
                loadTryby()
            }
        }
    }

    /**
     * Specjalności kierunku **w roczniku** (oferta uczelni + starsze nazwy
     * z katalogu). Rocznik jest kluczem cache, bo zmiana rocznika zmienia listę.
     */
    fun loadSpecjalnosci(kierunekId: String, nabor: String, force: Boolean = false) {
        if (kierunekId.isBlank()) return
        val key = "$kierunekId@$nabor"
        val current = _state.value
        if (!force && current.specsKey == key && current.specjalnosci.isNotEmpty()) return
        viewModelScope.launch {
            _state.update { it.copy(wizardLoading = true, wizardError = null) }
            val result = withContext(Dispatchers.IO) {
                runCatching { repository.specjalnosci(kierunekId, nabor) }
            }
            _state.update { state ->
                result.fold(
                    onSuccess = { dto ->
                        state.copy(
                            specjalnosci = dto.items,
                            noSpecGroups = dto.noSpecGroups,
                            specsKey = key,
                            wizardLoading = false,
                            wizardWarning = dto.warning,
                        )
                    },
                    onFailure = { error ->
                        state.copy(
                            wizardLoading = false,
                            wizardError = error.message ?: "Nie udało się pobrać listy specjalności.",
                        )
                    },
                )
            }
        }
    }

    /**
     * Tryby studiów dostępne dla wyboru. Gdy endpoint nie odpowie, krok „tryb”
     * korzysta z listy zapasowej policzonej z katalogu (`PlanSelectionLogic.facets`).
     */
    fun loadTryby(force: Boolean = false) {
        val current = _state.value
        val kierunekId = current.site.kierunekId
        val key = "$kierunekId@${current.selection.nabor}@${current.selection.spec}"
        if (!force && current.trybyKey == key && current.tryby.isNotEmpty()) return
        // Kierunek z domyślnych serwera nie ma numeru w `site` (nie kliknięto
        // kroku „Kierunek”), więc endpoint nie ma czego policzyć. Tryby bierzemy
        // wtedy z katalogu — krok nie kończy się „Brak trybów”.
        if (kierunekId.isBlank()) {
            _state.update { it.copy(tryby = catalogTryby(it.groups, it.selection), trybyKey = key) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(wizardLoading = true, wizardError = null) }
            val result = withContext(Dispatchers.IO) {
                runCatching { repository.tryby(kierunekId, current.selection.nabor, current.selection.spec) }
            }
            _state.update { state ->
                result.fold(
                    onSuccess = { dto ->
                        state.copy(tryby = dto.items, trybyKey = key, wizardLoading = false)
                    },
                    onFailure = {
                        state.copy(tryby = emptyList(), trybyKey = key, wizardLoading = false)
                    },
                )
            }
        }
    }

    /**
     * Krok „Kierunek”. Rocznik **zostaje** — tak samo jak w webie, gdzie zmiana
     * kierunku nie cofa wybranego rocznika (oferta specjalności jest rocznikowa,
     * więc to rocznik jest pierwszy). Ten sam kierunek zamyka tylko krok.
     */
    fun chooseKierunek(item: SelectionItemDto) {
        val current = _state.value
        if (current.site.kierunekId == item.id && current.selection.field == (item.field ?: item.label)) {
            return
        }
        val selection = current.selection.copy(
            field = item.field ?: item.label,
            spec = PlanSelection.ANY,
            year = PlanSelection.ANY,
            degree = PlanSelection.ANY,
            mode = PlanSelection.ANY,
            sem = PlanSelection.ANY,
        )
        _state.update {
            it.copy(
                selection = selection,
                site = SiteSelection(kierunekId = item.id, kierunekLabel = item.label),
                specjalnosci = emptyList(),
                specsKey = "",
                noSpecGroups = 0,
                tryby = emptyList(),
                trybyKey = "",
                pickerQuery = "",
            )
        }
        loadSpecjalnosci(item.id, selection.nabor)
    }

    /**
     * Krok „Rocznik”. Zmiana rocznika unieważnia specjalność i tryb (ich oferta
     * jest rocznikowa), ale **kierunek zostaje**, jeśli ma grupy w nowym roczniku
     * — dokładnie tak samo jak `wizChooseNabor` w wersji web.
     */
    fun chooseNabor(nabor: String) {
        val current = _state.value
        if (current.selection.nabor == nabor) return
        val ay = current.target.academicYear ?: current.academicYearStart ?: AcademicYear.currentStart()
        val keepField = current.selection.field.isNotBlank() &&
            PickerSteps.kierunkiInCohort(current.kierunki, nabor)
                .any { it.field == current.selection.field || it.label == current.selection.field }
        val selection = PlanWizard.withSemester(
            current.selection.copy(
                nabor = nabor,
                field = if (keepField) current.selection.field else PlanSelection.ANY,
                spec = PlanSelection.ANY,
                mode = PlanSelection.ANY,
            ),
            ay,
        )
        _state.update {
            it.copy(
                selection = selection,
                site = if (keepField) {
                    current.site.copy(specId = "", specLabel = "", specSkipped = false)
                } else {
                    SiteSelection()
                },
                specjalnosci = emptyList(),
                specsKey = "",
                noSpecGroups = 0,
                tryby = emptyList(),
                trybyKey = "",
                pickerQuery = "",
            )
        }
        if (keepField && current.site.kierunekId.isNotBlank()) {
            loadSpecjalnosci(current.site.kierunekId, nabor)
        }
    }

    /** Krok 3: specjalność (null = „Pomiń specjalność”). */
    fun chooseSpec(item: SelectionItemDto?) {
        val current = _state.value
        val selection = current.selection.copy(spec = item?.value ?: PlanSelection.ANY)
        _state.update {
            it.copy(
                selection = selection,
                site = current.site.copy(
                    specId = item?.id.orEmpty(),
                    specLabel = item?.label.orEmpty(),
                    specSkipped = item == null,
                ),
                tryby = emptyList(),
                trybyKey = "",
            )
        }
        loadTryby()
    }

    /**
     * Krok „Tryb”. Gdy wybór pasuje do jednego planu bazowego, wchodzimy w niego
     * od razu — tak samo jak `wizChooseTryb` w webie (`plans.length === 1`).
     */
    fun chooseTryb(mode: String) {
        val current = _state.value
        val selection = current.selection.copy(mode = mode)
        _state.update { it.copy(selection = selection) }
        val improved = _state.value
        val candidates = improved.planCandidates
        if (candidates.size == 1) finishWizard(candidates.first().id)
    }

    /** Litery w polu „Szukaj kierunku” (krok „Kierunek”). */
    fun setPickerQuery(text: String) {
        if (_state.value.pickerQuery == text) return
        _state.update { it.copy(pickerQuery = text) }
    }

    /**
     * „Zacznij od nowa” — czyści wybór i wraca do rocznika. Plan na ekranie
     * zostaje, jaki jest (web: `wizReset`).
     */
    fun resetPicker() {
        _state.update {
            it.copy(
                selection = it.selection.copy(
                    nabor = PlanSelection.ANY,
                    field = PlanSelection.ANY,
                    spec = PlanSelection.ANY,
                    year = PlanSelection.ANY,
                    degree = PlanSelection.ANY,
                    mode = PlanSelection.ANY,
                    sem = PlanSelection.ANY,
                ),
                site = SiteSelection(),
                specjalnosci = emptyList(),
                specsKey = "",
                noSpecGroups = 0,
                tryby = emptyList(),
                trybyKey = "",
                pickerQuery = "",
            )
        }
    }

    /**
     * Koniec kreatora: plan bazowy (wykład) + specjalność z wybranej grupy,
     * gdy użytkownik ją pominął. Potem ekran pyta o własne grupy.
     */
    fun finishWizard(groupId: String) {
        val current = _state.value
        val group = current.groups.firstOrNull { it.id == groupId } ?: return
        // Wybór po korekcie kroku „plan” — może mieć poluzowany semestr, gdy
        // w katalogu nie ma grup na ten semestr; dodawane grupy muszą używać
        // tego samego filtra, inaczej lista byłaby pusta.
        val (prepared, _) = PlanWizard.planStep(current.groups, current.selection)
        val spec = prepared.spec.ifEmpty { group.spec.orEmpty() }
        val selection = prepared.copy(
            spec = spec,
            degree = group.degree ?: prepared.degree,
        )
        // Grupa wykładowa niesie specjalność — zapisujemy ją także jako wybór,
        // żeby karta i krok „specjalność” mówiły to samo (inaczej krok pokazuje
        // zaznaczone „Pomiń specjalność”, a plan jest już przypisany).
        val site = current.site.copy(
            kierunekLabel = current.site.kierunekLabel.ifEmpty { group.field.orEmpty() },
            specLabel = current.site.specLabel.ifEmpty { group.spec.orEmpty() },
            specId = current.site.specId.ifEmpty {
                if (spec.isBlank()) "" else "katalog:$spec"
            },
            specSkipped = if (spec.isBlank()) current.site.specSkipped else false,
        )
        _state.update { it.copy(site = site) }
        selectPlan(listOf(group.id), selection)
        // Po pierwszym planie pytamy o własne ćwiczenia/laby („Dodaj / Pomiń”).
        _state.update { it.copy(showAddGroupsPrompt = true) }
    }

    /** Zamknięcie pytania „Dodaj swoje grupy” (przycisk Dodaj albo Pomiń). */
    fun dismissAddGroupsPrompt() {
        _state.update { it.copy(showAddGroupsPrompt = false) }
    }

    /** Wybór motywu — zapis trwały; widżet odświeża się tym samym callbackiem. */
    fun selectStyle(styleId: String) {
        val normalized = StyleCatalog.normalize(styleId)
        if (normalized == _state.value.styleId) return
        repository.selectStyle(normalized)
        _state.update { it.copy(styleId = normalized) }
        onStyleChanged()
    }

    /**
     * Tryb widoku jest wyłącznie stanem ekranu — po restarcie aplikacja wraca
     * do „Dnia”. Nie zapisujemy go, bo „ostatnio oglądany semestr” nie jest
     * dobrym domyślnym widokiem na telefonie.
     */
    fun selectViewMode(mode: ScheduleViewMode) {
        _state.update { it.copy(viewMode = mode) }
    }

    /**
     * Po powrocie do aplikacji: nowa data, spinacze i tanie sprawdzenie, czy
     * plan u uczelni się nie zmienił. Pełne odświeżenie (`force`, czyli
     * `POST /api/refresh`) tylko przy różnicy odcisku — serwer throttluje to
     * żądanie, więc nie wolno go wysyłać „na wszelki wypadek”.
     */
    fun onResume() {
        val today = LocalDate.now()
        _state.update { it.copy(today = today) }
        // Materiały mogły dojść z innego telefonu — spinacze odświeżamy zawsze.
        refreshAttachmentIndex()
        // Notatki również są wspólne, więc wracamy po nie przy każdym powrocie.
        refreshNotes()
        viewModelScope.launch {
            // Wczytanie po starcie jeszcze trwa — drugie tylko by je przerwało.
            if (loadJob?.isActive == true) return@launch
            val changed = withContext(Dispatchers.IO) {
                runCatching { repository.planChanged() }.getOrDefault(false)
            }
            val stale = System.currentTimeMillis() - lastLoadAt > RESUME_REFRESH_MS
            if (changed || stale) load(force = changed)
        }
    }

    /** Ekran „Co nowego” pokazany — ta wersja już nie wróci. */
    fun markWhatsNewSeen() {
        if (_state.value.whatsNew.isEmpty()) return
        repository.markWhatsNewSeen(currentVersionCode)
        _state.update { it.copy(whatsNew = emptyList()) }
    }

    /**
     * Wysyła propozycję albo zgłoszenie błędu. Zwraca komunikat błędu (null =
     * sukces); treść zostaje w polu, więc nieudana wysyłka nic nie gubi.
     */
    suspend fun sendFeedback(kind: FeedbackKind, message: String): String? {
        val text = message.trim()
        if (text.length < 3) return "Napisz kilka słów."
        return runCatching {
            withContext(Dispatchers.IO) {
                feedback.send(
                    FeedbackPayload(
                        kind = kind.id,
                        message = text,
                        version = currentVersionName,
                        versionCode = currentVersionCode,
                        platform = "android",
                    ),
                )
            }
        }.exceptionOrNull()?.let { error ->
            error.message?.takeIf { it.isNotBlank() } ?: "Nie udało się wysłać zgłoszenia."
        }
    }

    private fun applyStored(stored: StoredPlan) {
        _state.update {
            it.copy(
                slots = ScheduleMapper.toSlots(stored.plan),
                savedAtMillis = stored.savedAtMillis,
                groupName = stored.plan.meta?.groupName ?: it.groupName,
            )
        }
        // Widżety dostają plan **po** pobraniu, nie w chwili kliknięcia: zmiana
        // grup najpierw czyści ekran i dopiero potem pobiera scalony plan, więc
        // odświeżenie wysłane wcześniej rysowało na pulpicie pusty tydzień.
        // `WidgetUpdater` sam pomija identyczny odcisk treści, więc nie kosztuje.
        onPlanChanged()
    }

    class Factory(private val context: Context) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            val app = context.applicationContext
            return PlanViewModel(
                repository = PlanGraph.repository(app),
                attachments = PlanGraph.attachments(app),
                notes = PlanGraph.notes(app),
                feedback = PlanGraph.feedback(app),
                currentVersionCode = BuildConfig.VERSION_CODE,
                currentVersionName = BuildConfig.VERSION_NAME,
                onPlanChanged = { WidgetUpdater.requestUpdate(app) },
                onStyleChanged = { WidgetUpdater.requestUpdate(app, force = true) },
            ) as T
        }
    }

    private companion object {
        const val RESUME_REFRESH_MS = 15 * 60 * 1000L
    }
}
