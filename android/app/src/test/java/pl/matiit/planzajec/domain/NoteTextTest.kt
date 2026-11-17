package pl.matiit.planzajec.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Reguły notatki na kafelku („Kolos”, „Egzamin”) — ta sama umowa co
 * `server/notes.js` i `NOTE_MAX` w `public/app.js`: jedna linia, maks. 15
 * znaków, bez znaków sterujących. Gdyby się rozjechały, serwer odrzucałby
 * notatkę wpisaną w aplikacji.
 */
class NoteTextTest {

    @Test
    fun `spacje i znaki sterujace zwijaja sie do jednej linii`() {
        assertEquals("Kolos", NoteText.sanitize("  Kolos  "))
        assertEquals("Egzamin sem", NoteText.sanitize("Egzamin\n\tsem"))
        // Dłuższy tekst jest przycinany już przy zapisie (tak samo robi serwer).
        assertEquals("Egzamin poprawk", NoteText.sanitize("Egzamin\n\tpoprawkowy"))
        assertEquals("", NoteText.sanitize("   "))
        assertEquals("", NoteText.sanitize(""))
    }

    @Test
    fun `limit to 15 znakow`() {
        assertEquals(15, NoteText.MAX_LENGTH)
        assertEquals("123456789012345", NoteText.sanitize("123456789012345"))
        assertEquals("123456789012345", NoteText.sanitize("123456789012345678"))
        assertEquals("123456789012345", NoteText.clamp("123456789012345678"))
    }

    @Test
    fun `emoji nie jest ucinane w polowie`() {
        val pomidor = "\uD83C\uDF45" // 🍅 — jedna para zastępcza (2 jednostki UTF-16)
        assertEquals(2, pomidor.length)
        assertEquals(1, pomidor.codePointCount(0, pomidor.length))
        assertEquals(15, NoteText.clamp(pomidor.repeat(15)).codePointCount(0, NoteText.clamp(pomidor.repeat(15)).length))
        // Szesnasta grafika wypada, ale żadna nie zostaje rozcięta.
        val clipped = NoteText.clamp(pomidor.repeat(20))
        assertEquals(15, clipped.codePointCount(0, clipped.length))
        assertFalse(clipped.contains('\uFFFD'))
    }

    @Test
    fun `isClean mowi czy tekst jest juz poprawna notatka`() {
        assertTrue(NoteText.isClean("Kolos"))
        assertTrue(NoteText.isClean(""))
        assertFalse(NoteText.isClean("  Kolos"))
        assertFalse(NoteText.isClean("Kolos\nEgzamin"))
        assertFalse(NoteText.isClean("1234567890123456"))
    }
}
