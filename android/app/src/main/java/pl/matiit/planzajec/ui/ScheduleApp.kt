@file:OptIn(ExperimentalMaterial3Api::class)

package pl.matiit.planzajec.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.LocalDate
import java.time.LocalTime
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import pl.matiit.planzajec.R
import pl.matiit.planzajec.domain.ClassSlot
import pl.matiit.planzajec.domain.DaySchedule
import pl.matiit.planzajec.domain.AcademicYear
import pl.matiit.planzajec.domain.Format
import pl.matiit.planzajec.domain.NoteText
import pl.matiit.planzajec.domain.ScheduleViewMode
import pl.matiit.planzajec.domain.ScheduleWindow
import pl.matiit.planzajec.ui.components.EmptyMessage
import pl.matiit.planzajec.ui.components.Pill
import pl.matiit.planzajec.ui.components.TileBar
import pl.matiit.planzajec.ui.components.TileBarStyle
import pl.matiit.planzajec.ui.components.TileIndicator
import pl.matiit.planzajec.ui.components.TileStyle
import pl.matiit.planzajec.ui.components.animatedTileContentColor
import pl.matiit.planzajec.ui.components.animatedTileScale
import pl.matiit.planzajec.ui.components.rememberTileGrid
import pl.matiit.planzajec.ui.components.rememberTileHighlight
import pl.matiit.planzajec.ui.components.tileLag
import pl.matiit.planzajec.ui.materials.MaterialsSection
import pl.matiit.planzajec.ui.settings.SettingsPage
import pl.matiit.planzajec.ui.settings.SettingsSheet
import pl.matiit.planzajec.ui.theme.AuroraBackground
import pl.matiit.planzajec.ui.theme.LocalStylePalette
import pl.matiit.planzajec.ui.update.UpdateDialog
import pl.matiit.planzajec.ui.views.DayView
import pl.matiit.planzajec.ui.views.MonthView
import pl.matiit.planzajec.ui.views.SemesterView
import pl.matiit.planzajec.ui.views.WeekView
import pl.matiit.planzajec.update.UpdateManager
import pl.matiit.planzajec.widget.WidgetBridge

@Composable
fun ScheduleApp(viewModel: PlanViewModel, updates: UpdateManager) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val updateState by updates.state.collectAsStateWithLifecycle()
    var showSettings by rememberSaveable { mutableStateOf(false) }
    var settingsPage by rememberSaveable { mutableStateOf(SettingsPage.ROOT) }
    var showUpdateDialog by rememberSaveable { mutableStateOf(false) }
    var detail by remember { mutableStateOf<ClassSlot?>(null) }
    var selectedDateText by rememberSaveable { mutableStateOf<String?>(null) }
    val selectedDate = selectedDateText?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    val nowMinute = rememberCurrentMinute()
    val nowMillis = remember(nowMinute) { System.currentTimeMillis() }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // Zgoda „instaluj nieznane aplikacje” zmienia się poza aplikacją, więc
    // sprawdzamy ją przy każdym powrocie do ekranu.
    var canInstall by remember { mutableStateOf(updates.canInstall()) }

    LifecycleResumeEffect(viewModel) {
        viewModel.onResume()
        onPauseOrDispose { }
    }

    LifecycleResumeEffect(updates) {
        canInstall = updates.canInstall()
        onPauseOrDispose { }
    }

    // Nowe wydanie → jedno pytanie (albo od razu, gdy wersja jest obowiązkowa).
    // Ekran powitalny (wybór grupy) zasłania okienka, więc czekamy, aż
    // użytkownik go zamknie — inaczej pytanie przepadłoby do następnego startu.
    LaunchedEffect(
        updateState.release?.versionCode,
        updateState.currentVersionCode,
        state.needsGroupSelection,
    ) {
        if (!state.needsGroupSelection && !showUpdateDialog && updates.shouldPrompt()) {
            showUpdateDialog = true
            updates.markPrompted()
        }
    }

    val downloadAndInstall: () -> Unit = {
        if (!updates.canInstall()) {
            canInstall = false
        } else {
            scope.launch {
                if (updates.state.value.downloaded == null) {
                    updates.download()
                }
                // Instalator otwieramy tylko dla kompletnego pliku — błąd
                // pobrania zostaje w okienku z przyciskiem „Ponów”.
                if (updates.state.value.downloaded != null) {
                    updates.install()
                }
            }
        }
    }
    val openInstallPermission: () -> Unit = {
        runCatching { context.startActivity(updates.installPermissionIntent()) }
        Unit
    }

    val days = remember(state.slots) { ScheduleWindow.allDays(state.slots) }
    val onSelectDate: (LocalDate) -> Unit = { selectedDateText = it.toString() }

    LaunchedEffect(state.groupId) { selectedDateText = null }

    // Katalog kierunków trzymamy tylko w pamięci, a ekran powitalny pokazuje się
    // raz. Bez tego po restarcie aplikacji Opcje → „Wybór planu” otwierały się
    // z pustą listą („Brak listy kierunków”), więc nie dało się zmienić planu.
    LaunchedEffect(showSettings) {
        if (showSettings) viewModel.loadKierunki()
    }

    Box(Modifier.fillMaxSize()) {
        AuroraBackground(LocalStylePalette.current)

        if (state.needsGroupSelection) {
            WelcomeScreen(
                state = state,
                onLoadKierunki = { viewModel.loadKierunki() },
                onChooseKierunek = viewModel::chooseKierunek,
                onChooseNabor = viewModel::chooseNabor,
                onChooseSpec = viewModel::chooseSpec,
                onChooseTryb = viewModel::chooseTryb,
                onChoosePlan = viewModel::finishWizard,
                onChooseGroup = { groupId, selection -> viewModel.selectGroup(groupId, selection) },
                onQueryChange = viewModel::setPickerQuery,
                onReset = viewModel::resetPicker,
            )
            return@Box
        }

        Scaffold(
            containerColor = Color.Transparent,
            contentColor = MaterialTheme.colorScheme.onBackground,
            topBar = {
                // Własny, kompaktowy nagłówek zamiast `TopAppBar`: Material
                // trzyma tam 64 dp wysokości i własne odstępy, a tutaj liczy
                // się każde kilka dp na plan. Tytuł i podtytuł mają ciaśniejsze
                // interlinie, przyciski zostały bez zmian.
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(start = 20.dp, end = 4.dp, top = 2.dp, bottom = 0.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .padding(top = 2.dp, bottom = 2.dp),
                        ) {
                            Text(
                                text = "Plan zajęć",
                                style = MaterialTheme.typography.titleLarge,
                                maxLines = 1,
                            )
                            Text(
                                text = subtitleOf(state),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                        }
                        TextButton(onClick = viewModel::refresh) { Text("Odśwież") }
                        // Skrótu do wyboru planu tu nie ma: plan zmienia się
                        // **tylko** z Opcji (Opcje → Plan → „Wybór planu”),
                        // tak samo jak w wersji web.
                    }
                }
            },
            bottomBar = {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    ViewTabs(
                        current = state.viewMode,
                        onSelect = viewModel::selectViewMode,
                        onOpenOptions = {
                            settingsPage = SettingsPage.ROOT
                            showSettings = true
                        },
                        optionsBadge = updateState.showsBadge,
                    )
                }
            },
        ) { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
            ) {
                PullToRefreshBox(
                    isRefreshing = state.refreshing,
                    onRefresh = viewModel::refresh,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    when {
                        state.loading && state.slots.isEmpty() -> LoadingBlock()

                        state.error != null && state.slots.isEmpty() -> ErrorBlock(
                            message = state.error.orEmpty(),
                            onRetry = viewModel::refresh,
                        )

                        days.isEmpty() -> EmptyMessage(
                            title = "Ten plan nie ma zajęć",
                            body = "Wybrany rocznik lub grupa nie mają zajęć w planie uczelni. " +
                                "Na starszych rocznikach to normalne — plan bywa już zamknięty.",
                            actionLabel = "Zmień rocznik lub plan",
                            onAction = {
                                settingsPage = SettingsPage.GROUP
                                showSettings = true
                            },
                            modifier = Modifier.fillMaxSize(),
                        )

                        else -> ScheduleContent(
                            mode = state.viewMode,
                            days = days,
                            today = state.today,
                            selectedDate = selectedDate,
                            onSelectDate = onSelectDate,
                            nowMinute = nowMinute,
                            classesWithAttachments = state.classesWithAttachments,
                            notes = state.notes,
                            onClassClick = { detail = it },
                            onOpenDay = { date ->
                                onSelectDate(date)
                                viewModel.selectViewMode(ScheduleViewMode.DAY)
                            },
                        )
                    }
                }
            }
        }

        detail?.let { slot ->
            ClassDetailSheet(
                slot = slot,
                groupId = state.groupId,
                today = state.today,
                note = state.notes[slot.id],
                onSaveNote = { text -> viewModel.saveNote(slot.id, text) },
                onDismiss = { detail = null },
                onAttachmentsChanged = viewModel::refreshAttachmentIndex,
            )
        }

        if (showUpdateDialog && updateState.release != null && updateState.updateAvailable) {
            UpdateDialog(
                state = updateState,
                canInstall = canInstall,
                onDownloadAndInstall = downloadAndInstall,
                onOpenPermission = openInstallPermission,
                onLater = { showUpdateDialog = false },
                onSkip = {
                    updates.skipCurrentRelease()
                    showUpdateDialog = false
                },
            )
        }

        // Po pierwszej konfiguracji pytamy o własne grupy — tak samo jak web
        // („Dodaj grupy / Pomiń”). Bez tego użytkownik widziałby tylko
        // wykłady i nie wiedział, że ćwiczenia można dodać.
        if (state.showAddGroupsPrompt) {
            AlertDialog(
                onDismissRequest = viewModel::dismissAddGroupsPrompt,
                title = { Text("Dodaj swoje grupy") },
                text = {
                    Text(
                        "Wykłady są wliczone automatycznie. Dodaj swoją grupę ćwiczeniową, " +
                            "laboratoria i lektorat — plan złoży je w jeden.",
                    )
                },
                confirmButton = {
                    TextButton(onClick = {
                        viewModel.dismissAddGroupsPrompt()
                        settingsPage = SettingsPage.ADD
                        showSettings = true
                    }) { Text("Dodaj grupy") }
                },
                dismissButton = {
                    TextButton(onClick = viewModel::dismissAddGroupsPrompt) { Text("Pomiń") }
                },
            )
        }

        if (showSettings) {
            SettingsSheet(
                groupLabel = state.planLabel
                    ?: "grupa ${state.groupId}",
                groupId = state.groupId,
                groups = state.groups,
                planGroups = state.planGroups,
                addableGroups = state.addableGroups,
                selectionSummary = state.selectionSummary(),
                wizard = state.wizardContext(),
                savedAtMillis = state.savedAtMillis,
                nowMillis = nowMillis,
                offline = state.offline,
                refreshing = state.refreshing,
                styleId = state.styleId,
                updateState = updateState,
                canInstall = canInstall,
                initialPage = settingsPage,
                onDismiss = {
                    showSettings = false
                    // Zamknięcie Opcji bez wyboru planu cofa szkic pickera —
                    // karta „Plan” i „Dodaj grupy” mówią znów o planie.
                    viewModel.restoreAppliedSelection()
                },
                onChooseKierunek = viewModel::chooseKierunek,
                onChooseNabor = viewModel::chooseNabor,
                onChooseSpec = viewModel::chooseSpec,
                onChooseTryb = viewModel::chooseTryb,
                onChoosePlan = { id ->
                    showSettings = false
                    viewModel.finishWizard(id)
                },
                onPickerQueryChange = viewModel::setPickerQuery,
                onResetPicker = viewModel::resetPicker,
                onSelectGroup = { groupId, selection ->
                    showSettings = false
                    viewModel.selectGroup(groupId, selection)
                },
                onRemoveGroup = viewModel::removeGroup,
                onAddGroups = viewModel::addGroups,
                onSelectStyle = viewModel::selectStyle,
                onRefresh = viewModel::refresh,
                onCheckNow = { scope.launch { updates.check(force = true) } },
                onDownloadAndInstall = downloadAndInstall,
                onOpenPermission = openInstallPermission,
                onSkip = updates::skipCurrentRelease,
                onClearSkip = updates::clearSkip,
                onAutoCheckChange = updates::setAutoCheck,
                onAutoDownloadChange = updates::setAutoDownload,
                onSendFeedback = viewModel::sendFeedback,
                onLoadWidgets = { WidgetBridge.instances(context) },
                onPinWidget = { kind -> WidgetBridge.pin(context, kind) },
                onConfigureWidget = { id ->
                    context.startActivity(WidgetBridge.configureIntent(context, id))
                },
            )
        }

        // „Co nowego” pojawia się po aktualizacji — ale nie przykrywa okna
        // aktualizacji ani ekranu wyboru grupy.
        if (
            state.whatsNew.isNotEmpty() &&
            !state.needsGroupSelection &&
            !showUpdateDialog &&
            !showSettings
        ) {
            WhatsNewSheet(
                notes = state.whatsNew,
                onDismiss = viewModel::markWhatsNewSeen,
            )
        }
    }
}

/**
 * Kafelki na dole ekranu — **ikona + etykieta**, jak dolna nawigacja wersji
 * web (Dzień/Tydzień/Miesiąc/Semestr + Filtry). Pasek jest zaokrągloną,
 * półprzezroczystą pigułką; wybrany kafelek dostaje delikatne tło akcentu,
 * a przy zmianie widoku podświetlenie **przesuwa się** płynnie na nową
 * pozycję (`animateRectAsState`), zamiast przeskakiwać.
 * Piąty kafelek („Opcje”) otwiera arkusz ustawień — jak „Filtry” w web —
 * dzięki czemu nad planem nie ma już paska stanu ani przycisku „Styl”.
 */
@Composable
private fun ViewTabs(
    current: ScheduleViewMode,
    onSelect: (ScheduleViewMode) -> Unit,
    onOpenOptions: () -> Unit,
    optionsBadge: Boolean,
    modifier: Modifier = Modifier,
) {
    val modes = ScheduleViewMode.entries
    val selectedIndex = modes.indexOf(current).coerceAtLeast(0)
    val tiles = modes.size + 1 // cztery widoki + „Opcje”
    var track by remember { mutableStateOf(IntSize.Zero) }
    val grid = rememberTileGrid(track, count = tiles)
    val highlight = rememberTileHighlight(grid, selectedIndex)

    TileBar(
        modifier = modifier,
        trackModifier = Modifier.onSizeChanged { track = it },
        indicator = { highlight?.let { TileIndicator(it, TileBarStyle.Floating) } },
    ) {
        modes.forEachIndexed { index, mode ->
            val selected = mode == current
            val contentColor = animatedTileContentColor(selected)
            val scale = animatedTileScale(selected)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(TileStyle.radius))
                    // Podświetlenie rysuje cały pasek, więc kafelek nie ma
                    // własnego tła — inaczej animacja byłaby zasłonięta.
                    // `selectable` z rolą zakładki: TalkBack czyta „Dzień,
                    // wybrany, zakładka”, a nie samą etykietę.
                    .selectable(
                        selected = selected,
                        role = Role.Tab,
                        onClick = { onSelect(mode) },
                    )
                    .tileLag(highlight, grid, index)
                    .padding(vertical = 7.dp)
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(
                    painter = painterResource(viewIcon(mode)),
                    contentDescription = null,
                    tint = contentColor,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    text = mode.label,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                    color = contentColor,
                    maxLines = 1,
                )
            }
        }

        // Piąty kafelek nie jest trybem widoku, więc zamiast `selectable`
        // dostaje zwykły przycisk — TalkBack nie ogłasza go jako zakładki.
        Column(
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(TileStyle.radius))
                .clickable(role = Role.Button, onClick = onOpenOptions)
                .padding(vertical = 7.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            BadgedBox(
                badge = {
                    if (optionsBadge) {
                        Badge(containerColor = MaterialTheme.colorScheme.primary)
                    }
                },
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_options),
                    contentDescription = if (optionsBadge) {
                        "Opcje — dostępna nowa wersja"
                    } else {
                        "Opcje"
                    },
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.height(3.dp))
            Text(
                text = "Opcje",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
    }
}

/** Ikona kafelka — rysunki przeniesione z sprite'a SVG wersji web. */
private fun viewIcon(mode: ScheduleViewMode): Int = when (mode) {
    ScheduleViewMode.DAY -> R.drawable.ic_view_day
    ScheduleViewMode.WEEK -> R.drawable.ic_view_week
    ScheduleViewMode.MONTH -> R.drawable.ic_view_month
    ScheduleViewMode.SEMESTR -> R.drawable.ic_view_semester
}

@Composable
private fun ScheduleContent(
    mode: ScheduleViewMode,
    days: List<DaySchedule>,
    today: LocalDate,
    selectedDate: LocalDate?,
    onSelectDate: (LocalDate) -> Unit,
    nowMinute: Int,
    classesWithAttachments: Set<String>,
    notes: Map<String, String>,
    onClassClick: (ClassSlot) -> Unit,
    onOpenDay: (LocalDate) -> Unit,
) {
    when (mode) {
        ScheduleViewMode.DAY -> DayView(
            days = days,
            today = today,
            selectedDate = selectedDate,
            onSelectDate = onSelectDate,
            nowMinute = nowMinute,
            onClassClick = onClassClick,
            classesWithAttachments = classesWithAttachments,
            notes = notes,
        )

        ScheduleViewMode.WEEK -> WeekView(
            days = days,
            today = today,
            selectedDate = selectedDate,
            onSelectDate = onSelectDate,
            onClassClick = onClassClick,
        )

        ScheduleViewMode.MONTH -> MonthView(
            days = days,
            today = today,
            selectedDate = selectedDate,
            onSelectDate = onSelectDate,
            onClassClick = onClassClick,
            classesWithAttachments = classesWithAttachments,
        )

        ScheduleViewMode.SEMESTR -> SemesterView(
            days = days,
            today = today,
            onOpenDay = onOpenDay,
        )
    }
}

@Composable
private fun LoadingBlock() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        LinearProgressIndicator(Modifier.fillMaxWidth(0.6f))
        Spacer(Modifier.height(12.dp))
        Text("Pobieram plan…", style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun ErrorBlock(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Nie udało się pobrać planu",
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))
        Button(onClick = onRetry) { Text("Ponów") }
    }
}


@Composable
private fun ClassDetailSheet(
    slot: ClassSlot,
    groupId: String,
    today: LocalDate,
    note: String? = null,
    onSaveNote: suspend (String) -> String? = { null },
    onDismiss: () -> Unit,
    onAttachmentsChanged: () -> Unit = {},
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(horizontal = 24.dp)
                .padding(bottom = 24.dp),
        ) {
            Text(
                text = slot.subject,
                style = MaterialTheme.typography.headlineSmall,
                // Nazwa w jednej linii: czcionka schodzi z 24 do 18 sp, zamiast
                // łamać tytuł na dwie linie (spójnie z kartami w planie).
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                autoSize = TextAutoSize.StepBased(
                    minFontSize = 16.sp,
                    maxFontSize = 24.sp,
                    stepSize = 1.sp,
                ),
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                slot.form?.let {
                    Pill(
                        text = it,
                        container = MaterialTheme.colorScheme.secondaryContainer,
                        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                    )
                }
                Format.modeLabel(slot.mode)?.let {
                    Pill(
                        text = it,
                        container = MaterialTheme.colorScheme.tertiaryContainer,
                        contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                    )
                }
                val duration = Format.duration(slot.durationMinutes)
                if (duration.isNotEmpty()) {
                    Pill(
                        text = duration,
                        container = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(16.dp))

            DetailRow("Termin", "${Format.dayTitle(slot.date)} · ${Format.timeRange(slot)}")
            slot.room?.let { DetailRow("Sala", it) }
            slot.lecturer?.let { DetailRow("Prowadzący", it) }
            slot.group?.let { DetailRow("Grupa", it) }
            slot.notes?.let { DetailRow("Uwagi", it) }

            NoteEditor(note = note, onSave = onSaveNote)

            Spacer(Modifier.height(14.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(10.dp))

            MaterialsSection(
                groupId = groupId,
                classId = slot.id,
                onChanged = onAttachmentsChanged,
            )

            Spacer(Modifier.height(10.dp))
            TextButton(onClick = onDismiss) { Text("Zamknij") }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(110.dp),
        )
        Text(text = value, style = MaterialTheme.typography.bodyMedium)
    }
}

/**
 * Edytor notatki na kafelku („Kolos”, „Egzamin`) — w szczegółach zajęć.
 *
 * Notatka jest wspólna, więc pod polem stoi wprost: „widoczna dla wszystkich,
 * którzy widzą te zajęcia”. Chipy zapisują jednym dotknięciem (najczęstszy
 * przypadek), a własny tekst wpisuje się w polu obok. Limit 15 znaków pilnuje
 * pole ([NoteText.clamp]) i serwer — bez tego dałoby się wysłać dłuższy tekst
 * z klawiatury, która nie respektuje `maxLength`.
 */
@Composable
private fun NoteEditor(
    note: String?,
    onSave: suspend (String) -> String?,
) {
    // `remember(note)` czyści pole, gdy notatka przyszła z serwera (np. po
    // odświeżeniu z innego telefonu) albo gdy serwer przyciął tekst.
    var text by remember(note) { mutableStateOf(note.orEmpty()) }
    var status by remember { mutableStateOf(NOTE_HINT) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun save(value: String) {
        if (busy) return
        busy = true
        status = "Zapisuję…"
        scope.launch {
            val error = onSave(value)
            busy = false
            status = if (error == null) {
                if (NoteText.sanitize(value).isBlank()) "Notatka usunięta." else NOTE_SAVED
            } else {
                error
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "Notatka na kafelku",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "maks. ${NoteText.MAX_LENGTH} znaków",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = text,
                onValueChange = { text = NoteText.clamp(it) },
                singleLine = true,
                placeholder = { Text("np. Kolos") },
                textStyle = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            TextButton(onClick = { save(text) }, enabled = !busy) { Text("Zapisz") }
        }
        Spacer(Modifier.height(8.dp))
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NoteChip("Kolos") {
                text = "Kolos"
                save("Kolos")
            }
            NoteChip("Egzamin") {
                text = "Egzamin"
                save("Egzamin")
            }
            if (text.isNotBlank() || !note.isNullOrBlank()) {
                NoteChip("Usuń", muted = true) {
                    text = ""
                    save("")
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = status,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Chip notatki — pigułka w kolorze akcentu motywu (jak w wersji web). */
@Composable
private fun NoteChip(label: String, muted: Boolean = false, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(50),
        color = if (muted) Color.Transparent else MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
        contentColor = if (muted) {
            MaterialTheme.colorScheme.onSurfaceVariant
        } else {
            MaterialTheme.colorScheme.onSurface
        },
        border = BorderStroke(
            1.dp,
            if (muted) {
                MaterialTheme.colorScheme.outlineVariant
            } else {
                MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
            },
        ),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
        )
    }
}

private const val NOTE_HINT = "Widoczna dla wszystkich, którzy widzą te zajęcia."
private const val NOTE_SAVED = "Zapisano — notatka jest na kafelku."

@Composable
private fun rememberCurrentMinute(): Int {
    var minute by remember { mutableIntStateOf(currentMinute()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            minute = currentMinute()
        }
    }
    return minute
}

private fun currentMinute(): Int = LocalTime.now().let { it.hour * 60 + it.minute }

/**
 * Podtytuł nagłówka: grupa, a przy planie starszego naboru także rok akademicki.
 * Ten sam numer grupy ma inny plan w każdym roczniku — bez tego nie widać,
 * że ogląda się np. plan 2024/2025 zamiast bieżącego.
 */
private fun subtitleOf(state: PlanUiState): String {
    val group = state.planLabel
    val ay = state.target.academicYear ?: return group
    return "$group · ${AcademicYear.label(ay)}"
}
