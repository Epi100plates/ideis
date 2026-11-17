package pl.matiit.planzajec.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import kotlinx.coroutines.launch
import pl.matiit.planzajec.widget.WidgetInstance
import pl.matiit.planzajec.widget.WidgetKind
import pl.matiit.planzajec.widget.lookTitle

/**
 * Strona „Widżety” w panelu ustawień: dodawanie widżetu na pulpit i zmiana
 * wyglądu już stojących kopii.
 *
 * Powód istnienia: od Androida 14 launchery potrafią zablokować systemowe
 * okno konfiguracji widżetu (BAL), więc dodawanie i edycja z poziomu pulpitu
 * bywają niedostępne. Tutaj oba działania nie zależą od launchera: przypięcie
 * obsługuje system, a konfigurator uruchamiamy z widocznej aktywności aplikacji.
 */
@Composable
internal fun WidgetsPage(
    loadInstances: suspend () -> List<WidgetInstance>,
    onPin: suspend (WidgetKind) -> Boolean,
    onConfigure: (Int) -> Unit,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var instances by remember { mutableStateOf<List<WidgetInstance>?>(null) }
    var pinning by remember { mutableStateOf<WidgetKind?>(null) }
    var message by remember { mutableStateOf<String?>(null) }

    suspend fun reload() {
        instances = runCatching { loadInstances() }.getOrDefault(emptyList())
    }

    // Lista zmienia się poza aplikacją (launcher dodaje i usuwa widżety), więc
    // odświeżamy ją przy każdym powrocie — także z konfiguratora wyglądu.
    LifecycleResumeEffect(Unit) {
        scope.launch { reload() }
        onPauseOrDispose { }
    }

    SettingsPageHeader(
        title = "Widżety",
        subtitle = "Dodawanie na pulpit i wygląd każdej kopii.",
        onBack = onBack,
    )

    Text(
        text = "Dodaj na pulpit",
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 4.dp, bottom = 6.dp),
    )
    SettingsCard {
        WidgetKind.entries.forEachIndexed { index, kind ->
            if (index > 0) SettingsDivider()
            SettingsActionRow(
                title = kind.title,
                supporting = if (pinning == kind) "Czekam na launcher…" else kind.hint,
                enabled = pinning == null,
                onClick = {
                    scope.launch {
                        pinning = kind
                        message = null
                        val added = onPin(kind)
                        pinning = null
                        if (!added) message = NOT_SUPPORTED
                        reload()
                    }
                },
            )
        }
    }

    Spacer(Modifier.height(14.dp))
    Text(
        text = "Na pulpicie",
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 4.dp, bottom = 6.dp),
    )
    val list = instances
    when {
        list == null -> SettingsCard {
            SettingsInfoRow(title = "Sprawdzam pulpit", value = "…")
        }

        list.isEmpty() -> SettingsCard {
            SettingsInfoRow(title = "Brak widżetów", value = "dodaj powyżej")
        }

        else -> SettingsCard {
            list.forEachIndexed { index, instance ->
                if (index > 0) SettingsDivider()
                WidgetInstanceRow(
                    instance = instance,
                    onConfigure = { onConfigure(instance.appWidgetId) },
                )
            }
        }
    }

    message?.let { text ->
        Spacer(Modifier.height(10.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.error,
        )
    }

    Spacer(Modifier.height(12.dp))
    Text(
        text = "Wygląd zapisuje się od razu — widżet przerysowuje się po powrocie " +
            "na pulpit. Jeśli launcher nie pokazuje okna wyglądu przy dodawaniu " +
            "widżetu, zmień go tutaj.",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun WidgetInstanceRow(instance: WidgetInstance, onConfigure: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onConfigure)
            .heightIn(min = 56.dp)
            .padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(text = instance.kind.title, style = MaterialTheme.typography.bodyMedium)
            Text(
                text = lookTitle(instance.look),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        TextButton(onClick = onConfigure) { Text("Zmień wygląd") }
    }
}

private const val NOT_SUPPORTED =
    "Launcher nie obsługuje dodawania widżetu z aplikacji — dodaj go z listy widżetów na pulpicie."
