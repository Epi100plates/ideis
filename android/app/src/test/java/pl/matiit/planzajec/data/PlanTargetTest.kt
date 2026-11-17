package pl.matiit.planzajec.data

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Klucz wpisu planu: jedna grupa zostaje przy starym „21188”, kilka grup to
 * „21613+21614”, a starszy nabór dokłada „@RRRR”. Ten sam klucz trafia do
 * plików planu, wersji i widżetów, więc nie może się zmienić przypadkiem.
 */
class PlanTargetTest {

    @Test
    fun `jedna grupa w biezacym roku nie ma sufiksu`() {
        assertEquals("21188", PlanTarget("21188").key(2026))
        assertEquals("21188", PlanTarget("21188", 2026).key(2026))
    }

    @Test
    fun `starszy nabor ma sufiks roku akademickiego`() {
        assertEquals("21188@2025", PlanTarget("21188", 2025).key(2026))
        assertEquals("21613+21614@2025", PlanTarget("21613", 2025, listOf("21613", "21614")).key(2026))
    }

    @Test
    fun `kilka grup laczy sie plusem`() {
        val target = PlanTarget("21613", 2026, listOf("21613", "21614", "22007"))
        assertEquals("21613+21614+22007", target.key(2026))
        assertEquals(listOf("21613", "21614", "22007"), target.orderedGroups)
    }

    @Test
    fun `klucz wraca do tej samej listy grup`() {
        val target = PlanTarget("21613", 2025, listOf("21613", "21614"))
        val restored = PlanTarget.ofKey(target.key(2026))
        assertEquals(target, restored)
    }

    @Test
    fun `stary klucz jednej grupy dalej dziala`() {
        assertEquals(PlanTarget("21188", 2025, listOf("21188")), PlanTarget.ofKey("21188@2025"))
        assertEquals(PlanTarget("21188", null, listOf("21188")), PlanTarget.ofKey("21188"))
    }
}
