package pl.matiit.planzajec.data.remote

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AttachmentUrlsTest {

    private val base = "https://plany.mati-it.pl/"
    private val group = "21188"
    private val classId = "2026-10-17|9:00|10:30|74835|Wyk|Infor. 1st 1sem WykN"

    @Test
    fun `lista koduje identyfikator zajec`() {
        val url = AttachmentUrls.list(base, group, classId)

        assertTrue(url.startsWith("https://plany.mati-it.pl/api/attachments?group=21188&class="))
        assertTrue(url.contains("%7C"))
        assertTrue(url.contains("%3A"))
        assertTrue(url.contains("Infor.+1st") || url.contains("Infor.%201st"))
    }

    @Test
    fun `upload doklada nazwe pliku`() {
        val url = AttachmentUrls.upload(base, group, classId, "notatka 1.pdf")

        assertTrue(url.contains("&name=notatka+1.pdf"))
        assertTrue(url.contains("/api/attachments?"))
    }

    @Test
    fun `linki maja osobna sciezke`() {
        val url = AttachmentUrls.links(base, group, classId)

        assertTrue(url.startsWith("https://plany.mati-it.pl/api/attachments/links?"))
    }

    @Test
    fun `usuwanie pliku i linku roznia sie sciezka`() {
        val id = "0123456789abcdef01234567"

        assertEquals(
            "https://plany.mati-it.pl/api/attachments/$id?group=21188&class=${enc(classId)}",
            AttachmentUrls.deleteFile(base, group, classId, id),
        )
        assertEquals(
            "https://plany.mati-it.pl/api/attachments/links/$id?group=21188&class=${enc(classId)}",
            AttachmentUrls.deleteLink(base, group, classId, id),
        )
    }

    @Test
    fun `pobieranie to ten sam adres co usuwanie`() {
        val id = "0123456789abcdef01234567"

        assertEquals(
            AttachmentUrls.deleteFile(base, group, classId, id),
            AttachmentUrls.download(base, group, classId, id),
        )
    }

    @Test
    fun `indeks nie potrzebuje grupy ani zajec`() {
        assertEquals(
            "https://plany.mati-it.pl/api/attachments/index",
            AttachmentUrls.index(base),
        )
        // Adres z ukośnikiem na końcu też ma być poprawny.
        assertEquals(
            "https://plany.mati-it.pl/api/attachments/index",
            AttachmentUrls.index("https://plany.mati-it.pl"),
        )
    }

    private fun enc(value: String) = java.net.URLEncoder.encode(value, "UTF-8")
}
