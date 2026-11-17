package pl.matiit.planzajec.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Odpowiedź `GET /api/plan?group=…`.
 *
 * Model odwzorowuje tylko pola, których aplikacja naprawdę używa — reszta
 * (np. statystyki) jest ignorowana przez parser.
 */
@Serializable
data class PlanDto(
    val ok: Boolean = false,
    val error: String? = null,
    val stale: Boolean = false,
    val group: String? = null,
    val generatedAt: String? = null,
    val meta: PlanMetaDto? = null,
    val version: PlanVersionDto? = null,
    val classes: List<ClassDto> = emptyList(),
)

@Serializable
data class PlanMetaDto(
    val groupId: String? = null,
    val groupName: String? = null,
    val groupCode: String? = null,
    val semesterFrom: String? = null,
    val semesterTo: String? = null,
    val classes: Int = 0,
)

@Serializable
data class PlanVersionDto(
    val id: Long? = null,
    /**
     * Odcisk treści planu — tożsamość wersji. `id` jest licznikiem w pamięci
     * serwera i po jego restarcie wraca do #1, więc porównywanie `id` zostawiało
     * klienta ze starym planem na zawsze.
     */
    val fingerprint: String? = null,
    val fetchedAt: String? = null,
    val checkedAt: String? = null,
    val classes: Int = 0,
)

@Serializable
data class ClassDto(
    val id: String = "",
    val date: String = "",
    val weekday: String? = null,
    val start: String = "",
    val end: String = "",
    val startMinutes: Int = -1,
    val endMinutes: Int = -1,
    val durationMin: Int = 0,
    val subject: String = "",
    val form: FormDto? = null,
    val group: String? = null,
    val mode: String? = null,
    val room: RoomDto? = null,
    val roomRaw: String? = null,
    val lecturer: String? = null,
    val notes: String? = null,
)

@Serializable
data class FormDto(
    val code: String? = null,
    val label: String? = null,
    val raw: String? = null,
)

@Serializable
data class RoomDto(
    val building: String? = null,
    val number: String? = null,
    val type: String? = null,
    val label: String? = null,
    val raw: String? = null,
)

/**
 * Odpowiedź `GET /api/groups` serwera ideis: cały katalog uczelni z gotowymi
 * wymiarami. Serwer wysyła krótkie klucze (`f`, `s`, `d`, `m`, `y`, `b`), bo
 * lista ma ~2100 grup i leci do każdego urządzenia.
 */
@Serializable
data class GroupsDto(
    val ok: Boolean = false,
    val defaultGroup: String? = null,
    val defaults: SelectionDefaultsDto? = null,
    val academicYear: AcademicYearDto? = null,
    val count: Int = 0,
    val savedAt: String? = null,
    val stale: Boolean = false,
    val groups: List<GroupDto> = emptyList(),
)

/** Początkowy wybór w pickerze (`DEFAULT_*` po stronie serwera). */
@Serializable
data class SelectionDefaultsDto(
    val nabor: String = "",
    val field: String = "",
    val spec: String = "",
    val year: String = "",
    val degree: String = "",
    val mode: String = "",
)

/** Bieżący rok akademicki serwera: `start` = rok rozpoczęcia (2026 → 2026/2027). */
@Serializable
data class AcademicYearDto(
    val start: String? = null,
    val label: String? = null,
)

/**
 * Grupa z katalogu wraz z wymiarami wyprowadzonymi przez serwer:
 *   f kierunek, s specjalność (null = brak, np. 1. rok), d typ studiów,
 *   m tryb, y rok studiów, b lista naborów, sem semestr, k forma, num numer.
 */
@Serializable
data class GroupDto(
    val id: String = "",
    @SerialName("c") val code: String? = null,
    @SerialName("n") val name: String? = null,
    @SerialName("f") val field: String? = null,
    @SerialName("s") val spec: String? = null,
    @SerialName("d") val degree: String? = null,
    @SerialName("m") val mode: String? = null,
    @SerialName("y") val year: Int? = null,
    @SerialName("b") val nabory: List<Int> = emptyList(),
    @SerialName("sem") val semester: Int? = null,
    @SerialName("k") val kind: String? = null,
    @SerialName("num") val number: String? = null,
)

/** Lekki status wersji: `GET /api/version?group=…`. */
@Serializable
data class VersionDto(
    val ok: Boolean = false,
    val groupId: String? = null,
    val currentId: Long? = null,
    val currentFingerprint: String? = null,
    val currentFetchedAt: String? = null,
    val checkedAt: String? = null,
)

/** Pozycja listy wyboru z formularza uczelni (endpointy `/api/ideis/…`). */
@Serializable
data class SelectionItemDto(
    val id: String = "",
    val label: String = "",
    /** Pole „Kierunek” katalogu (dla kierunków). */
    val field: String? = null,
    /** Wartość specjalności w katalogu (null = brak grup dla tej pozycji). */
    val value: String? = null,
    val source: String? = null,
    val groups: Int = 0,
    val missing: Boolean = false,
    /** Roczniki z grupami na tym kierunku (`/api/ideis/kierunki`). */
    val nabory: List<CohortDto> = emptyList(),
)

/**
 * Rocznik kierunku: `value` to rok rozpoczęcia studiów („2024”), a `groups` —
 * ile grup ma ten rocznik. Rok studiów liczy `PlanWizard.cohortYear`.
 */
@Serializable
data class CohortDto(val value: String = "", val groups: Int = 0)

/** Kierunki obsługiwanego wydziału — lista z formularza uczelni. */
@Serializable
data class KierunkiDto(
    val ok: Boolean = false,
    val faculty: FacultyDto? = null,
    val items: List<SelectionItemDto> = emptyList(),
    val warning: String? = null,
)

@Serializable
data class FacultyDto(val id: String = "", val label: String = "")

/** Specjalności kierunku **w wybranym roczniku**: oferta uczelni + wartości z katalogu. */
@Serializable
data class SpecjalnosciDto(
    val ok: Boolean = false,
    val kierunek: SelectionItemDto? = null,
    val items: List<SelectionItemDto> = emptyList(),
    val warning: String? = null,
    /** Ile grup rocznika nie ma specjalności — podpis „bez specjalności”. */
    val noSpecGroups: Int = 0,
    /** Ile grup ma cały rocznik (0 = nic nie ma, krok jest ślepą uliczką). */
    val groups: Int = 0,
)

/** Tryb studiów dostępny w wyborze (`GET /api/ideis/tryby`). */
@Serializable
data class TrybDto(val value: String = "", val groups: Int = 0)

@Serializable
data class TrybyDto(
    val ok: Boolean = false,
    val items: List<TrybDto> = emptyList(),
)