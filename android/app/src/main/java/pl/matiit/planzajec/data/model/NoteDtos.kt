package pl.matiit.planzajec.data.model

import kotlinx.serialization.Serializable

/**
 * `GET /api/notes` — mapa „identyfikator zajęć → notatka”.
 *
 * Notatka jest wspólna: identyfikator zajęć jest ten sam u wszystkich, więc
 * „Kolos” dopisany przez jedną osobę widać w każdej grupie i w webie.
 */
@Serializable
data class NoteMapDto(
    val ok: Boolean = false,
    val error: String? = null,
    val maxLength: Int = 0,
    val notes: Map<String, String> = emptyMap(),
)

/** `POST /api/notes` — zapis notatki. Puste `text` usuwa notatkę. */
@Serializable
data class NoteSaveDto(
    val ok: Boolean = false,
    val error: String? = null,
    val classId: String = "",
    val text: String = "",
    val maxLength: Int = 0,
)
