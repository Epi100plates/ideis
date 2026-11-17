package pl.matiit.planzajec.data

import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.matiit.planzajec.Fixtures
import pl.matiit.planzajec.data.local.PlanSettings
import pl.matiit.planzajec.data.local.PlanStorage
import pl.matiit.planzajec.data.local.StoredGroups
import pl.matiit.planzajec.data.local.StoredPlan
import pl.matiit.planzajec.data.model.GroupsDto
import pl.matiit.planzajec.data.model.KierunkiDto
import pl.matiit.planzajec.data.model.SpecjalnosciDto
import pl.matiit.planzajec.data.model.TrybyDto
import pl.matiit.planzajec.data.model.PlanDto
import pl.matiit.planzajec.data.model.PlanVersionDto
import pl.matiit.planzajec.data.model.VersionDto
import pl.matiit.planzajec.data.remote.PlanRemote
import pl.matiit.planzajec.domain.PlanSelection

class PlanRepositoryTest {

    private val plan = Fixtures.samplePlan()
    private val now = 1_000_000L

    /** Rok akademicki „na sztywno”, żeby klucze wpisów były powtarzalne. */
    private val currentYear = 2026

    private fun repository(
        remote: FakeRemote = FakeRemote(),
        storage: PlanStorage = MemoryStorage(),
        settings: PlanSettings = MemorySettings(),
    ) = PlanRepository(remote, storage, settings, clock = { now }, currentAcademicYear = { currentYear })

    @Test
    fun `swiezy cache nie pyta sieci`() = runBlocking {
        val remote = FakeRemote()
        val storage = MemoryStorage().apply { writePlan("21188", plan, now) }

        val outcome = repository(remote, storage).refresh(PlanTarget("21188"))

        assertTrue(outcome is RefreshOutcome.Cached)
        assertEquals(0, remote.versionCalls)
        assertEquals(0, remote.planCalls)
    }

    @Test
    fun `ta sama wersja na serwerze nie pobiera planu`() = runBlocking {
        val remote = FakeRemote(currentVersionId = 7L)
        val storage = MemoryStorage().apply { writePlan("21188", plan, now - 3_600_000) }

        val outcome = repository(remote, storage).refresh(PlanTarget("21188"))

        assertTrue(outcome is RefreshOutcome.NotModified)
        assertEquals(1, remote.versionCalls)
        assertEquals(0, remote.planCalls)
    }

    @Test
    fun `nowa wersja pobiera i zapisuje plan`() = runBlocking {
        val remote = FakeRemote(currentVersionId = 8L)
        val storage = MemoryStorage().apply { writePlan("21188", plan, now - 3_600_000) }

        val outcome = repository(remote, storage).refresh(PlanTarget("21188"))

        assertTrue(outcome is RefreshOutcome.Updated)
        assertEquals(1, remote.planCalls)
        assertEquals(1, storage.plans.size)
    }

    @Test
    fun `force pomija swiezosc cache`() = runBlocking {
        val remote = FakeRemote(currentVersionId = 8L)
        val storage = MemoryStorage().apply { writePlan("21188", plan, now) }

        val outcome = repository(remote, storage).refresh(PlanTarget("21188"), force = true)

        assertTrue(outcome is RefreshOutcome.Updated)
        assertEquals(1, remote.planCalls)
    }

    @Test
    fun `brak sieci przy cache konczy sie trybem offline`() = runBlocking {
        val remote = FakeRemote().apply { failure = IOException("brak sieci") }
        val storage = MemoryStorage().apply { writePlan("21188", plan, now - 3_600_000) }

        val outcome = repository(remote, storage).refresh(PlanTarget("21188"))

        assertTrue(outcome is RefreshOutcome.Offline)
    }

    @Test
    fun `brak sieci bez cache to blad`() = runBlocking {
        val remote = FakeRemote().apply { failure = IOException("brak sieci") }

        val outcome = repository(remote).refresh(PlanTarget("21188"))

        assertTrue(outcome is RefreshOutcome.Failed)
    }

    @Test
    fun `wybor grupy jest zapamietywany razem z wymiarami`() {
        val settings = MemorySettings()
        val repository = repository(settings = settings)

        assertEquals("21188", repository.currentGroup())
        assertTrue(!repository.hasChosenGroup())

        val selection = PlanSelection(nabor = "2024", field = "Informatyka", year = "2", degree = "1st", mode = "N")
        repository.selectGroup("21189", selection)

        assertEquals("21189", repository.currentGroup())
        assertEquals(selection, repository.currentSelection())
        assertEquals("21189", settings.groupId)
        assertTrue(repository.hasChosenGroup())
    }

    @Test
    fun `planChanged jest falszywe gdy odcisk ten sam`() = runBlocking {
        val remote = FakeRemote(currentVersionId = 3L, currentFingerprint = "a1b2")
        val storage = MemoryStorage().apply {
            writePlan(
                "21188",
                plan.copy(version = PlanVersionDto(id = 3L, fingerprint = "a1b2")),
                now,
            )
        }

        val changed = repository(remote, storage).planChanged(PlanTarget("21188"))

        assertFalse(changed)
        assertEquals(1, remote.versionCalls)
        assertEquals(0, remote.planCalls)
    }

    @Test
    fun `planChanged jest prawdziwe gdy odcisk inny`() = runBlocking {
        val remote = FakeRemote(currentVersionId = 3L, currentFingerprint = "nowy")
        val storage = MemoryStorage().apply {
            writePlan(
                "21188",
                plan.copy(version = PlanVersionDto(id = 3L, fingerprint = "stary")),
                now,
            )
        }

        assertTrue(repository(remote, storage).planChanged(PlanTarget("21188")))
    }

    @Test
    fun `planChanged bez cache każe pobrac plan`() = runBlocking {
        val remote = FakeRemote()

        assertTrue(repository(remote).planChanged(PlanTarget("21188")))
        assertEquals(0, remote.versionCalls)
    }

    @Test
    fun `planChanged przy braku sieci nie udaje zmiany`() = runBlocking {
        val remote = FakeRemote().apply { failure = IOException("brak sieci") }
        val storage = MemoryStorage().apply {
            writePlan(
                "21188",
                plan.copy(version = PlanVersionDto(id = 3L, fingerprint = "a1b2")),
                now,
            )
        }

        assertFalse(repository(remote, storage).planChanged(PlanTarget("21188")))
    }

    @Test
    fun `rok akademicki trafia do API jako ay`() = runBlocking {
        val remote = FakeRemote(currentVersionId = 8L)
        val settings = MemorySettings()
        val repository = repository(remote, settings = settings)

        // Nabór 2024 i 2. rok studiów → plan 2025/2026.
        repository.selectGroup("21188", PlanSelection(nabor = "2024", year = "2"))
        val target = repository.currentTarget()
        assertEquals(2025, target.academicYear)

        repository.refresh(target, force = true)

        assertEquals(PlanTarget("21188", 2025, listOf("21188")), remote.lastVersionTarget)
        assertEquals(PlanTarget("21188", 2025, listOf("21188")), remote.lastPlanTarget)
    }

    @Test
    fun `biezacy rok akademicki nie dokleja sufiksu do klucza`() = runBlocking {
        val remote = FakeRemote(currentVersionId = 8L)
        val storage = MemoryStorage()
        val settings = MemorySettings()
        val repository = repository(remote, storage, settings)

        repository.selectGroup("21188", PlanSelection(nabor = "2026", year = "1"))
        repository.refresh(repository.currentTarget(), force = true)

        assertTrue("plan zapisany pod kluczem bez sufiksu", storage.plans.containsKey("21188"))
    }

    @Test
    fun `starszy nabor ma osobny wpis cache`() = runBlocking {
        val remote = FakeRemote(currentVersionId = 8L)
        val storage = MemoryStorage()
        val repository = repository(remote, storage)

        repository.selectGroup("21188", PlanSelection(nabor = "2024", year = "2"))
        repository.refresh(repository.currentTarget(), force = true)

        assertTrue("plan starszego naboru pod kluczem z rokiem", storage.plans.containsKey("21188@2025"))
        assertTrue(!storage.plans.containsKey("21188"))
    }

    @Test
    fun `plan bez naboru pyta o biezacy rok akademicki`() = runBlocking {
        val remote = FakeRemote(currentVersionId = 8L)
        val repository = repository(remote)

        repository.selectGroup("21188", PlanSelection())
        repository.refresh(repository.currentTarget(), force = true)

        assertNull(remote.lastVersionTarget?.academicYear)
    }

    @Test
    fun `styl jest zapamietywany`() {
        val settings = MemorySettings()
        val repository = repository(settings = settings)

        assertEquals(null, repository.currentStyle())

        repository.selectStyle("visionos-light")

        assertEquals("visionos-light", repository.currentStyle())
        assertEquals("visionos-light", settings.styleId)
    }

    @Test
    fun `katalog grup jest cache'owany na dobe`() = runBlocking {
        val remote = FakeRemote()
        val storage = MemoryStorage().apply {
            writeGroups(GroupsDto(ok = true, groups = emptyList()), now - 3_600_000)
        }

        val groups = repository(remote, storage).groups()

        assertEquals(0, remote.groupsCalls)
        assertTrue(groups != null)
    }

    @Test
    fun `przestarzaly katalog grup jest odswiezany`() = runBlocking {
        val remote = FakeRemote()
        val storage = MemoryStorage().apply {
            writeGroups(GroupsDto(ok = true, groups = emptyList()), now - 25 * 3_600_000)
        }

        val groups = repository(remote, storage).groups()

        assertEquals(1, remote.groupsCalls)
        assertTrue(groups != null)
    }

    private class FakeRemote(
        private val currentVersionId: Long = 7L,
        private val currentFingerprint: String? = null,
    ) : PlanRemote {
        var failure: IOException? = null
        var versionCalls = 0
        var planCalls = 0
        var groupsCalls = 0
        var lastVersionTarget: PlanTarget? = null
        var lastPlanTarget: PlanTarget? = null
        var lastSpecjalnosciKey: String? = null
        var lastTrybyKey: String? = null

        override suspend fun plan(target: PlanTarget): PlanDto {
            planCalls++
            lastPlanTarget = target
            failure?.let { throw it }
            return Fixtures.samplePlan()
        }

        override suspend fun version(target: PlanTarget): VersionDto {
            versionCalls++
            lastVersionTarget = target
            failure?.let { throw it }
            return VersionDto(
                ok = true,
                groupId = target.groupId,
                currentId = currentVersionId,
                currentFingerprint = currentFingerprint,
            )
        }

        override suspend fun groups(): GroupsDto {
            groupsCalls++
            failure?.let { throw it }
            return GroupsDto(ok = true, groups = emptyList())
        }

        override suspend fun kierunki(): KierunkiDto {
            failure?.let { throw it }
            return KierunkiDto(ok = true)
        }

        override suspend fun specjalnosci(kierunekId: String, nabor: String): SpecjalnosciDto {
            failure?.let { throw it }
            lastSpecjalnosciKey = "$kierunekId@$nabor"
            return SpecjalnosciDto(ok = true)
        }

        override suspend fun tryby(kierunekId: String, nabor: String, spec: String): TrybyDto {
            failure?.let { throw it }
            lastTrybyKey = "$kierunekId@$nabor@$spec"
            return TrybyDto(ok = true)
        }
    }

    private class MemoryStorage : PlanStorage {
        val plans = mutableMapOf<String, StoredPlan>()
        var groups: StoredGroups? = null

        fun writePlan(key: String, plan: PlanDto, savedAt: Long) {
            plans[key] = StoredPlan(plan, savedAt)
        }

        override fun readPlan(key: String): StoredPlan? = plans[key]

        override fun writePlan(key: String, plan: PlanDto) {
            plans[key] = StoredPlan(plan, 0L)
        }

        override fun readGroups(): StoredGroups? = groups

        override fun writeGroups(groups: GroupsDto) {
            this.groups = StoredGroups(groups, 0L)
        }

        fun writeGroups(groups: GroupsDto, savedAt: Long) {
            this.groups = StoredGroups(groups, savedAt)
        }
    }

    private class MemorySettings : PlanSettings {
        override var groupId: String? = "21188"
        override var planGroups: List<String> = emptyList()
        override var selection: PlanSelection = PlanSelection()
        override var groupsFetchedAt: Long = 0L
        override var styleId: String? = null
        override var hasChosenGroup: Boolean = false
        override var whatsNewSeenVersion: Int = 0
        private val checked = mutableMapOf<String, Long>()

        override fun checkedAt(key: String): Long = checked[key] ?: 0L

        override fun setCheckedAt(key: String, millis: Long) {
            checked[key] = millis
        }
    }
}
