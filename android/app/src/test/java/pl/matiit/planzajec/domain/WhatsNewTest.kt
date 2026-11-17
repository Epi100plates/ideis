package pl.matiit.planzajec.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.BuildConfig

/**
 * „Co nowego” — co pokazać po starcie i kiedy zamilknąć.
 *
 * Fork ma własną historię wydań (zaczyna od 1.1), więc reguły sprawdzamy na
 * liście podanej wprost: dzięki temu test nie zależy od tego, ile wydań
 * aplikacja ma w tej chwili opisanych.
 */
class WhatsNewTest {

    private val sample = listOf(
        ReleaseNotes(versionCode = 5, versionName = "1.4", items = listOf("Piąte")),
        ReleaseNotes(versionCode = 4, versionName = "1.3", items = listOf("Czwarte")),
        ReleaseNotes(versionCode = 3, versionName = "1.2", items = listOf("Trzecie")),
    )

    @Test
    fun `lista wydan jest uporzadkowana od najnowszego`() {
        val codes = WhatsNew.releases.map { it.versionCode }

        assertEquals(codes.sortedDescending(), codes)
        assertTrue("każde wydanie ma Zmiany", WhatsNew.releases.all { it.items.isNotEmpty() })
        assertTrue("wersje są dodatnie", WhatsNew.releases.all { it.versionCode > 0 })
    }

    @Test
    fun `historia zaczyna sie od wersji, ktora jest w tej chwili wydana`() {
        // Fork ma własną historię — pierwszy wpis musi pasować do numeru wersji
        // z `android/version.properties` (Gradle wstawia go do `BuildConfig`),
        // inaczej „Co nowego” nigdy by się nie pokazało. Wersji nie wpisujemy
        // tu na sztywno: podbija ją `scripts/publish-apk.ps1 -Bump`.
        assertEquals(BuildConfig.VERSION_CODE, WhatsNew.releases.first().versionCode)
        // Wariant debug dokleja „-debug” do nazwy — porównujemy sam numer.
        assertTrue(
            "BuildConfig.VERSION_NAME=${BuildConfig.VERSION_NAME}",
            BuildConfig.VERSION_NAME.startsWith(WhatsNew.releases.first().versionName),
        )
    }

    @Test
    fun `pierwsze uruchomienie pokazuje tylko najnowsze wydanie`() {
        val pending = WhatsNew.pending(
            seenVersionCode = 0,
            currentVersionCode = 5,
            releases = sample,
        )

        assertEquals(1, pending.size)
        assertEquals(5, pending.first().versionCode)
    }

    @Test
    fun `po aktualizacji pokazuje tylko nowsze wydania`() {
        val pending = WhatsNew.pending(
            seenVersionCode = 3,
            currentVersionCode = 5,
            releases = sample,
        )

        assertEquals(listOf(5, 4), pending.map { it.versionCode })
    }

    @Test
    fun `ta sama wersja nie pokazuje niczego`() {
        assertTrue(WhatsNew.pending(5, 5, sample).isEmpty())
        // Nawet gdyby zapis był z przyszłości (np. cofnięta instalacja).
        assertTrue(WhatsNew.pending(9, 5, sample).isEmpty())
    }

    @Test
    fun `wersja bez wpisu w changelogu nie pokazuje historii`() {
        // Wersja, której nie ma w historii (np. 2), nie może pokazać cudzych wpisów.
        assertTrue(WhatsNew.pending(seenVersionCode = 0, currentVersionCode = 2, releases = sample).isEmpty())
        // Brak wersji aplikacji (0) = nie ma czego pokazywać.
        assertTrue(WhatsNew.pending(seenVersionCode = 0, currentVersionCode = 0, releases = sample).isEmpty())
    }

    @Test
    fun `wydanie nowsze niz zainstalowane jest pomijane`() {
        val pending = WhatsNew.pending(
            seenVersionCode = 0,
            currentVersionCode = 3,
            releases = sample,
        )

        assertEquals(listOf(3), pending.map { it.versionCode })
    }
}
