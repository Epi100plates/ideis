package pl.matiit.planzajec.ui.update

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import pl.matiit.planzajec.domain.Format
import pl.matiit.planzajec.ui.settings.SettingsCard
import pl.matiit.planzajec.ui.settings.SettingsDivider
import pl.matiit.planzajec.ui.settings.SettingsInfoRow
import pl.matiit.planzajec.ui.settings.SettingsPageHeader
import pl.matiit.planzajec.ui.settings.SettingsSwitchRow
import pl.matiit.planzajec.update.AppRelease
import pl.matiit.planzajec.update.UpdateState

/**
 * Okienko „jest nowa wersja”. Pojawia się samo (najwyżej raz na dobę dla tej
 * samej wersji) i prowadzi użytkownika za rękę: pobierz → zainstaluj.
 * Wydania obowiązkowego nie da się odłożyć, ale zawsze widać, dlaczego.
 */
@Composable
fun UpdateDialog(
    state: UpdateState,
    canInstall: Boolean,
    onDownloadAndInstall: () -> Unit,
    onOpenPermission: () -> Unit,
    onLater: () -> Unit,
    onSkip: () -> Unit,
) {
    val release = state.release ?: return
    val busy = state.downloading || state.checking

    AlertDialog(
        onDismissRequest = { if (!state.required) onLater() },
        title = {
            Column {
                Text("Nowa wersja ${release.versionName}", style = MaterialTheme.typography.titleLarge)
                Text(
                    text = "Masz wersję ${state.currentVersionName} (${state.currentVersionCode})",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        text = {
            Column {
                Text(
                    text = "${Format.fileSize(release.sizeBytes)} do pobrania z ideis.mati-it.pl.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (release.notes.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    release.notes.forEach { line ->
                        Row(Modifier.padding(bottom = 2.dp)) {
                            Text("•", style = MaterialTheme.typography.bodySmall)
                            Spacer(Modifier.size(6.dp))
                            Text(line, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }

                if (state.downloading) {
                    Spacer(Modifier.height(12.dp))
                    LinearProgressIndicator(
                        progress = { state.progress },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Pobieram… ${(state.progress * 100).toInt()}%",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                if (!canInstall) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = "Android wymaga zgody na instalowanie aplikacji z tego źródła. " +
                            "Po jej włączeniu wróć tutaj.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                state.error?.let { message ->
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                if (state.required) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = "Ta aktualizacja jest wymagana — starsze wersje nie są już wspierane.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = if (!canInstall) onOpenPermission else onDownloadAndInstall,
                enabled = !busy,
            ) {
                if (busy) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.size(8.dp))
                }
                Text(confirmLabel(state, canInstall))
            }
        },
        dismissButton = {
            if (!state.required) {
                Row {
                    TextButton(onClick = onLater) { Text("Później") }
                    TextButton(onClick = onSkip) { Text("Pomiń tę wersję") }
                }
            }
        },
    )
}

private fun confirmLabel(state: UpdateState, canInstall: Boolean): String = when {
    state.downloading -> "Pobieram…"
    !canInstall -> "Zezwól w ustawieniach"
    state.readyToInstall -> "Zainstaluj"
    state.error != null -> "Ponów"
    else -> "Pobierz i zainstaluj"
}

/**
 * Strona „Aktualizacje” w panelu ustawień. Wydzielona z jednego długiego
 * arkusza: najpierw stan (wersja, sprawdzenie), potem — tylko gdy jest po co —
 * dostępne wydanie z przyciskiem, a na końcu ustawienia pracy w tle.
 */
@Composable
fun UpdatesPage(
    state: UpdateState,
    nowMillis: Long,
    canInstall: Boolean,
    onBack: () -> Unit,
    onCheckNow: () -> Unit,
    onDownloadAndInstall: () -> Unit,
    onOpenPermission: () -> Unit,
    onSkip: () -> Unit,
    onClearSkip: () -> Unit,
    onAutoCheckChange: (Boolean) -> Unit,
    onAutoDownloadChange: (Boolean) -> Unit,
) {
    SettingsPageHeader(
        title = "Aktualizacje",
        subtitle = "Nowe wersje pochodzą z ideis.mati-it.pl, nie ze sklepu Play.",
        onBack = onBack,
    )

    // Wydanie tylko wtedy, gdy naprawdę jest nowsze — inaczej pokazujemy sam stan.
    val release = state.release?.takeIf { state.updateAvailable }

    SettingsCard {
        SettingsInfoRow(title = "Zainstalowana wersja", value = state.versionLabel)
        SettingsDivider()
        SettingsInfoRow(
            title = "Ostatnie sprawdzenie",
            value = Format.agoLabel(state.lastCheckAt, nowMillis) ?: "brak",
            hint = if (state.lastCheckAt <= 0L) "Sprawdzenie uruchomi się przy starcie." else null,
        )
        if (release != null) {
            SettingsDivider()
            SettingsInfoRow(
                title = "Dostępna wersja",
                value = release.versionName,
                hint = Format.fileSize(release.sizeBytes) +
                    if (state.downloaded != null) " · pobrana" else "",
            )
        }
    }

    Spacer(Modifier.height(12.dp))

    when {
        release != null -> {
            ReleaseCard(release, downloaded = state.downloaded != null)
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = if (!canInstall) onOpenPermission else onDownloadAndInstall,
                enabled = !state.downloading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    when {
                        state.downloading -> "Pobieram… ${(state.progress * 100).toInt()}%"
                        !canInstall -> "Zezwól na instalowanie"
                        state.readyToInstall -> "Zainstaluj ${release.versionName}"
                        else -> "Pobierz i zainstaluj ${release.versionName}"
                    },
                )
            }
            if (state.downloading) {
                LinearProgressIndicator(
                    progress = { state.progress },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
            }
            if (state.skippedVersion >= release.versionCode) {
                TextButton(onClick = onClearSkip) { Text("Pominięto tę wersję — przywróć") }
            } else {
                TextButton(onClick = onSkip) { Text("Pomiń tę wersję") }
            }
        }

        state.checking -> Row(verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
            Spacer(Modifier.size(10.dp))
            Text("Sprawdzam dostępność nowej wersji…", style = MaterialTheme.typography.bodyMedium)
        }

        else -> Text(
            text = state.error ?: "Masz najnowszą wersję.",
            style = MaterialTheme.typography.bodyMedium,
            color = if (state.error != null) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            modifier = Modifier.padding(horizontal = 4.dp),
        )
    }

    state.error?.takeIf { release != null }?.let { message ->
        Spacer(Modifier.height(8.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }

    Spacer(Modifier.height(16.dp))
    Text(
        text = "W tle",
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 4.dp, bottom = 6.dp),
    )
    SettingsCard {
        SettingsSwitchRow(
            title = "Sprawdzaj automatycznie",
            supporting = "Przy uruchomieniu i co 12 godzin w tle.",
            checked = state.autoCheck,
            onCheckedChange = onAutoCheckChange,
        )
        SettingsDivider()
        SettingsSwitchRow(
            title = "Pobieraj w tle",
            supporting = "Tylko przez Wi-Fi, żeby nie zużywać transmisji.",
            checked = state.autoDownload && state.autoCheck,
            enabled = state.autoCheck,
            onCheckedChange = onAutoDownloadChange,
        )
    }

    Spacer(Modifier.height(12.dp))
    OutlinedButton(
        onClick = onCheckNow,
        enabled = !state.checking && !state.downloading,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text("Sprawdź teraz")
    }
    Spacer(Modifier.height(10.dp))
    Text(
        text = "Aktualizacja nigdy nie instaluje się bez pytania — aplikacja " +
            "proponuje nową wersję, a systemowy instalator wymaga potwierdzenia.",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ReleaseCard(release: AppRelease, downloaded: Boolean) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(
                text = "Dostępna wersja ${release.versionName}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = buildString {
                    append(Format.fileSize(release.sizeBytes))
                    if (downloaded) append(" · pobrana, gotowa do instalacji")
                },
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (release.notes.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                release.notes.forEach { line ->
                    Row(Modifier.padding(bottom = 2.dp)) {
                        Text("•", style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.size(6.dp))
                        Text(line, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
