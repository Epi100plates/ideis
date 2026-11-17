@file:OptIn(ExperimentalMaterial3Api::class)

package pl.matiit.planzajec.ui.materials

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.core.net.toUri
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import pl.matiit.planzajec.R
import pl.matiit.planzajec.core.PlanConfig
import pl.matiit.planzajec.data.local.MaterialDownloader
import pl.matiit.planzajec.data.model.AttachmentDto
import pl.matiit.planzajec.data.model.LinkDto
import pl.matiit.planzajec.data.readPickedFile
import pl.matiit.planzajec.data.remote.AttachmentUrls
import pl.matiit.planzajec.domain.Format

/**
 * Sekcja „Materiały i notatki” w szczegółach zajęć — odpowiednik sekcji z wersji
 * web: lista plików i linków, dodawanie własnego pliku (SAF) lub linku oraz
 * usuwanie z potwierdzeniem. Wszystko jest publiczne, bez logowania.
 */
@Composable
fun MaterialsSection(
    groupId: String,
    classId: String,
    modifier: Modifier = Modifier,
    onChanged: () -> Unit = {},
) {
    val context = LocalContext.current
    val viewModel: MaterialsViewModel = viewModel(
        key = "materials:$groupId:$classId",
        factory = MaterialsViewModel.Factory(context, groupId, classId),
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var showLinkDialog by rememberSaveable { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<PendingDelete?>(null) }

    // Każda zmiana listy (dodanie, usunięcie) odświeża indeks spinaczy w planie.
    LaunchedEffect(state.attachments.size, state.links.size) { onChanged() }

    val pickFile = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    context.readPickedFile(uri, state.limits?.maxFileBytes ?: 0L)
                }
            }
                .onSuccess(viewModel::upload)
                .onFailure {
                    viewModel.reportError(it.message ?: "Nie udało się odczytać pliku.")
                }
        }
    }

    LaunchedEffect(state.notice) {
        if (state.notice != null) {
            delay(2800)
            viewModel.consumeNotice()
        }
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "Materiały i notatki",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            TextButton(
                onClick = { pickFile.launch(arrayOf("*/*")) },
                enabled = !state.busy,
            ) { Text("+ Plik") }
            TextButton(
                onClick = { showLinkDialog = true },
                enabled = !state.busy,
            ) { Text("+ Link") }
        }

        // Licznik pod nagłówkiem: od razu widać, że do zajęć coś jest dołączone.
        if (!state.loading && (state.attachments.isNotEmpty() || state.links.isNotEmpty())) {
            Text(
                text = listOfNotNull(
                    state.attachments.takeIf { it.isNotEmpty() }
                        ?.let { Format.filesCount(it.size) },
                    state.links.takeIf { it.isNotEmpty() }
                        ?.let { Format.linksCount(it.size) },
                ).joinToString(" · "),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }

        if (state.busy) {
            LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp))
        }

        state.notice?.let { notice ->
            Text(
                text = notice,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(vertical = 4.dp),
            )
        }

        state.error?.let { error ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = error,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = viewModel::consumeError) { Text("OK") }
            }
        }

        if (state.loading) {
            Text(
                text = "Wczytuję materiały…",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(vertical = 8.dp),
            )
        } else if (state.attachments.isEmpty() && state.links.isEmpty()) {
            Text(
                text = "Brak materiałów. Dodaj plik lub link do notatek.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(vertical = 8.dp),
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                state.attachments.forEach { file ->
                    FileRow(
                        file = file,
                        onDownload = {
                            runCatching {
                                MaterialDownloader.enqueue(
                                    context,
                                    AttachmentUrls.download(PlanConfig.API_BASE, groupId, classId, file.id),
                                    file.name,
                                )
                            }
                                .onSuccess { viewModel.reportNotice("Pobieranie: ${file.name}") }
                                .onFailure { viewModel.reportError("Nie udało się rozpocząć pobierania.") }
                        },
                        onDelete = { pendingDelete = PendingDelete.File(file.id, file.name) },
                    )
                }
                state.links.forEach { link ->
                    LinkRow(
                        link = link,
                        onOpen = { openLink(context, link, viewModel) },
                        onDelete = { pendingDelete = PendingDelete.Link(link.id, link.title) },
                    )
                }
            }
        }
    }

    if (showLinkDialog) {
        AddLinkDialog(
            onDismiss = { showLinkDialog = false },
            onAdd = { url, title ->
                showLinkDialog = false
                viewModel.addLink(url, title)
            },
        )
    }

    pendingDelete?.let { pending ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Usunąć materiał?") },
            text = {
                Text(
                    "„${pending.name}” zniknie dla wszystkich, którzy widzą te zajęcia. " +
                        "Tej operacji nie można cofnąć.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    when (pending) {
                        is PendingDelete.File -> viewModel.deleteFile(pending.id)
                        is PendingDelete.Link -> viewModel.deleteLink(pending.id)
                    }
                    pendingDelete = null
                }) { Text("Usuń") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("Anuluj") }
            },
        )
    }
}

/**
 * Plik materiału jako **karta z ikoną typu**: nazwa jest największym tekstem,
 * typ/rozmiar/data drugim planem, a pobieranie to duży przycisk z ikoną
 * (cała karta też pobiera). Wcześniej był to ciąg tekstu z dwoma przyciskami
 * tekstowymi i separatorami — po otwarciu szczegółów ginął w reszcie ekranu.
 */
@Composable
private fun FileRow(
    file: AttachmentDto,
    onDownload: () -> Unit,
    onDelete: () -> Unit,
) {
    Surface(
        onClick = onDownload,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.30f),
        border = BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f),
        ),
        contentColor = MaterialTheme.colorScheme.onSurface,
    ) {
        Row(
            modifier = Modifier.padding(start = 10.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TypeBadge(text = file.ext.uppercase().take(4))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = file.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                val date = Format.isoDateShort(file.uploadedAt)
                val meta = buildString {
                    append(file.ext.uppercase())
                    append(" · ").append(Format.fileSize(file.size))
                    if (date != null) append(" · ").append(date)
                }
                Text(
                    text = meta,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(4.dp))
            IconButton(onClick = onDownload, modifier = Modifier.size(40.dp)) {
                Icon(
                    painter = painterResource(R.drawable.ic_download),
                    contentDescription = "Pobierz ${file.name}",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
            }
            IconButton(onClick = onDelete, modifier = Modifier.size(40.dp)) {
                Icon(
                    painter = painterResource(R.drawable.ic_delete),
                    contentDescription = "Usuń ${file.name}",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(19.dp),
                )
            }
        }
    }
}

/** Link do materiału — ta sama karta co plik, ale otwiera adres w przeglądarce. */
@Composable
private fun LinkRow(
    link: LinkDto,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
) {
    Surface(
        onClick = onOpen,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.30f),
        border = BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f),
        ),
        contentColor = MaterialTheme.colorScheme.onSurface,
    ) {
        Row(
            modifier = Modifier.padding(start = 10.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.tertiary.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_link),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.tertiary,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = link.title.ifBlank { link.url },
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = link.host ?: link.url,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(4.dp))
            IconButton(onClick = onDelete, modifier = Modifier.size(40.dp)) {
                Icon(
                    painter = painterResource(R.drawable.ic_delete),
                    contentDescription = "Usuń ${link.title}",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(19.dp),
                )
            }
        }
    }
}

/** Kwadratowa plakietka z typem pliku (PDF, DOCX…) w miejscu ikony. */
@Composable
private fun TypeBadge(text: String) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
private fun AddLinkDialog(
    onDismiss: () -> Unit,
    onAdd: (String, String?) -> Unit,
) {
    var url by rememberSaveable { mutableStateOf("") }
    var title by rememberSaveable { mutableStateOf("") }
    val valid = isHttpUrl(url)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Link do materiału") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it.trim() },
                    singleLine = true,
                    label = { Text("Adres (https://…)") },
                    isError = url.isNotEmpty() && !valid,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it.take(120) },
                    singleLine = true,
                    label = { Text("Tytuł (opcjonalnie)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    text = "Link jest widoczny dla wszystkich, którzy widzą te zajęcia.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onAdd(url, title.takeIf { it.isNotBlank() }) },
                enabled = valid,
            ) { Text("Dodaj") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Anuluj") }
        },
    )
}

private fun openLink(
    context: android.content.Context,
    link: LinkDto,
    viewModel: MaterialsViewModel,
) {
    if (!isHttpUrl(link.url)) {
        viewModel.reportError("Ten link nie jest poprawnym adresem http(s).")
        return
    }
    val intent = Intent(Intent.ACTION_VIEW, link.url.toUri())
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
        .onFailure { viewModel.reportError("Nie można otworzyć tego linku na telefonie.") }
}

fun isHttpUrl(value: String): Boolean {
    val trimmed = value.trim()
    return (trimmed.startsWith("http://") || trimmed.startsWith("https://")) &&
        trimmed.length > 8 &&
        !trimmed.contains(' ')
}

private sealed interface PendingDelete {
    val id: String
    val name: String

    data class File(override val id: String, override val name: String) : PendingDelete
    data class Link(override val id: String, override val name: String) : PendingDelete
}
