package pl.matiit.planzajec.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Strona „Propozycje / błędy” w panelu ustawień.
 *
 * Dwa wejścia: „Zaproponuj nową funkcję” i „Zgłoś błąd”. Oba otwierają to samo
 * okno z polem tekstowym — zgłoszenie jest anonimowe, bez konta i bez e-maila,
 * więc nie ma czego wypełniać poza samą treścią.
 */
@Composable
internal fun FeedbackPage(
    onPick: (FeedbackKind) -> Unit,
    onBack: () -> Unit,
) {
    SettingsPageHeader(
        title = "Propozycje / błędy",
        subtitle = "Anonimowo — bez logowania i bez adresu e-mail.",
        onBack = onBack,
    )

    SettingsCard {
        FeedbackKind.entries.forEachIndexed { index, kind ->
            if (index > 0) SettingsDivider()
            SettingsActionRow(
                title = kind.label,
                supporting = kind.hint,
                onClick = { onPick(kind) },
            )
        }
    }

    Spacer(Modifier.height(12.dp))
    Text(
        text = "Zgłoszenia trafiają prosto do autora planu — widać je na " +
            "ideis.mati-it.pl/propozycje. Nie zbieramy adresów e-mail ani " +
            "identyfikatorów urządzenia; dopisujemy tylko wersję aplikacji, " +
            "żeby wiedzieć, czego dotyczy problem.",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

/**
 * Okno wysyłki zgłoszenia. `send` jest zawieszeniowe (sieć), a wynik `null`
 * oznacza sukces — treść zostaje w polu po błędzie, żeby nic nie przepadło.
 */
@Composable
internal fun FeedbackDialog(
    kind: FeedbackKind,
    scope: CoroutineScope,
    onDismiss: () -> Unit,
    send: suspend (FeedbackKind, String) -> String?,
) {
    var text by remember(kind) { mutableStateOf("") }
    var sending by remember(kind) { mutableStateOf(false) }
    var error by remember(kind) { mutableStateOf<String?>(null) }
    var sent by remember(kind) { mutableStateOf(false) }

    val tooShort = text.trim().length < 3

    AlertDialog(
        onDismissRequest = { if (!sending) onDismiss() },
        title = { Text(kind.label) },
        text = {
            Column {
                if (sent) {
                    Text(
                        text = "Dziękuję! Zgłoszenie jest już u autora planu.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                } else {
                    Text(
                        text = kind.prompt,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = text,
                        onValueChange = {
                            text = it.take(2000)
                            error = null
                        },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3,
                        maxLines = 6,
                        enabled = !sending,
                        label = { Text("Treść") },
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.Sentences,
                        ),
                    )
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        error?.let {
                            Text(
                                text = it,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                        Spacer(Modifier.weight(1f))
                        Text(
                            text = "${text.length} / 2000",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        },
        confirmButton = {
            if (sent) {
                TextButton(onClick = onDismiss) { Text("Zamknij") }
            } else {
                TextButton(
                    enabled = !sending && !tooShort,
                    onClick = {
                        sending = true
                        error = null
                        val body = text
                        scope.launch {
                            val failure = try {
                                send(kind, body)
                            } catch (e: Exception) {
                                e.message ?: "Nie udało się wysłać zgłoszenia."
                            }
                            sending = false
                            if (failure == null) {
                                sent = true
                            } else {
                                error = failure
                            }
                        }
                    },
                ) {
                    if (sending) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(if (sending) "Wysyłam…" else "Wyślij")
                }
            }
        },
        dismissButton = {
            if (!sent) {
                TextButton(onClick = onDismiss, enabled = !sending) { Text("Anuluj") }
            }
        },
    )
}
