@file:OptIn(ExperimentalMaterial3Api::class)

package pl.matiit.planzajec.ui.settings

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import kotlin.math.roundToInt
import kotlinx.coroutines.launch
import pl.matiit.planzajec.R
import pl.matiit.planzajec.data.model.GroupDto
import pl.matiit.planzajec.data.model.SelectionItemDto
import pl.matiit.planzajec.domain.AppCopy
import pl.matiit.planzajec.domain.ColorHsv
import pl.matiit.planzajec.domain.Format
import pl.matiit.planzajec.domain.Hsv
import pl.matiit.planzajec.domain.PlanSelection
import pl.matiit.planzajec.domain.PlanWizard
import pl.matiit.planzajec.ui.selection.AddGroupRow
import pl.matiit.planzajec.ui.selection.PlanGroupRow
import pl.matiit.planzajec.ui.selection.PlanPickerPanel
import pl.matiit.planzajec.ui.selection.RadioMark
import pl.matiit.planzajec.ui.selection.WizardActions
import pl.matiit.planzajec.ui.selection.WizardContext
import pl.matiit.planzajec.ui.theme.CustomColors
import pl.matiit.planzajec.ui.theme.LocalStylePalette
import pl.matiit.planzajec.ui.theme.StyleCatalog
import pl.matiit.planzajec.ui.theme.StyleGroup
import pl.matiit.planzajec.ui.update.UpdatesPage
import pl.matiit.planzajec.update.UpdateState
import pl.matiit.planzajec.widget.WidgetInstance
import pl.matiit.planzajec.widget.WidgetInstances
import pl.matiit.planzajec.widget.WidgetKind

/**
 * Panel ustawień: spis treści + trzy strony tematyczne (Plan, Wygląd,
 * Aktualizacje) i strona wyboru grupy. Każda strona ma nagłówek z „wstecz”,
 * a przejście jest animowane w bok — dzięki temu wiadomo, gdzie się jest.
 *
 * Poprzednia wersja była jednym długim arkuszem, w którym informacje,
 * przełączniki i przyciski miały tę samą wagę wizualną.
 */
@Composable
fun SettingsSheet(
    groupLabel: String,
    groupId: String,
    groups: List<GroupDto>,
    /** Grupy planu: baza (wykład) + ćwiczenia/laby/lektorat. */
    planGroups: List<String>,
    /** Grupy możliwe do dodania (wykłady są wliczone automatycznie i już dodane odpadają). */
    addableGroups: List<GroupDto>,
    /** Podpis bieżącego wyboru: „Administracja · 2024/2025 · … · niestacjonarne”. */
    selectionSummary: String,
    /** Dane kreatora wyboru (kierunek → rocznik → specjalność → tryb). */
    wizard: WizardContext,
    savedAtMillis: Long,
    nowMillis: Long,
    offline: Boolean,
    refreshing: Boolean,
    styleId: String,
    /** Dwa kolory motywu „Własny” — podstawa edytora na stronie „Wygląd”. */
    customTheme: CustomColors,
    updateState: UpdateState,
    canInstall: Boolean,
    initialPage: SettingsPage = SettingsPage.ROOT,
    onDismiss: () -> Unit,
    onChooseKierunek: (SelectionItemDto) -> Unit,
    onChooseNabor: (String) -> Unit,
    onChooseSpec: (SelectionItemDto?) -> Unit,
    onChooseTryb: (String) -> Unit,
    onChoosePlan: (String) -> Unit,
    onPickerQueryChange: (String) -> Unit,
    onResetPicker: () -> Unit,
    onSelectGroup: (String, PlanSelection) -> Unit,
    onRemoveGroup: (String) -> Unit,
    onAddGroups: (List<String>) -> Unit,
    onSelectStyle: (String) -> Unit,
    /** Zmiana barw motywu „Własny”: (akcent, tło) w zapisie `#RRGGBB`. */
    onCustomThemeChange: (String, String) -> Unit,
    onRefresh: () -> Unit,
    onCheckNow: () -> Unit,
    onDownloadAndInstall: () -> Unit,
    onOpenPermission: () -> Unit,
    onSkip: () -> Unit,
    onClearSkip: () -> Unit,
    onAutoCheckChange: (Boolean) -> Unit,
    onAutoDownloadChange: (Boolean) -> Unit,
    onSendFeedback: suspend (FeedbackKind, String) -> String?,
    onLoadWidgets: suspend () -> List<WidgetInstance>,
    onPinWidget: suspend (WidgetKind) -> Boolean,
    onConfigureWidget: (Int) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var page by rememberSaveable(initialPage) { mutableStateOf(initialPage) }
    var feedbackKind by remember { mutableStateOf<FeedbackKind?>(null) }
    val scope = rememberCoroutineScope()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        // „Wstecz” w systemie wraca do spisu treści, a nie zamyka całego arkusza.
        // Handler musi być zadeklarowany **w środku** arkusza: ModalBottomSheet
        // rejestruje własną obsługę „wstecz” (zamknięcie), a wygrywa ta
        // zarejestrowana później.
        BackHandler(enabled = !page.isRoot) { page = SettingsPage.ROOT }

        AnimatedContent(
            targetState = page,
            transitionSpec = {
                if (targetState.isRoot) {
                    (slideInHorizontally(tween(220)) { -it / 5 } + fadeIn(tween(180)))
                        .togetherWith(slideOutHorizontally(tween(220)) { it / 5 } + fadeOut(tween(140)))
                } else {
                    (slideInHorizontally(tween(220)) { it / 5 } + fadeIn(tween(180)))
                        .togetherWith(slideOutHorizontally(tween(220)) { -it / 5 } + fadeOut(tween(140)))
                }
            },
            label = "settings-page",
        ) { current ->
            // Strona „Grupa” ma własną listę (nawet 2100 pozycji katalogu),
            // więc przewija się sama — wspólny `verticalScroll` dostałaby
            // tylko pozostałe strony.
            if (current == SettingsPage.GROUP) {
                GroupPage(
                    wizard = wizard,
                    onBack = { page = SettingsPage.ROOT },
                    actions = WizardActions(
                        onChooseKierunek = onChooseKierunek,
                        onChooseNabor = onChooseNabor,
                        onChooseSpec = onChooseSpec,
                        onChooseTryb = onChooseTryb,
                        onChoosePlan = onChoosePlan,
                        onReset = onResetPicker,
                        onQueryChange = onPickerQueryChange,
                    ),
                    onChooseManual = { id -> onSelectGroup(id, wizard.selection) },
                )
                return@AnimatedContent
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 24.dp),
            ) {
                when (current) {
                    SettingsPage.ROOT -> RootPage(
                        groupLabel = groupLabel,
                        savedAtMillis = savedAtMillis,
                        nowMillis = nowMillis,
                        offline = offline,
                        styleId = styleId,
                        updateState = updateState,
                        onLoadWidgets = onLoadWidgets,
                        onOpen = { page = it },
                    )

                    SettingsPage.PLAN -> PlanPage(
                        selectionSummary = selectionSummary,
                        planGroups = planGroups,
                        groups = groups,
                        savedAtMillis = savedAtMillis,
                        nowMillis = nowMillis,
                        offline = offline,
                        refreshing = refreshing,
                        onBack = { page = SettingsPage.ROOT },
                        onOpenGroup = { page = SettingsPage.GROUP },
                        onOpenAdd = { page = SettingsPage.ADD },
                        onRemoveGroup = onRemoveGroup,
                        onRefresh = onRefresh,
                    )

                    SettingsPage.ADD -> AddPlanPage(
                        addableGroups = addableGroups,
                        planLabel = groupLabel,
                        onBack = { page = SettingsPage.PLAN },
                        onAdd = { picked ->
                            onAddGroups(picked)
                            page = SettingsPage.PLAN
                        },
                    )

                    SettingsPage.LOOK -> LookPage(
                        styleId = styleId,
                        customTheme = customTheme,
                        onBack = { page = SettingsPage.ROOT },
                        onSelectStyle = onSelectStyle,
                        onCustomThemeChange = onCustomThemeChange,
                    )

                    SettingsPage.UPDATES -> UpdatesPage(
                        state = updateState,
                        nowMillis = nowMillis,
                        canInstall = canInstall,
                        onBack = { page = SettingsPage.ROOT },
                        onCheckNow = onCheckNow,
                        onDownloadAndInstall = onDownloadAndInstall,
                        onOpenPermission = onOpenPermission,
                        onSkip = onSkip,
                        onClearSkip = onClearSkip,
                        onAutoCheckChange = onAutoCheckChange,
                        onAutoDownloadChange = onAutoDownloadChange,
                    )

                    // Obsłużone wyżej — własna lista z przewijaniem.
                    SettingsPage.GROUP -> Unit

                    SettingsPage.FEEDBACK -> FeedbackPage(
                        onPick = { feedbackKind = it },
                        onBack = { page = SettingsPage.ROOT },
                    )

                    SettingsPage.WIDGETS -> WidgetsPage(
                        loadInstances = onLoadWidgets,
                        onPin = onPinWidget,
                        onConfigure = onConfigureWidget,
                        onBack = { page = SettingsPage.ROOT },
                    )
                }
            }
        }
    }

    feedbackKind?.let { kind ->
        FeedbackDialog(
            kind = kind,
            scope = scope,
            onDismiss = { feedbackKind = null },
            send = onSendFeedback,
        )
    }
}

@Composable
private fun RootPage(
    groupLabel: String,
    savedAtMillis: Long,
    nowMillis: Long,
    offline: Boolean,
    styleId: String,
    updateState: UpdateState,
    onLoadWidgets: suspend () -> List<WidgetInstance>,
    onOpen: (SettingsPage) -> Unit,
) {
    val scope = rememberCoroutineScope()
    // Liczba widżetów zmienia się poza aplikacją (launcher), więc pytamy system
    // przy każdym wejściu na spis treści, zamiast zapamiętywać wynik.
    var widgetSummary by remember { mutableStateOf("sprawdzam…") }
    LifecycleResumeEffect(Unit) {
        scope.launch {
            val count = runCatching { onLoadWidgets() }.getOrDefault(emptyList()).size
            widgetSummary = WidgetInstances.summary(count)
        }
        onPauseOrDispose { }
    }

    SettingsPageHeader(
        title = "Ustawienia",
        subtitle = "Plan, wygląd i aktualizacje aplikacji.",
    )

    SettingsCard {
        SettingsNavRow(
            iconRes = R.drawable.ic_view_month,
            title = "Plan",
            summary = SettingsSummary.plan(groupLabel, savedAtMillis, nowMillis, offline),
            onClick = { onOpen(SettingsPage.PLAN) },
        )
    }
    Spacer(Modifier.height(10.dp))
    SettingsCard {
        SettingsNavRow(
            iconRes = R.drawable.ic_settings_look,
            title = "Wygląd",
            summary = StyleCatalog.def(styleId).label,
            onClick = { onOpen(SettingsPage.LOOK) },
        )
    }
    Spacer(Modifier.height(10.dp))
    SettingsCard {
        SettingsNavRow(
            iconRes = R.drawable.ic_settings_update,
            title = "Aktualizacje",
            summary = SettingsSummary.updates(
                versionLabel = updateState.versionLabel,
                availableVersionName = updateState.release
                    ?.takeIf { updateState.updateAvailable }
                    ?.versionName,
            ),
            accent = updateState.showsBadge,
            onClick = { onOpen(SettingsPage.UPDATES) },
        )
    }
    Spacer(Modifier.height(10.dp))
    SettingsCard {
        SettingsNavRow(
            iconRes = R.drawable.ic_widgets,
            title = "Widżety",
            summary = widgetSummary,
            onClick = { onOpen(SettingsPage.WIDGETS) },
        )
    }
    Spacer(Modifier.height(10.dp))
    SettingsCard {
        SettingsNavRow(
            iconRes = R.drawable.ic_feedback,
            title = "Propozycje / błędy",
            summary = "Zaproponuj nową funkcję albo zgłoś błąd",
            onClick = { onOpen(SettingsPage.FEEDBACK) },
        )
    }

    Spacer(Modifier.height(14.dp))
    Text(
        text = AppCopy.TAGLINE,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.primary,
    )
    Spacer(Modifier.height(4.dp))
    Text(
        text = "Aplikacja zawsze otwiera się na dniu. Grupę i styl zapamiętujemy " +
            "na telefonie, plan pochodzi z harmonogramu uczelni (ideis.mati-it.pl).",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun PlanPage(
    selectionSummary: String,
    planGroups: List<String>,
    groups: List<GroupDto>,
    savedAtMillis: Long,
    nowMillis: Long,
    offline: Boolean,
    refreshing: Boolean,
    onBack: () -> Unit,
    onOpenGroup: () -> Unit,
    onOpenAdd: () -> Unit,
    onRemoveGroup: (String) -> Unit,
    onRefresh: () -> Unit,
) {
    SettingsPageHeader(
        title = "Plan",
        subtitle = "Co składa się na plan i kiedy był odświeżony.",
        onBack = onBack,
    )

    // Najpierw „co to za plan”, potem lista grup — bez tego trzeba się domyślać,
    // do jakiego kierunku i rocznika należy ten plan.
    SettingsCard {
        SettingsActionRow(
            title = selectionSummary.ifBlank { "Nie wybrano planu" },
            supporting = "rocznik → kierunek → specjalność → tryb · dotknij, aby zmienić",
            onClick = onOpenGroup,
        )
    }

    Spacer(Modifier.height(12.dp))
    Text(
        text = "Grupy w planie (${planGroups.size})",
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 4.dp, bottom = 6.dp),
    )
    SettingsCard {
        planGroups.forEachIndexed { index, id ->
            if (index > 0) SettingsDivider()
            val group = groups.firstOrNull { it.id == id }
            PlanGroupRow(
                group = group,
                groupId = id,
                isBase = index == 0,
                onRemove = if (index > 0) {
                    { onRemoveGroup(id) }
                } else {
                    null
                },
            )
        }
    }

    Spacer(Modifier.height(12.dp))
    SettingsCard {
        SettingsActionRow(
            title = "Dodaj grupy do planu",
            supporting = "ćwiczenia, laboratoria, lektorat — wykłady są wliczone automatycznie",
            onClick = onOpenAdd,
        )
        SettingsDivider()
        SettingsInfoRow(
            title = "Ostatnie odświeżenie",
            value = Format.agoLabel(savedAtMillis, nowMillis) ?: "brak",
        )
        SettingsDivider()
        SettingsInfoRow(
            title = "Stan danych",
            value = when {
                offline -> "offline"
                savedAtMillis <= 0L -> "brak"
                Format.staleLabel(savedAtMillis, nowMillis) -> "starsze niż doba"
                else -> "aktualne"
            },
            hint = if (offline) "Brak sieci — pokazujemy ostatni zapisany plan." else null,
        )
    }

    Spacer(Modifier.height(14.dp))
    Button(
        onClick = onRefresh,
        enabled = !refreshing,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(if (refreshing) "Odświeżam…" else "Odśwież plan")
    }
    Spacer(Modifier.height(10.dp))
    Text(
        text = "Plan to suma grup: wykłady wspólne (wliczone automatycznie) i Twoje ćwiczenia, " +
            "laboratoria oraz lektorat. Odświeżanie w tle pobiera tylko odcisk wersji planu, " +
            "więc nie zużywa transmisji.",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

/**
 * „Dodaj grupy do planu”: wykłady są wliczone automatycznie, więc lista ma
 * tylko ćwiczenia, laboratoria i lektorat. Przycisk dodawania jest **nad**
 * listą — przy kilkudziesięciu grupach nie trzeba przewijać do końca.
 */
@Composable
private fun AddPlanPage(
    addableGroups: List<GroupDto>,
    planLabel: String,
    onBack: () -> Unit,
    onAdd: (List<String>) -> Unit,
) {
    var picked by rememberSaveable { mutableStateOf(setOf<String>()) }
    SettingsPageHeader(
        title = "Dodaj grupy do planu",
        subtitle = "Wykłady są wliczone automatycznie — wybierz swoje ćwiczenia, laboratoria i lektorat.",
        onBack = onBack,
    )
    if (planLabel.isNotBlank()) {
        Spacer(Modifier.height(6.dp))
        Text(
            text = "W planie: $planLabel",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 4.dp),
        )
    }
    Spacer(Modifier.height(10.dp))
    Button(
        onClick = { onAdd(picked.toList()) },
        enabled = picked.isNotEmpty(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(if (picked.isEmpty()) "Dodaj" else "Dodaj (${picked.size})")
    }
    Spacer(Modifier.height(4.dp))
    Text(
        text = if (picked.isEmpty()) {
            "Zaznacz grupy, które są Twoje"
        } else {
            "Zaznaczono ${picked.size} ${if (picked.size == 1) "grupę" else "grupy"}"
        },
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(12.dp))

    if (addableGroups.isEmpty()) {
        Text(
            text = "Nie ma już grup do dodania w tym wyborze.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    // Grupy pogrupowane po rodzaju zajęć — łatwiej znaleźć swoje laboratoria.
    val byKind = addableGroups.groupBy { it.kind ?: "Inne" }
    byKind.forEach { (kind, list) ->
        Text(
            text = "${PlanWizard.kindLabel(kind)} (${list.size})",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 4.dp, bottom = 6.dp),
        )
        SettingsCard {
            list.forEachIndexed { index, group ->
                if (index > 0) SettingsDivider()
                AddGroupRow(
                    group = group,
                    selected = group.id in picked,
                    onToggle = {
                        picked = if (group.id in picked) picked - group.id else picked + group.id
                    },
                )
            }
        }
        Spacer(Modifier.height(8.dp))
    }

    Text(
        text = "Wykłady są wliczone automatycznie; dodane grupy możesz usunąć w Opcjach → Plan.",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun LookPage(
    styleId: String,
    customTheme: CustomColors,
    onBack: () -> Unit,
    onSelectStyle: (String) -> Unit,
    onCustomThemeChange: (String, String) -> Unit,
) {
    SettingsPageHeader(
        title = "Wygląd",
        subtitle = "Ten sam wybór co w wersji web — zmiana działa od razu.",
        onBack = onBack,
    )

    StyleCatalog.groups.forEach { (group, entries) ->
        Text(
            text = group.label,
            // `.settings-group-head` z webu: 12 sp, 600, rozstrzelone, text-soft.
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.4.sp,
            color = LocalStylePalette.current.textSoft,
            modifier = Modifier.padding(start = 4.dp, top = 2.dp, bottom = 6.dp),
        )
        SettingsCard {
            entries.forEachIndexed { index, style ->
                if (index > 0) SettingsDivider()
                StyleRow(
                    label = style.label,
                    hint = style.hint,
                    selected = style.id == styleId,
                    swatch = StyleCatalog.palette(style.id, style.isDark, customTheme).accent,
                    onClick = { onSelectStyle(style.id) },
                )
            }
        }
        Spacer(Modifier.height(10.dp))
    }

    CustomThemeSection(colors = customTheme, onChange = onCustomThemeChange)
}

/**
 * Edytor motywu „Własny”: dwa kolory (akcent i tło) wybierane suwakami
 * barwy, nasycenia i jasności.
 *
 * Suwak zmienia **podgląd na żywo** (próbka w wierszu), a zapis idzie po
 * puszczeniu palca (`onValueChangeFinished`) — inaczej każde drgnięcie suwaka
 * zapisywałoby SharedPreferences i przerysowywało widżet.
 */
@Composable
private fun CustomThemeSection(colors: CustomColors, onChange: (String, String) -> Unit) {
    val palette = LocalStylePalette.current
    Text(
        text = StyleGroup.WLASNY.label,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.4.sp,
        color = palette.textSoft,
        modifier = Modifier.padding(start = 4.dp, top = 2.dp, bottom = 6.dp),
    )

    var channel by rememberSaveable { mutableIntStateOf(0) }
    val activeHex = if (channel == 0) colors.primary else colors.background
    var draft by remember(activeHex) {
        mutableStateOf(ColorHsv.fromHex(activeHex) ?: Hsv(hue = 265f, saturation = 0.65f, value = 0.95f))
    }

    fun commit(next: Hsv) {
        draft = next
        val hex = ColorHsv.toHex(next)
        onChange(
            if (channel == 0) hex else colors.primary,
            if (channel == 1) hex else colors.background,
        )
    }

    SettingsCard {
        ColorChannelRow(
            title = "Kolor główny",
            hint = "akcent: przyciski, plakietki, aktywne elementy",
            hex = if (channel == 0) ColorHsv.toHex(draft) else colors.primary,
            selected = channel == 0,
            onClick = { channel = 0 },
        )
        SettingsDivider()
        ColorChannelRow(
            title = "Kolor tła",
            hint = "o jego jasności decyduje cały motyw",
            hex = if (channel == 1) ColorHsv.toHex(draft) else colors.background,
            selected = channel == 1,
            onClick = { channel = 1 },
        )
    }

    Spacer(Modifier.height(10.dp))

    SettingsCard {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            HsvSlider(
                label = "Barwa",
                value = draft.hue,
                range = 0f..360f,
                display = "${draft.hue.roundToInt()}°",
                onValueChange = { draft = draft.clamped().copy(hue = it) },
                onCommit = { commit(draft) },
            )
            HsvSlider(
                label = "Nasycenie",
                value = draft.saturation,
                range = 0f..1f,
                display = "${(draft.saturation * 100).roundToInt()}%",
                onValueChange = { draft = draft.clamped().copy(saturation = it) },
                onCommit = { commit(draft) },
            )
            HsvSlider(
                label = "Jasność",
                value = draft.value,
                range = 0.05f..1f,
                display = "${(draft.value * 100).roundToInt()}%",
                onValueChange = { draft = draft.clamped().copy(value = it) },
                onCommit = { commit(draft) },
            )
        }
    }

    Spacer(Modifier.height(8.dp))
    Text(
        text = "Motyw „Własny” działa po wybraniu go z listy powyżej. Widżety na " +
            "pulpicie biorą te same dwa kolory, więc nie trzeba ich dodawać od nowa.",
        style = MaterialTheme.typography.labelSmall,
        color = palette.textSoft,
    )
}

/** Wiersz wyboru jednego z dwóch kolorów motywu: nazwa, próbka i hex. */
@Composable
private fun ColorChannelRow(
    title: String,
    hint: String,
    hex: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val palette = LocalStylePalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .heightIn(min = 56.dp)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                color = palette.text,
            )
            Text(
                text = hint,
                style = MaterialTheme.typography.labelSmall,
                color = palette.textSoft,
            )
        }
        Text(
            text = hex.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = palette.textSoft,
        )
        Box(
            modifier = Modifier
                .size(24.dp)
                .clip(CircleShape)
                .background(Color(android.graphics.Color.parseColor(hex)))
                .border(
                    width = if (selected) 2.dp else 1.dp,
                    color = if (selected) palette.accent else palette.edge,
                    shape = CircleShape,
                ),
        )
        RadioMark(selected = selected)
    }
}

/** Jeden suwak HSV z podpisem i wartością po prawej. */
@Composable
private fun HsvSlider(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    display: String,
    onValueChange: (Float) -> Unit,
    onCommit: () -> Unit,
) {
    val palette = LocalStylePalette.current
    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.labelMedium,
                color = palette.textSoft,
            )
            Text(
                text = display,
                style = MaterialTheme.typography.labelMedium,
                color = palette.text,
            )
        }
        Slider(
            value = value.coerceIn(range),
            onValueChange = onValueChange,
            onValueChangeFinished = onCommit,
            valueRange = range,
        )
    }
}

/**
 * Jeden wiersz „Wyglądu” — **taki sam jak `.settings-style` w webie**:
 * tytuł (600 po zaznaczeniu), podpis 11 sp w kolorze text-soft, próbka koloru
 * i kółko wyboru z prawej (nasz `RadioMark`, nie `RadioButton` Material).
 */
@Composable
private fun StyleRow(
    label: String,
    hint: String,
    selected: Boolean,
    swatch: Color,
    onClick: () -> Unit,
) {
    val palette = LocalStylePalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .heightIn(min = 56.dp)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                letterSpacing = 0.25.sp,
                color = palette.text,
            )
            Text(
                text = hint,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                letterSpacing = 0.5.sp,
                color = palette.textSoft,
            )
        }
        Box(
            modifier = Modifier
                .size(14.dp)
                .clip(CircleShape)
                .background(swatch),
        )
        RadioMark(selected = selected)
    }
}

/**
 * „Wybór planu”: **ten sam panel** co na ekranie powitalnym (jeden otwarty krok,
 * zwinięte podsumowania) — bez drugiego zestawu wierszy i bez arkusza. Na dole
 * numer grupy dla starych linków, tak jak w webie.
 */
@Composable
private fun GroupPage(
    wizard: WizardContext,
    onBack: () -> Unit,
    actions: WizardActions,
    onChooseManual: (String) -> Unit,
) {
    var manual by rememberSaveable { mutableStateOf("") }
    val manualValid = manual.length in 2..8

    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
    ) {
        item {
            SettingsPageHeader(
                title = "Wybór planu",
                subtitle = "Rocznik, kierunek, specjalność i tryb.",
                onBack = onBack,
            )
            Spacer(Modifier.height(8.dp))
            PlanPickerPanel(context = wizard, actions = actions)
            Spacer(Modifier.height(20.dp))
            Text(
                text = "Albo wpisz numer grupy",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 4.dp, bottom = 6.dp),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = manual,
                    onValueChange = { value -> manual = value.filter(Char::isDigit).take(8) },
                    singleLine = true,
                    label = { Text("Numer grupy") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(10.dp))
                Button(onClick = { onChooseManual(manual) }, enabled = manualValid) {
                    Text("Ustaw")
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
