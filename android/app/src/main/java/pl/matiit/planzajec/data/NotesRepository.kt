package pl.matiit.planzajec.data

import pl.matiit.planzajec.data.remote.NotesRemote

/**
 * Cienka warstwa nad API notatek. Bez cache'u na dysku: mapa notatek jest mała
 * i pobierana razem z planem, a zapis i tak wraca z serwera jako potwierdzenie.
 */
class NotesRepository(private val remote: NotesRemote) {

    /** Wszystkie notatki planu — identyfikator zajęć → tekst. */
    suspend fun all(): Map<String, String> = remote.all().notes

    /**
     * Zapis (puste `text` usuwa notatkę). `target` mówi serwerowi, w jakim
     * planie sprawdzić, czy zajęcia istnieją — bez tego notatka mogła dotyczyć
     * wymyślonego identyfikatora.
     */
    suspend fun save(classId: String, text: String, target: PlanTarget): String =
        remote.save(classId, text, target.orderedGroups, target.ayParam).text
}
