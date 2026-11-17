package pl.matiit.planzajec.data.remote

import pl.matiit.planzajec.data.PlanTarget
import pl.matiit.planzajec.data.model.GroupsDto
import pl.matiit.planzajec.data.model.KierunkiDto
import pl.matiit.planzajec.data.model.PlanDto
import pl.matiit.planzajec.data.model.SpecjalnosciDto
import pl.matiit.planzajec.data.model.TrybyDto
import pl.matiit.planzajec.data.model.VersionDto

/** Interfejs sieciowy — dzięki niemu repozytorium da się testować bez HTTP. */
interface PlanRemote {
    /**
     * Plan grupy (albo scalony plan kilku grup — `target.orderedGroups`).
     * `target.academicYear` trafia do API jako `ay` — bez niego serwer
     * odpowiada planem bieżącego roku akademickiego.
     */
    suspend fun plan(target: PlanTarget): PlanDto
    suspend fun version(target: PlanTarget): VersionDto

    /** Pełny katalog uczelni z wymiarami (kierunek, specjalność, rok, nabór…). */
    suspend fun groups(): GroupsDto

    /** Kierunki z formularza uczelni (stały wydział — patrz `PlanWizard`). */
    suspend fun kierunki(): KierunkiDto

    /**
     * Specjalności kierunku w wybranym roczniku. Rocznik jest parametrem, bo
     * oferta jest rocznikowa — ten sam kierunek ma inne specjalności dla
     * naboru 2024 i 2026.
     */
    suspend fun specjalnosci(kierunekId: String, nabor: String = ""): SpecjalnosciDto

    /** Tryby studiów, które mają grupy w wyborze (kierunek + rocznik + specjalność). */
    suspend fun tryby(kierunekId: String, nabor: String, spec: String): TrybyDto
}
