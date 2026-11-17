package pl.matiit.planzajec.data.local

import android.app.DownloadManager
import android.content.Context
import android.os.Build
import android.os.Environment
import androidx.core.net.toUri

/**
 * Pobieranie materiałów przez systemowy DownloadManager: plik ląduje w
 * „Pobranych”, a powiadomienie pozwala go otworzyć. Na Androidzie 10+ nie
 * potrzebujemy żadnego uprawnienia do pamięci.
 */
object MaterialDownloader {

    private const val FOLDER = "Plan zajęć"

    fun enqueue(context: Context, url: String, fileName: String): Long {
        val safeName = sanitize(fileName)
        val request = DownloadManager.Request(url.toUri())
            .setTitle(fileName)
            .setDescription("Materiały do zajęć — Plan zajęć")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setAllowedOverMetered(true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            request.setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS,
                "$FOLDER/$safeName",
            )
        } else {
            request.setDestinationInExternalFilesDir(
                context,
                Environment.DIRECTORY_DOWNLOADS,
                "$FOLDER/$safeName",
            )
        }

        val manager = context.getSystemService(DownloadManager::class.java)
            ?: error("Brak systemowego menedżera pobierania")
        return manager.enqueue(request)
    }

    private fun sanitize(name: String): String {
        val cleaned = name.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001F]"), "_").trim()
        val safe = cleaned.ifEmpty { "material" }
        return if (safe.length > 120) safe.take(116) + "." + safe.substringAfterLast('.', "bin") else safe
    }
}
