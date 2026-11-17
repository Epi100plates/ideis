package pl.matiit.planzajec.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.core.net.toUri
import java.io.File

/**
 * Otwiera systemowy instalator na pobranym APK.
 *
 * Świadomie `ACTION_VIEW` + FileProvider, a nie sesja `PackageInstaller`:
 * bez odbiornika wyników i PendingIntentów, a użytkownik i tak potwierdza
 * instalację w systemowym okienku — czyli dokładnie tak, jak prosił:
 * „pytała użytkownika, czy chce zaktualizować”.
 */
object UpdateInstaller {

    const val APK_MIME: String = "application/vnd.android.package-archive"

    /** Czy system pozwala tej aplikacji instalować pakiety (wymagane od Androida 8). */
    fun canInstall(context: Context): Boolean =
        context.packageManager.canRequestPackageInstalls()

    fun uriFor(context: Context, apk: File): Uri =
        FileProvider.getUriForFile(context, "${context.packageName}.updates", apk)

    fun installIntent(context: Context, apk: File): Intent =
        Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uriFor(context, apk), APK_MIME)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

    /** Uruchamia instalator; `false`, gdy plik zniknął albo brak zgody systemu. */
    fun install(context: Context, apk: File): Boolean {
        if (!apk.isFile || apk.length() == 0L) return false
        if (!canInstall(context)) return false
        return runCatching { context.startActivity(installIntent(context, apk)) }.isSuccess
    }

    /** Ekran „Instaluj nieznane aplikacje” dla tej aplikacji. */
    fun permissionIntent(context: Context): Intent =
        Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            "package:${context.packageName}".toUri(),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
