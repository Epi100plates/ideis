package pl.matiit.planzajec.data

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.data.local.NotesStore
import pl.matiit.planzajec.data.model.NoteMapDto
import pl.matiit.planzajec.data.model.NoteSaveDto
import pl.matiit.planzajec.data.remote.NotesRemote

/**
 * Notatki i ich kopia na dysku — z tej kopii rysuje się **widżet**, więc
 * każdy udany odczyt i zapis musi ją odświeżyć, a usunięcie notatki usunąć
 * także z pliku (inaczej plakietka „Kolos” zostałaby na pulpicie na zawsze).
 */
class NotesRepositoryTest {

    private val target = PlanTarget("21188")

    @Test
    fun `odczyt z serwera zapisuje kopie lokalna`() = runBlocking {
        val remote = FakeNotesRemote(notes = mapOf("zajecia-1" to "Kolos"))
        val store = MemoryNotesStore()
        val repository = NotesRepository(remote, store)

        val notes = repository.all()

        assertEquals(mapOf("zajecia-1" to "Kolos"), notes)
        assertEquals(notes, store.read())
        assertTrue("kopia musi trafić na dysk", store.writes > 0)
    }

    @Test
    fun `zapis notatki odswieza kopie`() = runBlocking {
        val remote = FakeNotesRemote()
        val store = MemoryNotesStore()
        val repository = NotesRepository(remote, store)

        repository.save("zajecia-1", "Egzamin", target)

        assertEquals(mapOf("zajecia-1" to "Egzamin"), repository.cached())
    }

    @Test
    fun `usuniecie notatki znika takze z kopii`() = runBlocking {
        val remote = FakeNotesRemote(notes = mapOf("zajecia-1" to "Kolos", "zajecia-2" to "Egzamin"))
        val store = MemoryNotesStore()
        val repository = NotesRepository(remote, store)
        repository.all()

        repository.save("zajecia-1", "", target)

        assertEquals(mapOf("zajecia-2" to "Egzamin"), repository.cached())
    }

    @Test
    fun `bez kopii na dysku notatki sa puste`() {
        val repository = NotesRepository(FakeNotesRemote(), NotesStore.None)

        assertTrue(repository.cached().isEmpty())
    }

    private class FakeNotesRemote(var notes: Map<String, String> = emptyMap()) : NotesRemote {

        override suspend fun all(): NoteMapDto = NoteMapDto(ok = true, notes = notes)

        override suspend fun save(
            classId: String,
            text: String,
            groups: List<String>,
            academicYear: Int?,
        ): NoteSaveDto {
            notes = if (text.isBlank()) notes - classId else notes + (classId to text)
            return NoteSaveDto(ok = true, classId = classId, text = text)
        }
    }

    private class MemoryNotesStore : NotesStore {

        private var notes: Map<String, String> = emptyMap()
        var writes: Int = 0
            private set

        override fun read(): Map<String, String> = notes

        override fun write(notes: Map<String, String>) {
            this.notes = notes
            writes += 1
        }
    }
}
