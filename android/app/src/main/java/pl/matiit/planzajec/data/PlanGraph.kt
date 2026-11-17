package pl.matiit.planzajec.data

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.IOException
import pl.matiit.planzajec.data.local.FilePlanStorage
import pl.matiit.planzajec.data.local.SharedPrefsSettings
import pl.matiit.planzajec.data.remote.HttpAttachmentsRemote
import pl.matiit.planzajec.data.remote.HttpFeedbackRemote
import pl.matiit.planzajec.data.remote.HttpNotesRemote
import pl.matiit.planzajec.data.remote.HttpPlanRemote
import pl.matiit.planzajec.update.UpdateManager

/**
 * Ręczny, leniwy „wstrzykiwacz”: jedna instancja na proces, tworzona przy
 * pierwszym użyciu. Bez Hilt/Koin — mniej kodu, szybszy start, mniejszy APK.
 */
object PlanGraph {

    @Volatile
    private var repository: PlanRepository? = null

    @Volatile
    private var attachments: AttachmentsRepository? = null

    @Volatile
    private var notes: NotesRepository? = null

    @Volatile
    private var feedbackInstance: FeedbackRepository? = null

    @Volatile
    private var settingsInstance: SharedPrefsSettings? = null

    // Menedżer aktualizacji trzyma `applicationContext` (nigdy Activity), więc
    // statyczne pole nie wycieka — lint widzi samo słowo „Context” w polu.
    @SuppressLint("StaticFieldLeak")
    @Volatile
    private var updatesInstance: UpdateManager? = null

    fun settings(context: Context): SharedPrefsSettings {
        settingsInstance?.let { return it }
        return synchronized(this) {
            settingsInstance ?: SharedPrefsSettings(context.applicationContext).also { settingsInstance = it }
        }
    }

    fun repository(context: Context): PlanRepository {
        repository?.let { return it }
        return synchronized(this) {
            repository ?: PlanRepository(
                remote = HttpPlanRemote(),
                storage = FilePlanStorage(context.applicationContext),
                settings = settings(context.applicationContext),
            ).also { repository = it }
        }
    }

    fun attachments(context: Context): AttachmentsRepository {
        attachments?.let { return it }
        return synchronized(this) {
            attachments ?: AttachmentsRepository(HttpAttachmentsRemote()).also { attachments = it }
        }
    }

    /** Notatki na kafelkach („Kolos”, „Egzamin”) — wspólne dla wszystkich. */
    fun notes(context: Context): NotesRepository {
        notes?.let { return it }
        return synchronized(this) {
            notes ?: NotesRepository(HttpNotesRemote()).also { notes = it }
        }
    }

    /** Propozycje i błędy — własny, mały magazyn (bez cache'u). */
    fun feedback(context: Context): FeedbackRepository {
        feedbackInstance?.let { return it }
        return synchronized(this) {
            feedbackInstance ?: FeedbackRepository(HttpFeedbackRemote()).also { feedbackInstance = it }
        }
    }

    /** Mechanizm aktualizacji — jedna instancja, bo stan widzi też praca w tle. */
    fun updates(context: Context): UpdateManager {
        updatesInstance?.let { return it }
        return synchronized(this) {
            updatesInstance ?: UpdateManager(
                appContext = context.applicationContext,
                settings = settings(context.applicationContext),
            ).also { updatesInstance = it }
        }
    }
}

data class PickedFile(val name: String, val bytes: ByteArray)

/** Nazwa pliku widoczna w systemowym wyborze dokumentu (SAF). */
fun Context.displayNameOf(uri: Uri): String? =
    contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (cursor.moveToFirst() && index >= 0) cursor.getString(index) else null
    }

/** Rozmiar deklarowany przez SAF; pozwala sprawdzić limit przed uploadem. */
fun Context.sizeOf(uri: Uri): Long? =
    contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        val index = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (cursor.moveToFirst() && index >= 0 && !cursor.isNull(index)) cursor.getLong(index) else null
    }

/** Bezpieczny odczyt wybranego dokumentu (limit sprawdzany także po odczycie). */
fun Context.readPickedFile(uri: Uri, maxBytes: Long): PickedFile {
    val declaredSize = sizeOf(uri)
    if (declaredSize != null && maxBytes > 0 && declaredSize > maxBytes) {
        throw IOException("Plik jest za duży (limit ${maxBytes / (1024 * 1024)} MB).")
    }
    val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() }
        ?: throw IOException("Nie udało się odczytać pliku.")
    if (maxBytes > 0 && bytes.size > maxBytes) {
        throw IOException("Plik jest za duży (limit ${maxBytes / (1024 * 1024)} MB).")
    }
    if (bytes.isEmpty()) {
        throw IOException("Plik jest pusty.")
    }
    val name = displayNameOf(uri)?.takeIf { it.isNotBlank() } ?: "material"
    return PickedFile(name, bytes)
}
