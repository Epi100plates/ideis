package pl.matiit.planzajec.ui.selection

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pl.matiit.planzajec.data.model.CohortDto
import pl.matiit.planzajec.data.model.GroupDto
import pl.matiit.planzajec.data.model.SelectionItemDto
import pl.matiit.planzajec.data.model.TrybDto
import pl.matiit.planzajec.domain.PickerSteps
import pl.matiit.planzajec.domain.PlanSelection
import pl.matiit.planzajec.domain.PlanWizard
import pl.matiit.planzajec.domain.SelectionLabels
import pl.matiit.planzajec.domain.WizardStep
import pl.matiit.planzajec.ui.theme.LocalStylePalette

/** Etykiety wyboru z formularza — do podpisu bez ładowania list. */
data class SiteLabels(
    val kierunekId: String = "",
    val kierunekLabel: String = "",
    val specId: String = "",
    val specLabel: String = "",
    val specSkipped: Boolean = false,
)

/** Wszystko, co panel wyboru potrzebuje do narysowania kroków. */
data class WizardContext(
    val selection: PlanSelection,
    val site: SiteLabels,
    val kierunki: List<SelectionItemDto> = emptyList(),
    /** Roczniki wybranego kierunku (z `/api/ideis/kierunki`). */
    val cohorts: List<CohortDto> = emptyList(),
    val specjalnosci: List<SelectionItemDto> = emptyList(),
    val noSpecGroups: Int = 0,
    val tryby: List<TrybDto> = emptyList(),
    val planCandidates: List<GroupDto> = emptyList(),
    /** Grupy bieżącego planu — pierwsza to baza (wykład). */
    val planGroups: List<String> = emptyList(),
    val academicYearStart: Int? = null,
    /** Wpisane litery w polu „Szukaj kierunku”. */
    val query: String = "",
    /** Lista specjalności już przyszła z serwera (web: `specsFor`). */
    val specsKnown: Boolean = false,
    /** Nota kroku „Plan” — np. gdy semestr był pusty i poluzowaliśmy filtr. */
    val planNote: String? = null,
    val loading: Boolean = false,
    val error: String? = null,
    val warning: String? = null,
)

/** Akcje panelu — wspólne dla ekranu powitalnego i Opcji → „Wybór planu”. */
data class WizardActions(
    val onChooseKierunek: (SelectionItemDto) -> Unit = {},
    val onChooseNabor: (String) -> Unit = {},
    val onChooseSpec: (SelectionItemDto?) -> Unit = {},
    val onChooseTryb: (String) -> Unit = {},
    val onChoosePlan: (String) -> Unit = {},
    /** „Zacznij od nowa” — czyści wybór, plan zostaje na ekranie. */
    val onReset: () -> Unit = {},
    /** Litery wpisane w polu szukania kierunku. */
    val onQueryChange: (String) -> Unit = {},
)

/** Podpis zwiniętego wiersza ('' = krok jeszcze nie wybrany). */
fun stepValue(context: WizardContext, step: WizardStep): String {
    val selection = context.selection
    return when (step) {
        WizardStep.NABOR -> if (selection.nabor.isNotBlank()) SelectionLabels.nabor(selection.nabor) else ""
        WizardStep.KIERUNEK -> if (selection.field.isNotBlank()) {
            context.site.kierunekLabel.ifBlank { selection.field }
        } else {
            ""
        }
        WizardStep.SPECJALNOSC -> when {
            selection.spec.isNotBlank() -> context.site.specLabel.ifBlank { selection.spec }
            context.site.specSkipped -> "bez specjalności"
            else -> ""
        }
        WizardStep.TRYB -> if (selection.mode.isNotBlank()) {
            SelectionLabels.MODE[selection.mode] ?: selection.mode
        } else {
            ""
        }
        WizardStep.PLAN -> ""
    }
}

private fun specDecided(context: WizardContext): Boolean =
    context.site.specId.isNotBlank() || context.site.specSkipped

private fun specsAvailable(context: WizardContext): Boolean =
    context.specjalnosci.any { !it.value.isNullOrBlank() && it.groups > 0 }

private fun firstIncomplete(context: WizardContext): WizardStep = PickerSteps.firstIncomplete(
    selection = context.selection,
    specDecided = specDecided(context),
    specsKnown = context.specsKnown,
    specsAvailable = specsAvailable(context),
)

/**
 * Panel wyboru planu — odpowiednik `.pick` z wersji web: **jeden otwarty krok**,
 * a wybrane kroki zwijają się do wiersza „Rocznik · 2026/2027 ›”. Kolejność,
 * podpisy i zachowanie są te same co w PWA (patrz `PickerSteps`).
 *
 * Ten sam komponent rysuje ekran powitalny i Opcje → „Wybór planu”, więc oba
 * miejsca nie mogą się już rozjechać.
 */
@Composable
fun PlanPickerPanel(
    context: WizardContext,
    actions: WizardActions,
    modifier: Modifier = Modifier,
) {
    // Otwarty krok trzymamy jako nazwę enuma — `rememberSaveable` nie zapisze
    // enuma wprost, a nazwa przeżywa obrót ekranu i zabicie procesu.
    var openStepName by rememberSaveable { mutableStateOf<String?>(null) }
    val requested = openStepName?.let { name -> WizardStep.entries.firstOrNull { it.name == name } }
    val visible = PickerSteps.visible(context.selection)
    val active = requested?.takeIf { it in visible } ?: firstIncomplete(context)

    // Po każdym wyborze wracamy do „pierwszego brakującego kroku” — dokładnie
    // tak jak `refreshPicker({ reveal: firstIncompleteStep() })` w webie.
    fun choose(run: () -> Unit) {
        openStepName = null
        run()
    }

    Column(modifier = modifier.fillMaxWidth()) {
        for (step in visible) {
            when {
                step == WizardStep.PLAN -> if (active == WizardStep.PLAN) {
                    PlanSection(context, actions, ::choose, onOpenStep = { openStepName = it?.name })
                }
                step == active -> StepSection(
                    step = step,
                    context = context,
                    actions = actions,
                    choose = ::choose,
                )
                stepValue(context, step).isNotEmpty() -> SummaryRow(
                    step = step,
                    value = stepValue(context, step),
                    onClick = { openStepName = step.name },
                )
            }
        }

        val warning = context.warning
        if (warning != null && active != WizardStep.PLAN) {
            Text(
                text = warning,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 4.dp, start = 2.dp, end = 2.dp),
            )
        }

        if (context.selection.nabor.isNotBlank()) {
            TextButton(
                onClick = { choose { actions.onReset() } },
                contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                modifier = Modifier.padding(top = 4.dp),
            ) {
                Text(
                "Zacznij od nowa",
                style = MaterialTheme.typography.labelLarge,
                color = LocalStylePalette.current.text,
            )
            }
        }
    }
}

/** Nagłówek otwartego kroku — małe, rozstrzelone wersaliki jak `.pick-head`. */
@Composable
private fun SectionHead(text: String) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 1.1.sp,
        color = LocalStylePalette.current.text,
        modifier = Modifier.padding(start = 2.dp, bottom = 10.dp),
    )
}

/** Zwinięty krok: etykieta po lewej, wybrana wartość po prawej i strzałka. */
@Composable
private fun SummaryRow(step: WizardStep, value: String, onClick: () -> Unit) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 46.dp)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = 2.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = step.label,
                style = MaterialTheme.typography.labelMedium,
                color = LocalStylePalette.current.text,
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.End,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(10.dp))
            Text(
                text = "›",
                style = MaterialTheme.typography.titleMedium,
                color = LocalStylePalette.current.text,
            )
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f))
    }
}

@Composable
private fun StepSection(
    step: WizardStep,
    context: WizardContext,
    actions: WizardActions,
    choose: (() -> Unit) -> Unit,
) {
    Column(modifier = Modifier.padding(top = 2.dp, bottom = 18.dp)) {
        SectionHead(step.label)
        when {
            context.loading -> Hint("Wczytuję…")
            context.error != null -> ErrorRow(context.error, onRetry = { actions.onChooseNabor(context.selection.nabor) })
            step == WizardStep.NABOR -> NaborStep(context, actions, choose)
            step == WizardStep.KIERUNEK -> KierunekStep(context, actions, choose)
            step == WizardStep.SPECJALNOSC -> SpecjalnoscStep(context, actions, choose)
            else -> TrybStep(context, actions, choose)
        }
    }
}

@Composable
private fun Hint(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = LocalStylePalette.current.text,
        modifier = Modifier.padding(start = 2.dp, bottom = 8.dp),
    )
}

@Composable
private fun ErrorRow(message: String, onRetry: () -> Unit) {
    Column {
        Text(
            text = message,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.padding(start = 2.dp),
        )
        TextButton(onClick = onRetry) { Text("Ponów") }
    }
}

@Composable
private fun NaborStep(context: WizardContext, actions: WizardActions, choose: (() -> Unit) -> Unit) {
    val cohorts = PickerSteps.cohortIndex(context.kierunki)
    if (cohorts.isEmpty()) {
        Hint("Katalog nie ma jeszcze roczników. Odśwież za chwilę.")
        return
    }
    SettingsListCard {
        cohorts.forEachIndexed { index, entry ->
            val year = PlanWizard.cohortYear(context.academicYearStart, entry.value)
            if (index > 0) RowDivider()
            ChoiceRow(
                title = SelectionLabels.nabor(entry.value),
                subtitle = "",
                meta = year?.let { "$it. rok" }.orEmpty(),
                selected = context.selection.nabor == entry.value,
                onClick = { choose { actions.onChooseNabor(entry.value) } },
            )
        }
    }
}

@Composable
private fun KierunekStep(context: WizardContext, actions: WizardActions, choose: (() -> Unit) -> Unit) {
    val all = PickerSteps.kierunkiInCohort(context.kierunki, context.selection.nabor)
    if (all.isEmpty()) {
        Hint("Ten rocznik nie ma kierunków w katalogu.")
        return
    }
    if (all.size >= PickerSteps.SEARCH_MIN) {
        SearchField(
            value = context.query,
            placeholder = "Szukaj kierunku",
            onChange = actions.onQueryChange,
        )
    }
    val shown = PickerSteps.rankKierunki(all, context.query)
    if (shown.isEmpty()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Hint("Brak kierunku dla „${context.query}”.")
            TextButton(onClick = { actions.onQueryChange("") }) { Text("Wyczyść") }
        }
        return
    }
    SettingsListCard {
        shown.forEachIndexed { index, item ->
            if (index > 0) RowDivider()
            ChoiceRow(
                title = item.label,
                subtitle = "",
                selected = item.field == context.selection.field,
                onClick = { choose { actions.onChooseKierunek(item) } },
            )
        }
    }
}

@Composable
private fun SpecjalnoscStep(context: WizardContext, actions: WizardActions, choose: (() -> Unit) -> Unit) {
    val available = context.specjalnosci.filter { !it.value.isNullOrBlank() && it.groups > 0 }
    val legacy = available.filter { it.source == "catalog" }
    val site = available.filter { it.source != "catalog" }
    SettingsListCard {
        ChoiceRow(
            title = "Pomiń specjalność",
            subtitle = "",
            selected = context.selection.spec.isBlank(),
            onClick = { choose { actions.onChooseSpec(null) } },
        )
        site.forEach { item ->
            RowDivider()
            ChoiceRow(
                title = item.label,
                subtitle = "",
                selected = context.selection.spec == item.value,
                onClick = { choose { actions.onChooseSpec(item) } },
            )
        }
        if (legacy.isNotEmpty()) {
            Text(
                text = "Starsze nazwy z planów",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.9.sp,
                color = LocalStylePalette.current.text,
                modifier = Modifier.padding(start = 14.dp, top = 12.dp, bottom = 4.dp),
            )
            legacy.forEach { item ->
                RowDivider()
                ChoiceRow(
                    title = item.label,
                    subtitle = "",
                    selected = context.selection.spec == item.value,
                    onClick = { choose { actions.onChooseSpec(item) } },
                )
            }
        }
    }
}

@Composable
private fun TrybStep(context: WizardContext, actions: WizardActions, choose: (() -> Unit) -> Unit) {
    val values = context.tryby.filter { it.value.isNotBlank() }
    if (values.isEmpty()) {
        Hint("Brak trybów dla tego wyboru — wróć i zmień rocznik.")
        return
    }
    SettingsListCard {
        values.forEachIndexed { index, tryb ->
            if (index > 0) RowDivider()
            ChoiceRow(
                title = SelectionLabels.MODE[tryb.value] ?: tryb.value,
                subtitle = "",
                selected = context.selection.mode == tryb.value,
                onClick = { choose { actions.onChooseTryb(tryb.value) } },
            )
        }
    }
}

@Composable
private fun PlanSection(
    context: WizardContext,
    actions: WizardActions,
    choose: (() -> Unit) -> Unit,
    onOpenStep: (WizardStep?) -> Unit,
) {
    Column(modifier = Modifier.padding(top = 2.dp)) {
        SectionHead(WizardStep.PLAN.label)
        if (context.planCandidates.isEmpty()) {
            Hint("Nie ma planu dla tego wyboru. Wróć i zmień rocznik albo tryb.")
            return@Column
        }
        val current = context.planGroups.firstOrNull().orEmpty()
        SettingsListCard {
            context.planCandidates.forEachIndexed { index, group ->
                if (index > 0) RowDivider()
                ChoiceRow(
                    title = group.code ?: group.name ?: "grupa ${group.id}",
                    subtitle = groupCaption(group),
                    selected = current == group.id,
                    onClick = { choose { actions.onChoosePlan(group.id) } },
                )
            }
        }
        context.planNote?.let { note ->
            Text(
                text = note,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 4.dp, start = 2.dp),
            )
        }
    }
}

/** Karta listy wyboru — ten sam materiał co `.settings-card` w webie. */
@Composable
private fun SettingsListCard(content: @Composable () -> Unit) {
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.55f),
        contentColor = LocalStylePalette.current.text,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column { content() }
    }
}

@Composable
private fun RowDivider() {
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
}

/** Pole „Szukaj kierunku” — pigułka jak `.wiz-search input` w webie. */
@Composable
private fun SearchField(value: String, placeholder: String, onChange: (String) -> Unit) {
    val border = if (value.isNotEmpty()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 10.dp)
            .heightIn(min = 44.dp)
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.55f), RoundedCornerShape(999.dp))
            .border(1.dp, border, RoundedCornerShape(999.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (value.isEmpty()) {
            Text(
                text = placeholder,
                style = MaterialTheme.typography.bodyMedium,
                color = LocalStylePalette.current.text,
            )
        }
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            textStyle = LocalTextStyle.current.merge(MaterialTheme.typography.bodyMedium).copy(
                color = LocalStylePalette.current.text,
            ),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/**
 * Jeden wiersz wyboru: kółko, tytuł i (opcjonalnie) podpis albo wartość po
 * prawej („3. rok”). Cały wiersz jest klikalny — trafienie w samo kółko byłoby
 * na telefonie zbyt trudne — ale zaznaczenie widać **w kółku**, jak w webie.
 */
@Composable
fun ChoiceRow(
    title: String,
    subtitle: String,
    selected: Boolean,
    enabled: Boolean = true,
    meta: String = "",
    role: Role = Role.RadioButton,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .selectable(
                selected = selected,
                enabled = enabled,
                role = role,
                onClick = onClick,
            )
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioMark(selected = selected, enabled = enabled)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                color = if (enabled) {
                    LocalStylePalette.current.text
                } else {
                    LocalStylePalette.current.text.copy(alpha = 0.6f)
                },
            )
            if (subtitle.isNotEmpty()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = LocalStylePalette.current.text,
                )
            }
        }
        if (meta.isNotEmpty()) {
            Spacer(Modifier.width(8.dp))
            Text(
                text = meta,
                style = MaterialTheme.typography.labelMedium,
                color = LocalStylePalette.current.text,
            )
        }
    }
}

/**
 * Kółko wyboru — ten sam wygląd co `.radio-mark` w webie: 20 dp, obwódka 2 dp,
 * a po zaznaczeniu wypełniona kropka w środku.
 */
@Composable
fun RadioMark(
    selected: Boolean,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    size: Dp = 20.dp,
    tint: Color = MaterialTheme.colorScheme.primary,
) {
    val border = when {
        selected -> tint
        enabled -> LocalStylePalette.current.textSoft
        else -> LocalStylePalette.current.textSoft.copy(alpha = 0.5f)
    }
    Box(
        modifier = modifier
            .size(size)
            .border(2.dp, border, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            Box(
                Modifier
                    .size(size / 2)
                    .background(tint, CircleShape),
            )
        }
    }
}

/** Polska odmiana liczebnika: 1 grupa, 2 grupy, 5 grup. */
fun countLabel(count: Int, one: String, few: String, many: String): String {
    val value = count.coerceAtLeast(0)
    if (value == 1) return one
    val rest = value % 10
    val tens = (value / 10) % 10
    return if (rest in 2..4 && tens != 1) few else many
}

/** „grupa 21613 · 3. rok · I stopnia · niestacjonarne · nabór 2024/2025”. */
fun groupCaption(group: GroupDto): String {
    val parts = mutableListOf("grupa ${group.id}")
    group.year?.let { parts += "$it. rok" }
    group.degree?.let { parts += SelectionLabels.DEGREE[it] ?: it }
    group.mode?.let { parts += SelectionLabels.MODE[it] ?: it }
    if (group.nabory.isNotEmpty()) {
        parts += "nabór ${SelectionLabels.nabor(group.nabory.max().toString())}"
    }
    return parts.joinToString(" · ")
}

/** Wiersz grupy w planie (z „Usuń”), używany w Opcjach → Plan. */
@Composable
fun PlanGroupRow(
    group: GroupDto?,
    groupId: String,
    isBase: Boolean,
    onRemove: (() -> Unit)?,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = group?.code ?: group?.name ?: "grupa $groupId",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                if (isBase) {
                    Spacer(Modifier.width(6.dp))
                    BaseBadge()
                }
            }
            Text(
                text = if (isBase) {
                    "wykład — zajęcia wspólne, wliczone automatycznie"
                } else {
                    group?.let { groupCaption(it) } ?: "grupa spoza katalogu"
                },
                style = MaterialTheme.typography.labelSmall,
                color = LocalStylePalette.current.text,
            )
        }
        if (onRemove != null) {
            TextButton(onClick = onRemove) { Text("Usuń") }
        }
    }
}

/** Plakietka „baza” przy grupie wykładowej — jak `.plan-base` w webie. */
@Composable
private fun BaseBadge() {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
        contentColor = MaterialTheme.colorScheme.primary,
    ) {
        Text(
            text = "BAZA",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.6.sp,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp),
        )
    }
}

/** Grupa do dodania — kółko zaznaczenia i rodzaj zajęć w tytule. */
@Composable
fun AddGroupRow(
    group: GroupDto,
    selected: Boolean,
    onToggle: () -> Unit,
) {
    ChoiceRow(
        title = addGroupTitle(group),
        subtitle = addGroupCaption(group),
        selected = selected,
        role = Role.Checkbox,
        onClick = onToggle,
    )
}

/** Tytuł wiersza do dodania: rodzaj zajęć + numer grupy („Laboratorium · gr. 1A”). */
fun addGroupTitle(group: GroupDto): String {
    val kind = PlanWizard.kindLabel(group.kind)
    val number = group.number?.takeIf { it.isNotBlank() }?.let { "gr. $it" }
    val label = listOfNotNull(kind, number).joinToString(" · ")
    return label.ifBlank { group.code ?: group.name ?: "grupa ${group.id}" }
}

/** Podpis wiersza do dodania: co odróżnia tę grupę od innych tego rodzaju. */
fun addGroupCaption(group: GroupDto): String {
    val parts = mutableListOf("grupa ${group.id}")
    group.year?.let { parts += "$it. rok" }
    group.semester?.let { parts += "$it. sem." }
    group.mode?.let { parts += SelectionLabels.MODE[it] ?: it }
    return parts.joinToString(" · ")
}
