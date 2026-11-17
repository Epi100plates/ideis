package pl.matiit.planzajec.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.core.PlanJson

class AttachmentDtosTest {

    private val sample = """
        {
          "ok": true,
          "group": "21188",
          "classId": "2026-11-14|10:45|12:15|100|Ćw|Infor. 1st 1sem Ćw2N",
          "attachments": [
            {
              "id": "0123456789abcdef01234567",
              "name": "notatka.pdf",
              "ext": "pdf",
              "kind": "pdf",
              "mime": "application/pdf",
              "size": 2048,
              "uploadedAt": "2026-11-10T10:00:00.000Z",
              "url": "/api/attachments/0123456789abcdef01234567"
            }
          ],
          "links": [
            {
              "id": "89abcdef0123456701234567",
              "url": "https://example.com/material",
              "title": "Materiał z wykładu",
              "host": "example.com",
              "addedAt": "2026-11-10T11:00:00.000Z"
            }
          ],
          "limits": {
            "maxFileBytes": 26214400,
            "maxFilesPerClass": 30,
            "maxLinksPerClass": 30,
            "allowed": ["pdf", "docx"],
            "allowedLabel": "PDF, DOCX"
          }
        }
    """.trimIndent()

    @Test
    fun `parsuje pliki linki i limity`() {
        val dto = PlanJson.decodeFromString(AttachmentListDto.serializer(), sample)

        assertTrue(dto.ok)
        assertEquals(1, dto.attachments.size)
        assertEquals("notatka.pdf", dto.attachments[0].name)
        assertEquals("pdf", dto.attachments[0].ext)
        assertEquals(2048L, dto.attachments[0].size)
        assertEquals(1, dto.links.size)
        assertEquals("Materiał z wykładu", dto.links[0].title)
        assertEquals(26214400L, dto.limits?.maxFileBytes)
        assertEquals("PDF, DOCX", dto.limits?.allowedLabel)
    }

    @Test
    fun `pusta odpowiedz jest bezpieczna`() {
        val dto = PlanJson.decodeFromString(AttachmentListDto.serializer(), """{"ok":true}""")

        assertTrue(dto.attachments.isEmpty())
        assertTrue(dto.links.isEmpty())
        assertEquals(null, dto.limits)
    }

    @Test
    fun `ignoruje nieznane pola z serwera`() {
        val dto = PlanJson.decodeFromString(
            AttachmentListDto.serializer(),
            """{"ok":true,"nowePole":123,"attachments":[{"id":"a","name":"x.txt","ext":"txt","size":1,"dodatkowe":true}]}""",
        )

        assertEquals("x.txt", dto.attachments[0].name)
    }

    @Test
    fun `indeks mapuje identyfikator zajec na liczniki`() {
        // Klucze to identyfikatory z planu — zawierają `|`, `:` i spacje, więc
        // sprawdzamy, czy mapa z JSON-a trafia w te same napisy co plan.
        val lecture = "2026-10-17|9:00|10:30|74835|Wyk|Infor. 1st 1sem WykN"
        val body = """
            {
              "ok": true,
              "classes": {
                "$lecture": { "files": 2, "links": 1 },
                "2026-11-14|10:45|12:15|100|Ćw|Infor. 1st 1sem Ćw2N": { "files": 0, "links": 1 },
                "2026-11-15|9:00|10:30|102|Wyk|Infor. 1st 1sem WykN": { "files": 0, "links": 0 }
              }
            }
        """.trimIndent()

        val dto = PlanJson.decodeFromString(AttachmentIndexDto.serializer(), body)

        assertTrue(dto.ok)
        assertEquals(3, dto.classes.size)
        assertEquals(2, dto.classes[lecture]?.files)
        assertEquals(1, dto.classes[lecture]?.links)
        assertTrue(dto.classes[lecture]!!.hasAny)
        // Puste wpisy nie powinny dawać spinacza.
        val withAny = dto.classes.filterValues { it.hasAny }.keys
        assertEquals(2, withAny.size)
        assertTrue(dto.classes["2026-11-15|9:00|10:30|102|Wyk|Infor. 1st 1sem WykN"]!!.hasAny.not())
    }
}
