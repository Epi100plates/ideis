package pl.matiit.planzajec.data.model

import kotlinx.serialization.Serializable

/** Plik przypisany do konkretnych zajęć (`GET /api/attachments`). */
@Serializable
data class AttachmentDto(
    val id: String = "",
    val name: String = "",
    val ext: String = "",
    val kind: String? = null,
    val mime: String? = null,
    val size: Long = 0L,
    val uploadedAt: String? = null,
    val url: String? = null,
)

/** Link do materiału — osobny byt, nie zajmuje miejsca na pliki. */
@Serializable
data class LinkDto(
    val id: String = "",
    val url: String = "",
    val title: String = "",
    val host: String? = null,
    val addedAt: String? = null,
)

@Serializable
data class AttachmentLimitsDto(
    val maxFileBytes: Long = 0L,
    val maxFilesPerClass: Int = 0,
    val maxLinksPerClass: Int = 0,
    val maxBytesPerClass: Long = 0L,
    val maxTotalBytes: Long = 0L,
    val allowed: List<String> = emptyList(),
    val allowedLabel: String? = null,
)

/** Odpowiedź listy/zmian materiałów. `error` wypełnia serwer przy 4xx/5xx. */
@Serializable
data class AttachmentListDto(
    val ok: Boolean = false,
    val error: String? = null,
    val group: String? = null,
    val classId: String? = null,
    val attachments: List<AttachmentDto> = emptyList(),
    val links: List<LinkDto> = emptyList(),
    val limits: AttachmentLimitsDto? = null,
)

/** Ile materiałów ma dane zajęcia — do ikony spinacza przy karcie. */
@Serializable
data class AttachmentCountsDto(
    val files: Int = 0,
    val links: Int = 0,
) {
    val hasAny: Boolean get() = files > 0 || links > 0
}

/**
 * `GET /api/attachments/index` — mapa „identyfikator zajęć → liczniki”.
 *
 * Identyfikator zajęć jest ten sam we wszystkich grupach, więc wykład ma jedną
 * wspólną listę materiałów; ćwiczenia mają w identyfikatorze nazwę swojej grupy,
 * więc pozostają rozdzielone. Aplikacja pobiera ten indeks raz i rysuje spinacz
 * tylko przy zajęciach, które naprawdę coś mają.
 */
@Serializable
data class AttachmentIndexDto(
    val ok: Boolean = false,
    val error: String? = null,
    val classes: Map<String, AttachmentCountsDto> = emptyMap(),
)
