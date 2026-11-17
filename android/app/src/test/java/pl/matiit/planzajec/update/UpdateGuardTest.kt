package pl.matiit.planzajec.update

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Sprawdzenie aktualizacji nie może kończyć aplikacji.
 *
 * `UpdateManager.check()` łapało wyłącznie `IOException`, więc uszkodzony
 * manifest (`SerializationException`) leciał do `lifecycleScope.launch`
 * w `MainActivity` i zamykał proces. `guardedUpdate` jest jedynym właścicielem
 * tej odporności — dlatego testujemy je bezpośrednio (bez Androida w JVM).
 */
class UpdateGuardTest {

    @Test
    fun `uszkodzony JSON to komunikat, nie wyjątek`() = runBlocking {
        val result = guardedUpdate<UpdateManifestDto?> {
            throw SerializationException("Unexpected JSON token at offset 3")
        }

        assertTrue("błąd serializacji musi wrócić jako Result.failure", result.isFailure)
        assertTrue(result.exceptionOrNull() is SerializationException)
        assertEquals(
            "Nieprawidłowa odpowiedź serwera aktualizacji.",
            updateErrorText(result.exceptionOrNull()),
        )
    }

    @Test
    fun `błąd sieci zachowuje swój komunikat`() = runBlocking {
        val result = guardedUpdate<Unit> { throw java.io.IOException("Brak połączenia") }

        assertTrue(result.isFailure)
        assertEquals("Brak połączenia", updateErrorText(result.exceptionOrNull()))
    }

    @Test
    fun `pusty komunikat dostaje tekst zastępczy`() {
        assertEquals(
            "Brak połączenia z serwerem aktualizacji.",
            updateErrorText(java.io.IOException()),
        )
        assertEquals(
            "Nie udało się sprawdzić aktualizacji.",
            updateErrorText(null),
        )
    }

    @Test
    fun `sukces przechodzi bez zmian`() = runBlocking {
        val result = guardedUpdate { 42 }

        assertTrue(result.isSuccess)
        assertEquals(42, result.getOrNull())
    }

    @Test
    fun `anulowanie korutyny leci dalej`() = runBlocking {
        try {
            guardedUpdate<Unit> { throw CancellationException("ekran zamknięty") }
            fail("CancellationException nie może zostać połknięte")
        } catch (expected: CancellationException) {
            assertEquals("ekran zamknięty", expected.message)
        }
    }
}
