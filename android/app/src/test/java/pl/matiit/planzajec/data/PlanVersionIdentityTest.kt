package pl.matiit.planzajec.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.data.model.PlanVersionDto
import pl.matiit.planzajec.data.model.VersionDto

/**
 * Tożsamość wersji planu: `version.id` jest licznikiem w pamięci serwera i po
 * jego restarcie wraca do #1, więc porównywanie numerów zostawiało aplikację
 * ze starym planem na zawsze. Rozstrzyga odcisk treści (`fingerprint`).
 */
class PlanVersionIdentityTest {

    private val cached = PlanVersionDto(
        id = 1,
        fingerprint = "a17ceef4f8b3b5d2",
        fetchedAt = "2026-11-15T22:46:21.000Z",
        classes = 100,
    )

    @Test
    fun `ten sam odcisk to ta sama tresc, nawet po restarcie serwera`() {
        val server = VersionDto(
            ok = true,
            currentId = 1,
            currentFingerprint = "a17ceef4f8b3b5d2",
            currentFetchedAt = "2026-11-15T22:46:21.000Z",
        )
        assertTrue(samePlanVersion(cached, server))
    }

    @Test
    fun `numer wersji bez odcisku nie przykrywa zmiany tresci`() {
        // Po restarcie serwera numer wraca do 1, ale treść planu jest inna.
        val server = VersionDto(ok = true, currentId = 1, currentFingerprint = "87f8866cd449b183")
        assertFalse(samePlanVersion(cached, server))
    }

    @Test
    fun `stary serwer bez odcisku porownuje czas pobrania`() {
        val sameTime = VersionDto(ok = true, currentId = 3, currentFetchedAt = cached.fetchedAt)
        val otherTime = VersionDto(ok = true, currentId = 3, currentFetchedAt = "2026-11-16T09:00:00.000Z")
        assertTrue(samePlanVersion(cached, sameTime))
        assertFalse(samePlanVersion(cached, otherTime))
    }

    @Test
    fun `serwer bez odcisku i bez czasu pobrania porownuje numer`() {
        assertTrue(samePlanVersion(cached, VersionDto(ok = true, currentId = 1)))
        assertFalse(samePlanVersion(cached, VersionDto(ok = true, currentId = 2)))
    }

    @Test
    fun `brak odpowiedzi serwera albo brak cache to brak potwierdzenia`() {
        assertFalse(samePlanVersion(cached, null))
        assertFalse(samePlanVersion(null, VersionDto(ok = true, currentId = 1)))
    }
}
