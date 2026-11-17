package pl.matiit.planzajec.update

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import pl.matiit.planzajec.BuildConfig
import pl.matiit.planzajec.core.PlanConfig
import pl.matiit.planzajec.core.PlanJson

/** Wszystko, co UI i worker muszą wiedzieć o aktualizacjach. */
data class UpdateState(
    val currentVersionCode: Int = 0,
    val currentVersionName: String = "",
    val release: AppRelease? = null,
    val downloaded: File? = null,
    val lastCheckAt: Long = 0L,
    val autoCheck: Boolean = true,
    val autoDownload: Boolean = true,
    val skippedVersion: Int = 0,
    val checking: Boolean = false,
    val downloading: Boolean = false,
    val progress: Float = 0f,
    val error: String? = null,
) {
    val updateAvailable: Boolean
        get() = release?.let { UpdateRules.isNewer(it.versionCode, currentVersionCode) } ?: false

    /** Wydanie obowiązkowe — użytkownik nie może go pominąć. */
    val required: Boolean
        get() = release?.let {
            UpdateRules.isRequired(currentVersionCode, it.minSupportedVersionCode)
        } ?: false

    val readyToInstall: Boolean
        get() = updateAvailable && downloaded != null

    /** Plakietka przy wejściu do aktualizacji — tylko dla niepominiętego wydania. */
    val showsBadge: Boolean
        get() = release?.let {
            UpdateRules.isNewer(it.versionCode, currentVersionCode) &&
                !UpdateRules.isSkipped(it.versionCode, skippedVersion)
        } ?: false

    val versionLabel: String
        get() = "$currentVersionName ($currentVersionCode)"
}

/**
 * Mechanizm aktualizacji: sprawdzenie manifestu, pobranie APK, uruchomienie
 * instalatora. Jedna instancja na proces (patrz `PlanGraph`), bo stan musi
 * widzieć zarówno ekran, jak i praca w tle.
 */
class UpdateManager(
    appContext: Context,
    private val settings: UpdateSettings,
    private val remote: UpdateRemote = HttpUpdateRemote(),
    private val baseUrl: String = PlanConfig.API_BASE,
    private val currentVersionCode: Int = BuildConfig.VERSION_CODE,
    private val currentVersionName: String = BuildConfig.VERSION_NAME,
    private val downloader: UpdateDownloader = UpdateDownloader(
        File(appContext.applicationContext.filesDir, "updates"),
    ),
    private val clock: () -> Long = System::currentTimeMillis,
) {

    private val context: Context = appContext.applicationContext
    private val mutex = Mutex()

    private val _state = MutableStateFlow(readState())
    val state: StateFlow<UpdateState> = _state.asStateFlow()

    // --- ustawienia i pytania ---------------------------------------------

    fun setAutoCheck(enabled: Boolean) {
        settings.updatesAutoCheck = enabled
        _state.value = readState()
    }

    fun setAutoDownload(enabled: Boolean) {
        settings.updatesAutoDownload = enabled
        _state.value = readState()
    }

    /** „Pomiń tę wersję” — wraca dopiero przy nowszym wydaniu. */
    fun skipCurrentRelease() {
        val release = _state.value.release ?: return
        settings.updatesSkippedVersion = release.versionCode
        _state.value = readState()
    }

    fun clearSkip() {
        settings.updatesSkippedVersion = 0
        _state.value = readState()
    }

    /** Czy pokazać okienko z propozycją aktualizacji przy tym uruchomieniu. */
    fun shouldPrompt(): Boolean {
        val current = _state.value
        val release = current.release ?: return false
        if (!current.updateAvailable) return false
        if (UpdateRules.isSkipped(release.versionCode, current.skippedVersion)) return false
        return current.required || UpdateRules.shouldPrompt(
            now = clock(),
            lastPromptAt = settings.updatesLastPromptAt,
            lastPromptVersion = settings.updatesLastPromptVersion,
            releaseVersionCode = release.versionCode,
            currentVersionCode = currentVersionCode,
        )
    }

    fun markPrompted() {
        val release = _state.value.release ?: return
        settings.updatesLastPromptAt = clock()
        settings.updatesLastPromptVersion = release.versionCode
    }

    // --- instalacja -------------------------------------------------------

    fun canInstall(): Boolean = UpdateInstaller.canInstall(context)

    fun installPermissionIntent(): Intent = UpdateInstaller.permissionIntent(context)

    /** Otwiera systemowy instalator na pobranym pliku. */
    fun install(): Boolean {
        val file = _state.value.downloaded ?: return false
        return UpdateInstaller.install(context, file)
    }

    // --- sprawdzanie i pobieranie -----------------------------------------

    /**
     * Pyta serwer o najnowsze wydanie. Bez `force` respektuje ustawienie
     * „sprawdzaj automatycznie” i odstęp między sprawdzeniami.
     */
    suspend fun check(force: Boolean = false): UpdateState = mutex.withLock {
        if (!force) {
            if (!settings.updatesAutoCheck) return _state.value
            if (!UpdateRules.shouldCheck(clock(), settings.updatesLastCheckAt)) return _state.value
        }

        _state.value = _state.value.copy(checking = true, error = null)
        try {
            // Każdy błąd (sieć, HTTP, uszkodzony JSON) kończy się komunikatem,
            // nie wyjątkiem: `check()` woła lifecycleScope i worker, a tam
            // nieobsłużony wyjątek zamyka aplikację.
            val fetched = guardedUpdate { remote.latest(currentVersionCode) }
            if (fetched.isFailure) {
                _state.value = readState().copy(error = updateErrorText(fetched.exceptionOrNull()))
            } else {
                val dto = fetched.getOrNull()
                settings.updatesLastCheckAt = clock()

                if (dto == null) {
                    // Serwer nie ma jeszcze żadnego wydania — to nie jest błąd.
                    settings.updatesLatest = null
                    _state.value = readState()
                } else {
                    when (val result = UpdateRules.toRelease(dto, baseUrl, context.packageName)) {
                        is ReleaseResult.Ok -> {
                            settings.updatesLatest = PlanJson.encodeToString(dto)
                            _state.value = readState()
                        }

                        is ReleaseResult.Invalid -> {
                            _state.value = readState().copy(error = result.reason)
                        }
                    }
                }
            }
        } finally {
            _state.value = _state.value.copy(checking = false)
        }
        _state.value
    }

    /** Pobiera APK ogłoszonego wydania (jeśli już jest, zwraca gotowy plik). */
    suspend fun download(): UpdateState {
        val release = _state.value.release ?: return _state.value
        if (!_state.value.updateAvailable) return _state.value

        return mutex.withLock {
            if (_state.value.downloaded != null) return@withLock _state.value

            _state.value = _state.value.copy(downloading = true, progress = 0f, error = null)
            try {
                val saved = guardedUpdate {
                    downloader.download(release) { fraction ->
                        _state.value = _state.value.copy(progress = fraction)
                    }
                }
                _state.value = if (saved.isSuccess) {
                    readState().copy(progress = 1f)
                } else {
                    readState().copy(error = updateErrorText(saved.exceptionOrNull()))
                }
            } finally {
                _state.value = _state.value.copy(downloading = false)
            }
            _state.value
        }
    }

    /**
     * Ścieżka dla pracy w tle: sprawdź i ewentualnie pobierz zawczasu.
     * Pobieranie z sieci komórkowej zostawiamy użytkownikowi — w tle
     * ściągamy tylko przez Wi-Fi, żeby nie zużywać transmisji bez pytania.
     */
    suspend fun checkAndDownload(force: Boolean = false): UpdateState {
        val checked = check(force)
        if (!checked.updateAvailable || checked.downloaded != null) return checked
        if (!settings.updatesAutoDownload || !isUnmetered()) return checked
        return download()
    }

    private fun isUnmetered(): Boolean {
        val manager = context.getSystemService(ConnectivityManager::class.java) ?: return false
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }

    // --- odczyt stanu -----------------------------------------------------

    private fun readState(): UpdateState {
        val release = cachedRelease()
        return UpdateState(
            currentVersionCode = currentVersionCode,
            currentVersionName = currentVersionName,
            release = release,
            downloaded = release?.let(downloader::downloaded),
            lastCheckAt = settings.updatesLastCheckAt,
            autoCheck = settings.updatesAutoCheck,
            autoDownload = settings.updatesAutoDownload,
            skippedVersion = settings.updatesSkippedVersion,
        )
    }

    /** Ostatnio zapisany manifest — walidowany od nowa, bo mógł się zdezaktualizować. */
    private fun cachedRelease(): AppRelease? {
        val raw = settings.updatesLatest ?: return null
        val dto = runCatching { PlanJson.decodeFromString<UpdateManifestDto>(raw) }.getOrNull() ?: return null
        return when (val result = UpdateRules.toRelease(dto, baseUrl, context.packageName)) {
            is ReleaseResult.Ok -> result.release
            is ReleaseResult.Invalid -> null
        }
    }
}
