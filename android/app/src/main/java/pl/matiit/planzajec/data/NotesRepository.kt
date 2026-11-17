package pl.matiit.planzajec.data

import pl.matiit.planzajec.data.local.NotesStore
import pl.matiit.planzajec.data.remote.NotesRemote

/**
 * Cienka warstwa nad API notatek plus kopia na dysku ([NotesStore]).
 *
 * Mapa notatek jest mała i pobierana razem z planem, więc nie ma tu własnego
 * cache'u w pamięci — ale **dysk jest potrzebny**: widżet rysuje plan bez sieci
 * i bez uruchomionej aplikacji, a plakietki „Kolos”/„Egzamin” muszą być wtedy
 * aktualne. Każdy udany odczyt i zapis odświeża kopię.
 */
class NotesRepository(
    private val remote: NotesRemote,
    private val store: NotesStore = NotesStore.None,
) {

    /** Wszystkie notatki planu — identyfikator zajęć → tekst. */
    suspend fun all(): Map<String, String> {
        val notes = remote.all().notes
        store.write(notes)
        return notes
    }

    /** Notatki z dysku — dla widżetu, bez sieci. */
    fun cached(): Map<String, String> = store.read()

    /**
     * Zapis (puste `text` usuwa notatkę). `target` mówi serwerowi, w jakim
     * planie sprawdzić, czy zajęcia istnieją — bez tego notatka mogła dotyczyć
     * wymyślonego identyfikatora.
     */
    suspend fun save(classId: String, text: String, target: PlanTarget): String {
        val saved = remote.save(classId, text, target.orderedGroups, target.ayParam).text
        // Kopia lokalna od razu po potwierdzeniu serwera: widżet ma pokazać nową
        // notatkę nawet wtedy, gdy telefon straci sieć zaraz po zapisie.
        val next = store.read().toMutableMap()
        if (saved.isBlank()) next.remove(classId) else next[classId] = saved
        store.write(next)
        return saved
    }
}
