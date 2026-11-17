package pl.matiit.planzajec.update

import kotlinx.serialization.Serializable

/**
 * Odpowiedź `GET /api/app/latest` — dokładnie to, co publikuje
 * `scripts/publish-apk.ps1`. Serwer dokłada `generatedAt` i `updateAvailable`,
 * których aplikacja nie potrzebuje, ale ich nie odrzuca (`ignoreUnknownKeys`).
 */
@Serializable
data class UpdateManifestDto(
    val ok: Boolean = false,
    val app: String? = null,
    val versionCode: Int = 0,
    val versionName: String = "",
    val apkFile: String? = null,
    val apkUrl: String = "",
    val sha256: String = "",
    val sizeBytes: Long = 0,
    val minSupportedVersionCode: Int = 0,
    val notes: String? = null,
    val publishedAt: String? = null,
)

/**
 * Wydanie po walidacji — tylko taki obiekt trafia do pobierania i instalacji.
 * Adres APK jest już bezwzględny, a `notes` rozbite na punkty listy.
 */
data class AppRelease(
    val versionCode: Int,
    val versionName: String,
    val url: String,
    val sha256: String,
    val sizeBytes: Long,
    val minSupportedVersionCode: Int,
    val notes: List<String>,
    val publishedAt: String? = null,
)
