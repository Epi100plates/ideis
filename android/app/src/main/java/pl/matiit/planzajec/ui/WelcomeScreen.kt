package pl.matiit.planzajec.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import pl.matiit.planzajec.data.model.SelectionItemDto
import pl.matiit.planzajec.domain.PlanSelection
import pl.matiit.planzajec.domain.PlanWizard
import pl.matiit.planzajec.ui.selection.PlanPickerPanel
import pl.matiit.planzajec.ui.selection.WizardActions
import pl.matiit.planzajec.ui.selection.WizardContext
import pl.matiit.planzajec.ui.theme.LocalStylePalette

/**
 * Pierwszy ekran aplikacji — **ten sam panel wyboru co w wersji web**:
 * tytuł, nazwa wydziału i lista kroków, w której wybrane zwijają się do wiersza,
 * a otwarty jest tylko jeden. Bez „Wybierz plan”, bez arkusza i bez paska
 * kroków — ostatni wybór (tryb) sam przechodzi do planu bazowego.
 *
 * Numer grupy (dla starych linków) jest schowany za „Mam numer grupy”, jak
 * w webie, żeby nie konkurował z wyborem.
 */
@Composable
fun WelcomeScreen(
    state: PlanUiState,
    onLoadKierunki: () -> Unit,
    onChooseKierunek: (SelectionItemDto) -> Unit,
    onChooseNabor: (String) -> Unit,
    onChooseSpec: (SelectionItemDto?) -> Unit,
    onChooseTryb: (String) -> Unit,
    onChoosePlan: (String) -> Unit,
    onChooseGroup: (String, PlanSelection) -> Unit,
    onQueryChange: (String) -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var manualOpen by rememberSaveable { mutableStateOf(false) }
    var manual by rememberSaveable { mutableStateOf("") }
    val manualValid = manual.length in 2..8

    LaunchedEffect(Unit) { onLoadKierunki() }

    val context = state.wizardContext()
    val actions = WizardActions(
        onChooseKierunek = onChooseKierunek,
        onChooseNabor = onChooseNabor,
        onChooseSpec = onChooseSpec,
        onChooseTryb = onChooseTryb,
        onChoosePlan = onChoosePlan,
        onReset = onReset,
        onQueryChange = onQueryChange,
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .imePadding()
            .navigationBarsPadding(),
    ) {
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 24.dp),
        ) {
            item {
                WelcomeHeader(context)
                Spacer(Modifier.height(14.dp))
                PlanPickerPanel(context = context, actions = actions)
                Spacer(Modifier.height(14.dp))
                if (!manualOpen) {
                    TextButton(
                        onClick = { manualOpen = true },
                        contentPadding = PaddingValues(0.dp),
                    ) {
                        Text(
                            "Mam numer grupy",
                            color = LocalStylePalette.current.text,
                        )
                    }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = manual,
                            onValueChange = { value -> manual = value.filter(Char::isDigit).take(8) },
                            singleLine = true,
                            label = { Text("Albo numer grupy") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(8.dp))
                        Button(onClick = { onChooseGroup(manual, state.selection) }, enabled = manualValid) {
                            Text("Użyj")
                        }
                    }
                }
            }
        }
    }
}

/** Tytuł i wydział — nagłówek ekranu powitalnego w wersji web. */
@Composable
private fun WelcomeHeader(context: WizardContext) {
    // Cały ekran startowy mówi **jednym kolorem** (paleta motywu → `text`),
    // tak jak w webie, gdzie tytuł, wydział i etykiety kroków mają ten sam
    // odcień. Wcześniej tytuł był `onBackground`, a wydział `onSurfaceVariant`.
    val text = LocalStylePalette.current.text
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = "Plan zajęć",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.SemiBold,
            color = text,
        )
        Text(
            text = PlanWizard.FACULTY_LABEL,
            style = MaterialTheme.typography.labelMedium,
            color = text,
        )
    }
}
