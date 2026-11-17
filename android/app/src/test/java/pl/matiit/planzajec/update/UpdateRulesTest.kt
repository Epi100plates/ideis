package pl.matiit.planzajec.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Reguły aktualizacji: porównanie wersji, rytm pytań, walidacja manifestu. */
class UpdateRulesTest {

    private val baseUrl = "https://plany.mati-it.pl"

    private fun dto(
        versionCode: Int = 2,
        versionName: String = "1.1",
        apkUrl: String = "/api/app/download/planzajec-1.1-2.apk",
        sha256: String = "a".repeat(64),
        sizeBytes: Long = 2_048,
        notes: String? = "Kafelki w widżecie\nAktualizacje w aplikacji",
        minSupported: Int = 0,
        app: String? = "pl.matiit.planzajec",
        ok: Boolean = true,
    ) = UpdateManifestDto(
        ok = ok,
        app = app,
        versionCode = versionCode,
        versionName = versionName,
        apkFile = "planzajec-1.1-2.apk",
        apkUrl = apkUrl,
        sha256 = sha256,
        sizeBytes = sizeBytes,
        minSupportedVersionCode = minSupported,
        notes = notes,
    )

    @Test
    fun `nowsza wersja to wyższy versionCode`() {
        assertTrue(UpdateRules.isNewer(2, 1))
        assertFalse(UpdateRules.isNewer(1, 1))
        assertFalse(UpdateRules.isNewer(1, 2))
    }

    @Test
    fun `sprawdzenie respektuje odstęp i wymuszenie`() {
        val now = 10_000_000L
        assertTrue("pierwsze sprawdzenie zawsze przechodzi", UpdateRules.shouldCheck(now, 0L))
        assertFalse(
            UpdateRules.shouldCheck(now, now - 60_000L),
        )
        assertTrue(
            UpdateRules.shouldCheck(now, now - UpdateRules.CHECK_INTERVAL_MS),
        )
        assertTrue("ręczne sprawdzenie ignoruje odstęp", UpdateRules.shouldCheck(now, now - 1L, force = true))
    }

    @Test
    fun `pytanie wraca po dobie dla tej samej wersji`() {
        val now = 10_000_000L
        // Nowa wersja, o którą jeszcze nie pytaliśmy → pytamy od razu.
        assertTrue(UpdateRules.shouldPrompt(now, 0L, 0, releaseVersionCode = 2, currentVersionCode = 1))
        // Ta sama wersja, pytanie sprzed godziny → nie zamęczamy.
        assertFalse(
            UpdateRules.shouldPrompt(
                now, now - 60 * 60 * 1000L, lastPromptVersion = 2,
                releaseVersionCode = 2, currentVersionCode = 1,
            ),
        )
        // Ta sama wersja po dobie → pytamy ponownie.
        assertTrue(
            UpdateRules.shouldPrompt(
                now, now - UpdateRules.PROMPT_INTERVAL_MS, lastPromptVersion = 2,
                releaseVersionCode = 2, currentVersionCode = 1,
            ),
        )
        // Nic nowszego niż zainstalowane → nigdy nie pytamy.
        assertFalse(UpdateRules.shouldPrompt(now, 0L, 0, releaseVersionCode = 1, currentVersionCode = 1))
    }

    @Test
    fun `pominięte wydanie nie wraca, ale nowsze tak`() {
        assertTrue(UpdateRules.isSkipped(2, 2))
        assertTrue(UpdateRules.isSkipped(1, 2))
        assertFalse(UpdateRules.isSkipped(3, 2))
        assertFalse(UpdateRules.isSkipped(2, 0))
    }

    @Test
    fun `aktualizacja obowiązkowa tylko przy podanym minimum`() {
        assertTrue(UpdateRules.isRequired(currentVersionCode = 1, minSupportedVersionCode = 2))
        assertFalse(UpdateRules.isRequired(currentVersionCode = 2, minSupportedVersionCode = 2))
        assertFalse(UpdateRules.isRequired(currentVersionCode = 1, minSupportedVersionCode = 0))
    }

    @Test
    fun `adres APK jest doklejany do bazy albo zostaje pełny`() {
        assertEquals(
            "https://plany.mati-it.pl/api/app/download/x.apk",
            UpdateRules.resolveUrl(baseUrl, "/api/app/download/x.apk"),
        )
        assertEquals(
            "https://plany.mati-it.pl/api/app/download/x.apk",
            UpdateRules.resolveUrl("$baseUrl/", "/api/app/download/x.apk"),
        )
        assertEquals(
            "https://cdn.example.com/x.apk",
            UpdateRules.resolveUrl(baseUrl, "https://cdn.example.com/x.apk"),
        )
        assertEquals("", UpdateRules.resolveUrl(baseUrl, "javascript:alert(1)"))
        assertEquals("", UpdateRules.resolveUrl(baseUrl, "x.apk"))
        assertEquals("", UpdateRules.resolveUrl(baseUrl, "  "))
    }

    @Test
    fun `manifest musi dotyczyć tej aplikacji, ale wersja debug jest akceptowana`() {
        assertTrue(UpdateRules.appMatches("pl.matiit.planzajec", "pl.matiit.planzajec"))
        assertTrue("debug ma sufiks .debug", UpdateRules.appMatches("pl.matiit.planzajec", "pl.matiit.planzajec.debug"))
        assertTrue("starszy serwer bez pola app", UpdateRules.appMatches(null, "pl.matiit.planzajec"))
        assertFalse(UpdateRules.appMatches("com.example.inna", "pl.matiit.planzajec"))
    }

    @Test
    fun `poprawny manifest daje gotowe wydanie`() {
        val result = UpdateRules.toRelease(dto(), baseUrl, "pl.matiit.planzajec")
        val release = (result as ReleaseResult.Ok).release

        assertEquals(2, release.versionCode)
        assertEquals("1.1", release.versionName)
        assertEquals("https://plany.mati-it.pl/api/app/download/planzajec-1.1-2.apk", release.url)
        assertEquals(2_048L, release.sizeBytes)
        assertEquals(listOf("Kafelki w widżecie", "Aktualizacje w aplikacji"), release.notes)
    }

    @Test
    fun `zły manifest jest odrzucany z powodem`() {
        val packageName = "pl.matiit.planzajec"
        val invalid = listOf(
            dto(ok = false),
            dto(app = "com.example.inna"),
            dto(versionCode = 0),
            dto(versionName = " "),
            dto(apkUrl = "ftp://example.com/x.apk"),
            dto(sha256 = "xyz"),
            dto(sizeBytes = 0),
            dto(sizeBytes = UpdateRules.MAX_APK_BYTES + 1),
        )
        invalid.forEach { manifest ->
            val result = UpdateRules.toRelease(manifest, baseUrl, packageName)
            assertTrue("powinno odrzucić: $manifest", result is ReleaseResult.Invalid)
            assertTrue((result as ReleaseResult.Invalid).reason.isNotBlank())
        }
    }

    @Test
    fun `suma kontrolna jest normalizowana do małych liter`() {
        val result = UpdateRules.toRelease(dto(sha256 = "A".repeat(64)), baseUrl, "pl.matiit.planzajec")
        assertEquals("a".repeat(64), (result as ReleaseResult.Ok).release.sha256)
    }

    @Test
    fun `lista zmian jest dzielona, czyszczona i ograniczana`() {
        assertEquals(
            listOf("Pierwsze", "Drugie", "Trzecie"),
            UpdateRules.notesLines("• Pierwsze\r\n- Drugie\n\n  Trzecie  "),
        )
        assertEquals(emptyList<String>(), UpdateRules.notesLines(null))
        assertEquals(2, UpdateRules.notesLines("a\nb\nc\nd", limit = 2).size)
        assertTrue(UpdateRules.notesLines("x".repeat(500)).single().length <= 200)
    }

    @Test
    fun `nazwa pliku wynika z numeru wersji, nie z sieci`() {
        assertEquals("app-2.apk", UpdateRules.downloadFileName(2))
        assertEquals("app-42.apk", UpdateRules.downloadFileName(42))
    }
}
