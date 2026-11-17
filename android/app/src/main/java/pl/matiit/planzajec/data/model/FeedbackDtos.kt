package pl.matiit.planzajec.data.model

import kotlinx.serialization.Serializable

/**
 * Zgłoszenie propozycji albo błędu (`POST /api/feedback`).
 *
 * Wersja i platforma są opcjonalne — pomagają odtworzyć problem. Nie ma pola
 * na e-mail ani konto: zgłoszenia są anonimowe, tak jak całe API planu.
 */
@Serializable
data class FeedbackPayload(
    val kind: String,
    val message: String,
    val version: String? = null,
    val versionCode: Int? = null,
    val platform: String = "android",
)

/** Zapisane zgłoszenie z serwera. */
@Serializable
data class FeedbackItemDto(
    val id: String = "",
    val kind: String = "",
    val message: String = "",
    val version: String? = null,
    val versionCode: Int? = null,
    val platform: String? = null,
    val createdAt: String? = null,
) {
    val isBug: Boolean get() = kind == "bug"
}

/** Odpowiedź listy zgłoszeń (`GET /api/feedback`). */
@Serializable
data class FeedbackListDto(
    val ok: Boolean = false,
    val error: String? = null,
    val items: List<FeedbackItemDto> = emptyList(),
    val count: Int = 0,
    val canModerate: Boolean = false,
)

/** Odpowiedź po wysłaniu zgłoszenia (serwer zwraca zapisany wpis). */
@Serializable
data class FeedbackCreatedDto(
    val ok: Boolean = false,
    val error: String? = null,
    val item: FeedbackItemDto? = null,
)
