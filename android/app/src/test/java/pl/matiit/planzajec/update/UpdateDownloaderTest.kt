package pl.matiit.planzajec.update

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** Weryfikacja pobranego pliku: rozmiar + SHA-256, bez sieci. */
class UpdateDownloaderTest {

    @get:Rule
    val temp = TemporaryFolder()

    private fun releaseOf(dir: File, bytes: ByteArray, versionCode: Int = 2): AppRelease {
        val file = File(dir, UpdateRules.downloadFileName(versionCode))
        if (!file.exists()) file.writeBytes(bytes)
        return AppRelease(
            versionCode = versionCode,
            versionName = "1.1",
            url = "https://plany.mati-it.pl/api/app/download/app-$versionCode.apk",
            sha256 = sha256Of(file),
            sizeBytes = bytes.size.toLong(),
            minSupportedVersionCode = 0,
            notes = emptyList(),
        )
    }

    @Test
    fun `kompletny plik jest gotowy do instalacji bez sieci`() {
        val dir = temp.newFolder("updates")
        val bytes = ByteArray(4096) { (it % 251).toByte() }
        val release = releaseOf(dir, bytes)

        assertNotNull(UpdateDownloader(dir).downloaded(release))
    }

    @Test
    fun `obcięty plik nie jest gotowy do instalacji`() {
        val dir = temp.newFolder("updates")
        val release = releaseOf(dir, ByteArray(4096) { 7 })
        File(dir, "app-2.apk").writeBytes(ByteArray(10))

        assertNull(UpdateDownloader(dir).downloaded(release))
    }

    @Test
    fun `inna suma kontrolna dyskwalifikuje plik`() {
        val dir = temp.newFolder("updates")
        val release = releaseOf(dir, ByteArray(512) { 1 }).copy(sha256 = "b".repeat(64))

        assertNull(UpdateDownloader(dir).downloaded(release))
    }

    @Test
    fun `sha256 pliku zgadza się ze znaną wartością`() {
        val file = temp.newFile("przyklad.bin")
        file.writeBytes("abc".toByteArray())

        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            sha256Of(file),
        )
    }
}
