package pl.matiit.planzajec.ui.materials

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import pl.matiit.planzajec.data.AttachmentsRepository
import pl.matiit.planzajec.data.PickedFile
import pl.matiit.planzajec.data.PlanGraph
import pl.matiit.planzajec.data.model.AttachmentDto
import pl.matiit.planzajec.data.model.AttachmentLimitsDto
import pl.matiit.planzajec.data.model.LinkDto
import pl.matiit.planzajec.data.remote.AttachmentException

data class MaterialsUiState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val attachments: List<AttachmentDto> = emptyList(),
    val links: List<LinkDto> = emptyList(),
    val limits: AttachmentLimitsDto? = null,
    val error: String? = null,
    val notice: String? = null,
)

/**
 * Stan sekcji „Materiały i notatki” w szczegółach zajęć. Lista jest pobierana
 * przy każdym otwarciu, a po każdej zmianie odświeżana z serwera — dzięki temu
 * pliki dodane z drugiego telefonu widać od razu.
 */
class MaterialsViewModel(
    private val groupId: String,
    private val classId: String,
    private val repository: AttachmentsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(MaterialsUiState())
    val state: StateFlow<MaterialsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = it.attachments.isEmpty() && it.links.isEmpty(), error = null) }
            runCatching { withContext(Dispatchers.IO) { repository.list(groupId, classId) } }
                .onSuccess(::apply)
                .onFailure { error ->
                    _state.update {
                        it.copy(
                            loading = false,
                            busy = false,
                            error = error.userMessage(),
                        )
                    }
                }
        }
    }

    fun upload(file: PickedFile) {
        val limit = _state.value.limits?.maxFileBytes ?: 0L
        if (limit > 0 && file.bytes.size > limit) {
            _state.update { it.copy(error = "Plik jest za duży (limit ${limit / (1024 * 1024)} MB).") }
            return
        }
        mutate("Dodaję ${file.name}…", "Dodano materiał.") {
            repository.upload(groupId, classId, file.name, file.bytes)
        }
    }

    fun addLink(url: String, title: String?) {
        mutate("Dodaję link…", "Dodano link do materiałów.") {
            repository.addLink(groupId, classId, url, title)
        }
    }

    fun deleteFile(id: String) {
        mutate("Usuwam plik…", "Usunięto plik.") {
            repository.deleteFile(groupId, classId, id)
        }
    }

    fun deleteLink(id: String) {
        mutate("Usuwam link…", "Usunięto link.") {
            repository.deleteLink(groupId, classId, id)
        }
    }

    fun consumeNotice() {
        _state.update { it.copy(notice = null) }
    }

    fun consumeError() {
        _state.update { it.copy(error = null) }
    }

    fun reportError(message: String) {
        _state.update { it.copy(error = message, busy = false) }
    }

    fun reportNotice(message: String) {
        _state.update { it.copy(notice = message) }
    }

    private fun mutate(
        busyMessage: String,
        successMessage: String,
        action: suspend () -> pl.matiit.planzajec.data.model.AttachmentListDto,
    ) {
        if (_state.value.busy) return
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = null, notice = busyMessage) }
            runCatching { withContext(Dispatchers.IO) { action() } }
                .onSuccess { result ->
                    apply(result)
                    _state.update { it.copy(busy = false, notice = successMessage) }
                }
                .onFailure { error ->
                    _state.update { it.copy(busy = false, notice = null, error = error.userMessage()) }
                }
        }
    }

    private fun apply(result: pl.matiit.planzajec.data.model.AttachmentListDto) {
        _state.update {
            it.copy(
                loading = false,
                attachments = result.attachments,
                links = result.links,
                limits = result.limits ?: it.limits,
                error = if (result.ok) null else result.error ?: it.error,
            )
        }
    }

    class Factory(
        private val context: Context,
        private val groupId: String,
        private val classId: String,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = MaterialsViewModel(
            groupId = groupId,
            classId = classId,
            repository = PlanGraph.attachments(context.applicationContext),
        ) as T
    }
}

private fun Throwable.userMessage(): String = when (this) {
    is AttachmentException -> when (code) {
        409 -> message ?: "Limit materiałów dla tych zajęć."
        413 -> "Plik lub limit miejsca przekroczony."
        415 -> "Niedozwolony typ lub uszkodzony plik."
        429 -> "Za dużo operacji — spróbuj za chwilę."
        507 -> "Brak miejsca na serwerze."
        else -> message ?: "Błąd serwera ($code)."
    }

    is IOException -> message ?: "Brak połączenia z serwerem."
    else -> message ?: "Nie udało się wykonać operacji."
}
