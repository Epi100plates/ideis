package pl.matiit.planzajec.update

/**
 * Reguły aktualizacji jako czyste funkcje — bez Androida, bez sieci, więc
 * testowane zwykłym JUnit. Cała „polityka” (jak często pytać, kiedy pokazać
 * pytanie, czy wydanie jest bezpieczne) siedzi tutaj, a nie w UI.
 */
object UpdateRules {

    /** Automatyczne sprawdzanie najwyżej raz na 6 godzin. */
    const val CHECK_INTERVAL_MS: Long = 6 * 60 * 60 * 1000L

    /**
     * Gdy użytkownik wybierze „Później”, nie zamęczamy go przy każdym
     * uruchomieniu — to samo wydanie proponujemy ponownie po dobie.
     */
    const val PROMPT_INTERVAL_MS: Long = 24 * 60 * 60 * 1000L

    /** Sensowny górny limit APK: chroni pamięć telefonu przed złym manifestem. */
    const val MAX_APK_BYTES: Long = 120L * 1024 * 1024

    /** Ile punktów listy zmian pokazujemy w okienku. */
    const val MAX_NOTES_LINES: Int = 8

    private val SHA256 = Regex("[a-f0-9]{64}")

    /** Serwer publikuje wydanie tylko wtedy, gdy jest nowsze niż zainstalowane. */
    fun isNewer(remoteVersionCode: Int, currentVersionCode: Int): Boolean =
        remoteVersionCode > currentVersionCode

    /** Czy już czas na kolejne sprawdzenie (albo czy użytkownik wymusił je ręcznie). */
    fun shouldCheck(
        now: Long,
        lastCheckAt: Long,
        intervalMs: Long = CHECK_INTERVAL_MS,
        force: Boolean = false,
    ): Boolean = force || lastCheckAt <= 0L || now - lastCheckAt >= intervalMs

    /**
     * Czy pokazać okienko z propozycją aktualizacji.
     *
     * Nowa wersja na serwerze → pytamy od razu. Ta sama wersja, o którą już
     * pytaliśmy → dopiero po [PROMPT_INTERVAL_MS]. Pominięte wydanie nie
     * wraca, dopóki nie pojawi się nowsze.
     */
    fun shouldPrompt(
        now: Long,
        lastPromptAt: Long,
        lastPromptVersion: Int,
        releaseVersionCode: Int,
        currentVersionCode: Int,
        promptIntervalMs: Long = PROMPT_INTERVAL_MS,
    ): Boolean {
        if (!isNewer(releaseVersionCode, currentVersionCode)) return false
        if (lastPromptVersion != releaseVersionCode) return true
        return now - lastPromptAt >= promptIntervalMs
    }

    /** Użytkownik pomija konkretne wydanie; nowsze znów go zainteresuje. */
    fun isSkipped(releaseVersionCode: Int, skippedVersion: Int): Boolean =
        skippedVersion > 0 && releaseVersionCode <= skippedVersion

    /** Aktualizacja obowiązkowa: zainstalowana wersja jest poniżej wspieranej. */
    fun isRequired(currentVersionCode: Int, minSupportedVersionCode: Int): Boolean =
        minSupportedVersionCode > 0 && currentVersionCode < minSupportedVersionCode

    /**
     * Adres APK z manifestu: pełny `http(s)` zostaje, ścieżka zaczynająca się
     * od „/” jest doklejana do bazy API. Wszystko inne odrzucamy — pole
     * z serwera nie może wskazać `file://` ani innego schematu.
     */
    fun resolveUrl(baseUrl: String, apkUrl: String): String {
        val value = apkUrl.trim()
        if (value.isEmpty()) return ""
        if (value.startsWith("http://", ignoreCase = true) ||
            value.startsWith("https://", ignoreCase = true)
        ) {
            return value
        }
        if (!value.startsWith("/")) return ""
        return baseUrl.trimEnd('/') + value
    }

    fun isValidSha256(value: String): Boolean =
        SHA256.matches(value.trim().lowercase())

    /**
     * Manifest dotyczy tej aplikacji? Wydanie debug ma `applicationIdSuffix`
     * `.debug`, więc dopuszczamy wersję z przyrostkiem po kropce — inaczej
     * deweloper nigdy nie zobaczyłby własnej aktualizacji.
     */
    fun appMatches(declaredApp: String?, packageName: String): Boolean {
        val declared = declaredApp?.trim().orEmpty()
        if (declared.isEmpty()) return true // starszy serwer nie zna pola `app`
        return declared == packageName || packageName.startsWith("$declared.")
    }

    /**
     * Manifest → gotowe wydanie albo powód odrzucenia. Odrzucamy wszystko,
     * czego nie umiemy bezpiecznie pobrać i sprawdzić.
     */
    fun toRelease(
        dto: UpdateManifestDto,
        baseUrl: String,
        packageName: String,
        maxBytes: Long = MAX_APK_BYTES,
    ): ReleaseResult {
        if (!dto.ok) return ReleaseResult.Invalid("Serwer nie potwierdził wydania.")
        if (!appMatches(dto.app, packageName)) {
            return ReleaseResult.Invalid("Wydanie dotyczy innej aplikacji (${dto.app}).")
        }
        if (dto.versionCode < 1) return ReleaseResult.Invalid("Brak numeru wersji w odpowiedzi.")
        if (dto.versionName.isBlank()) return ReleaseResult.Invalid("Brak nazwy wersji w odpowiedzi.")

        val url = resolveUrl(baseUrl, dto.apkUrl)
        if (url.isEmpty()) return ReleaseResult.Invalid("Nieprawidłowy adres pliku APK.")
        if (!isValidSha256(dto.sha256)) return ReleaseResult.Invalid("Brak sumy kontrolnej SHA-256.")
        if (dto.sizeBytes <= 0L) return ReleaseResult.Invalid("Nieprawidłowy rozmiar pliku APK.")
        if (dto.sizeBytes > maxBytes) return ReleaseResult.Invalid("Plik APK jest podejrzanie duży.")

        return ReleaseResult.Ok(
            AppRelease(
                versionCode = dto.versionCode,
                versionName = dto.versionName.trim(),
                url = url,
                sha256 = dto.sha256.trim().lowercase(),
                sizeBytes = dto.sizeBytes,
                minSupportedVersionCode = dto.minSupportedVersionCode.coerceAtLeast(0),
                notes = notesLines(dto.notes),
                publishedAt = dto.publishedAt,
            ),
        )
    }

    /** Lista zmian z manifestu: po jednym punkcie w linii, bez pustych i za długich. */
    fun notesLines(notes: String?, limit: Int = MAX_NOTES_LINES): List<String> =
        notes.orEmpty()
            .split('\n', '\r')
            .map { it.trim().removePrefix("•").removePrefix("-").trim() }
            .filter { it.isNotEmpty() }
            .take(limit)
            .map { if (it.length > 200) it.take(197) + "…" else it }

    /** Nazwa pliku w prywatnym katalogu aplikacji — z numeru wersji, nie z sieci. */
    fun downloadFileName(versionCode: Int): String = "app-$versionCode.apk"
}

/** Wynik walidacji manifestu: wydanie albo czytelny powód dla użytkownika. */
sealed interface ReleaseResult {
    data class Ok(val release: AppRelease) : ReleaseResult
    data class Invalid(val reason: String) : ReleaseResult
}
