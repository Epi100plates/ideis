package pl.matiit.planzajec.data.local

import android.content.Context
import java.io.File
import kotlinx.serialization.Serializable
import pl.matiit.planzajec.core.PlanJson

/**
 * Notatki na kafelkach zapisane na dysku (`identyfikator zajęć → tekst`).
 *
 * Powód istnienia: notatki są wspólne i przychodzą z serwera, ale **widżet**
 * rysuje się bez sieci i bez uruchomionej aplikacji. Bez kopii na dysku widżet
 * nie miałby skąd wziąć notatek, a po restarcie telefonu pokazywałby plan bez
 * plakietek do najbliższego otwarcia aplikacji.
 */
interface NotesStore {

    /** Ostatnio znane notatki (pusta mapa, gdy nic nie zapisano). */
    fun read(): Map<String, String>

    fun write(notes: Map<String, String>)

    /** Magazyn „nic nie zapisuję” — dla testów i miejsc, gdzie notatki są zbędne. */
    object None : NotesStore {
        override fun read(): Map<String, String> = emptyMap()

        override fun write(notes: Map<String, String>) = Unit
    }
}

/** Zapis w `filesDir/cache/notes.json` — ten sam katalog co plan w [FilePlanStorage]. */
class FileNotesStore(context: Context) : NotesStore {

    private val dir = File(context.filesDir, "cache").apply { mkdirs() }

    override fun read(): Map<String, String> {
        val file = notesFile()
        if (!file.isFile) return emptyMap()
        val stored = runCatching {
            PlanJson.decodeFromString(StoredNotes.serializer(), file.readText())
        }.getOrNull() ?: return emptyMap()
        return stored.notes.filter { (id, text) -> id.isNotBlank() && text.isNotBlank() }
    }

    override fun write(notes: Map<String, String>) {
        val clean = notes.filter { (id, text) -> id.isNotBlank() && text.isNotBlank() }
        val text = PlanJson.encodeToString(StoredNotes.serializer(), StoredNotes(clean))
        val target = notesFile()
        // Zapis przez plik tymczasowy: widżet może czytać notatki w tej samej
        // chwili, a przerwany zapis nie może zostawić uciętego JSON-a.
        val tmp = File.createTempFile("notes-", ".tmp", target.parentFile)
        try {
            tmp.writeText(text)
            if (!tmp.renameTo(target)) {
                target.writeText(text)
            }
        } finally {
            tmp.delete()
        }
    }

    private fun notesFile() = File(dir, "notes.json")
}

/** Wersjonowalny format pliku — obiekt, a nie goła mapa, żeby dało się dodać pole. */
@Serializable
data class StoredNotes(val notes: Map<String, String> = emptyMap())
