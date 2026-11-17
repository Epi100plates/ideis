package pl.matiit.planzajec.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.core.PlanJson

/**
 * Katalog uczelni z serwera ideis: krótkie klucze (`f`, `s`, `d`, `m`, `y`,
 * `b`) i wymiary, których wcześniejsza wersja aplikacji w ogóle nie znała.
 */
class GroupsDtoTest {

    private fun sample(): GroupsDto {
        val stream = GroupsDtoTest::class.java.getResourceAsStream("/groups-sample.json")
            ?: error("Brak groups-sample.json w test resources")
        val text = stream.use { it.readBytes().decodeToString() }
        return PlanJson.decodeFromString(GroupsDto.serializer(), text)
    }

    @Test
    fun `parsuje katalog z wymiarami`() {
        val dto = sample()

        assertTrue(dto.ok)
        assertEquals(3, dto.groups.size)
        assertEquals("21188", dto.defaultGroup)
        assertEquals("2026", dto.defaults?.nabor)
        assertEquals("Informatyka", dto.defaults?.field)
        assertEquals("2026/2027", dto.academicYear?.label)
    }

    @Test
    fun `pierwszy rok nie ma specjalnosci`() {
        val group = sample().groups.first { it.id == "21188" }

        assertNull(group.spec)
        assertEquals("Informatyka", group.field)
        assertEquals(1, group.year)
        assertEquals("1st", group.degree)
        assertEquals("N", group.mode)
        assertEquals(1, group.semester)
        assertEquals("Ćw", group.kind)
        assertEquals("2", group.number)
        assertEquals(10, group.nabory.size)
    }

    @Test
    fun `starszy rok ma specjalnosc i wlasny nabor`() {
        val group = sample().groups.first { it.id == "20679" }

        assertEquals("Prawo w biznesie i administracji", group.spec)
        assertEquals(2, group.year)
        assertEquals(listOf(2024, 2025), group.nabory)
    }

    @Test
    fun `grupa bez toków nie dostaje wymyslonych wymiarow`() {
        val group = sample().groups.first { it.id == "22413" }

        assertNull(group.year)
        assertNull(group.degree)
        assertNull(group.mode)
        assertTrue(group.nabory.isEmpty())
    }
}
