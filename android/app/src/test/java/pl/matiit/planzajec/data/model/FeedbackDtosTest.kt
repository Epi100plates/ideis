package pl.matiit.planzajec.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.core.PlanJson

class FeedbackDtosTest {

    @Test
    fun `payload koduje sie zgodnie z API`() {
        val json = PlanJson.encodeToString(
            FeedbackPayload(
                kind = "idea",
                message = "Dodajcie widżet na cały tydzień",
                version = "1.12",
                versionCode = 14,
                platform = "android",
            ),
        )

        assertTrue(json, json.contains("\"kind\":\"idea\""))
        assertTrue(json, json.contains("\"versionCode\":14"))
        assertTrue(json.contains("widżet"))
    }

    @Test
    fun `payload bez wersji nie wysyla pustych pol`() {
        val json = PlanJson.encodeToString(FeedbackPayload(kind = "bug", message = "Nie działa"))

        assertTrue(json, !json.contains("versionCode"))
        assertTrue(json, json.contains("\"platform\":\"android\""))
    }

    @Test
    fun `parsuje odpowiedz po wyslaniu zgloszenia`() {
        val body = """
            {
              "ok": true,
              "item": {
                "id": "6d5858fc201f3e35",
                "kind": "idea",
                "message": "Ciemny motyw w widżecie",
                "version": "1.12",
                "versionCode": 14,
                "platform": "android",
                "createdAt": "2026-11-14T20:00:00.000Z"
              }
            }
        """.trimIndent()

        val dto = PlanJson.decodeFromString<FeedbackCreatedDto>(body)

        assertTrue(dto.ok)
        assertEquals("6d5858fc201f3e35", dto.item?.id)
        assertEquals(false, dto.item?.isBug)
        assertEquals(14, dto.item?.versionCode)
    }

    @Test
    fun `parsuje liste zgloszen od najnowszych`() {
        val body = """
            {
              "ok": true,
              "count": 2,
              "canModerate": false,
              "items": [
                { "id": "aaaaaaaaaaaaaaaa", "kind": "bug", "message": "Błąd", "platform": "web" },
                { "id": "bbbbbbbbbbbbbbbb", "kind": "idea", "message": "Pomysł", "platform": "android" }
              ]
            }
        """.trimIndent()

        val dto = PlanJson.decodeFromString<FeedbackListDto>(body)

        assertEquals(2, dto.count)
        assertEquals(2, dto.items.size)
        assertEquals(true, dto.items[0].isBug)
        assertEquals("Pomysł", dto.items[1].message)
    }

    @Test
    fun `blad serwera jest czytelny`() {
        val dto = PlanJson.decodeFromString<FeedbackCreatedDto>(
            """{"ok":false,"error":"Za dużo zgłoszeń naraz. Spróbuj ponownie za chwilę."}""",
        )

        assertEquals(false, dto.ok)
        assertNull(dto.item)
        assertEquals("Za dużo zgłoszeń naraz. Spróbuj ponownie za chwilę.", dto.error)
    }
}
