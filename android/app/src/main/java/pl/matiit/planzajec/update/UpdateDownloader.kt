package pl.matiit.planzajec.update

import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import pl.matiit.planzajec.BuildConfig

/**
 * Pobieranie APK do prywatnego katalogu aplikacji.
 *
 * Świadomie nie używamy systemowego DownloadManager: plik musi leżeć
 * w katalogu aplikacji (potem otwieramy go przez FileProvider), a suma
 * SHA-256 jest liczona w trakcie zapisu — podmieniony albo uszkodzony plik
 * nigdy nie trafi do instalatora.
 */
class UpdateDownloader(private val dir: File) {

    /** Pobiera (albo zwraca już pobrany) plik; postęp 0…1 trafia do UI. */
    suspend fun download(
        release: AppRelease,
        onProgress: (Float) -> Unit = {},
    ): File = withContext(Dispatchers.IO) {
        if (!dir.exists() && !dir.mkdirs()) {
            throw IOException("Nie mogę utworzyć katalogu na aktualizację.")
        }
        prune(keepVersionCode = release.versionCode)

        val target = File(dir, UpdateRules.downloadFileName(release.versionCode))
        if (isComplete(target, release)) {
            onProgress(1f)
            return@withContext target
        }

        val temp = File(dir, target.name + ".part")
        temp.delete()
        try {
            val hash = fetch(release, temp, onProgress)
            if (!hash.equals(release.sha256, ignoreCase = true)) {
                throw IOException("Pobrany plik ma inną sumę kontrolną niż ogłoszona.")
            }
            if (temp.length() != release.sizeBytes) {
                throw IOException("Pobrany plik ma inny rozmiar niż ogłoszony.")
            }
            if (target.exists() && !target.delete()) {
                throw IOException("Nie mogę podmienić starego pliku aktualizacji.")
            }
            if (!temp.renameTo(target)) {
                throw IOException("Nie mogę zapisać pliku aktualizacji.")
            }
            onProgress(1f)
            target
        } catch (e: IOException) {
            temp.delete()
            throw e
        }
    }

    /** Czy w katalogu leży kompletny plik tego wydania (bez sieci)? */
    fun downloaded(release: AppRelease): File? {
        val file = File(dir, UpdateRules.downloadFileName(release.versionCode))
        return if (isComplete(file, release)) file else null
    }

    private fun isComplete(file: File, release: AppRelease): Boolean =
        file.isFile &&
            file.length() == release.sizeBytes &&
            sha256Of(file).equals(release.sha256, ignoreCase = true)

    /** Stare wydania i niedokończone pliki tylko zajmują miejsce. */
    private fun prune(keepVersionCode: Int) {
        val keep = UpdateRules.downloadFileName(keepVersionCode)
        dir.listFiles()?.forEach { file ->
            if (file.name != keep && (file.name.endsWith(".apk") || file.name.endsWith(".part"))) {
                file.delete()
            }
        }
    }

    /** Strumień zapisu + bieżąca suma SHA-256, żeby nie czytać pliku dwa razy. */
    private fun fetch(release: AppRelease, temp: File, onProgress: (Float) -> Unit): String {
        val connection = (URL(release.url).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = true
            requestMethod = "GET"
            setRequestProperty("Accept", "application/vnd.android.package-archive")
            setRequestProperty("User-Agent", "PlanZajec-Android/${BuildConfig.VERSION_NAME}")
        }
        try {
            val code = connection.responseCode
            if (code !in 200..299) {
                throw IOException("Serwer zwrócił HTTP $code przy pobieraniu aktualizacji.")
            }
            val total = connection.contentLengthLong.takeIf { it > 0L } ?: release.sizeBytes
            val digest = MessageDigest.getInstance("SHA-256")
            var written = 0L

            connection.inputStream.use { input ->
                temp.outputStream().buffered(BUFFER_BYTES).use { output ->
                    val buffer = ByteArray(BUFFER_BYTES)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        digest.update(buffer, 0, read)
                        written += read
                        onProgress((written.toFloat() / total).coerceIn(0f, 0.99f))
                    }
                }
            }
            return digest.digest().toHex()
        } finally {
            connection.disconnect()
        }
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 30_000
        const val BUFFER_BYTES = 64 * 1024
    }
}

/** SHA-256 pliku w zapisie szesnastkowym — używane też w testach. */
internal fun sha256Of(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().buffered().use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            digest.update(buffer, 0, read)
        }
    }
    return digest.digest().toHex()
}

private fun ByteArray.toHex(): String {
    val out = StringBuilder(size * 2)
    for (byte in this) {
        val value = byte.toInt() and 0xFF
        out.append(HEX[value ushr 4]).append(HEX[value and 0x0F])
    }
    return out.toString()
}

private const val HEX = "0123456789abcdef"
