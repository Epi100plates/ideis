package pl.matiit.planzajec.data.remote

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Adres zapisu notatki: serwer przyjmuje notatkę tylko dla zajęć, które są
 * w planie, więc `group`/`groups` + `ay` muszą tam być. Bez nich walidacja
 * nie ma czego sprawdzić i notatka do wymyślonych zajęć przechodziła.
 */
class NoteUrlsTest {

    private val base = "https://ideis.mati-it.pl"

    @Test
    fun `jedna grupa idzie jako group`() {
        assertEquals(
            "$base/api/notes?group=21188",
            NoteUrls.save(base, listOf("21188"), null),
        )
    }

    @Test
    fun `kilka grup idzie jako groups rozdzielone przecinkiem`() {
        assertEquals(
            "$base/api/notes?groups=21186,21188",
            NoteUrls.save(base, listOf("21186", "21188"), null),
        )
    }

    @Test
    fun `rok akademicki dopisuje ay`() {
        assertEquals(
            "$base/api/notes?groups=21186,21188&ay=2025",
            NoteUrls.save(base, listOf("21186", "21188"), 2025),
        )
    }

    @Test
    fun `puste numery grup sa pomijane, a koncowy ukosnik nie zostaje`() {
        assertEquals(
            "$base/api/notes?group=21188",
            NoteUrls.save("$base/", listOf(" ", "21188"), null),
        )
        assertEquals("$base/api/notes", NoteUrls.save(base, emptyList(), null))
    }
}
