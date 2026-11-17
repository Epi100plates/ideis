package pl.matiit.planzajec.domain

import java.time.LocalDate
import pl.matiit.planzajec.data.model.GroupDto

/**
 * Kreator wyboru planu — port `public/wizard.js` z wersji web.
 *
 * Kolejność kroków (od 16.11.2026 taka sama jak w PWA): **rocznik → kierunek →
 * specjalność (opcjonalna) → tryb studiów → plan** (patrz `PickerSteps`).
 * Rocznik jest pierwszy, bo oferta kierunków i specjalności jest rocznikowa.
 * Semestr nie jest polem formularza: wynika z rocznika i bieżącej daty
 * (październik–luty = semestr zimowy, marzec–wrzesień = letni), a plan bazowy
 * to grupa wykładowa z tego semestru.
 *
 * Dostępność roczników, specjalności i trybów liczy serwer
 * (`server/ideis-options.js`) — tu zostaje tylko czysta arytmetyka roku
 * studiów i wybór grup.
 *
 * Cała logika jest czysta (bez Androida), więc testy JVM sprawdzają ją tak samo
 * jak self-test serwera sprawdza wersję JS.
 */
object PlanWizard {

    /** Wydział obsługiwany przez aplikację — reszta to studia podyplomowe i filie. */
    const val FACULTY_LABEL = "Wydział Studiów Stosowanych we Wrocławiu"

    enum class Season { WINTER, SUMMER }

    data class Semester(val year: Int, val semester: Int, val season: Season)

    /**
     * Rok studiów dla rocznika w danym roku akademickim:
     *   rocznik 2024, rok akademicki 2026/2027 → 3. rok
     * `null`, gdy wartości nie da się policzyć (brak rocznika, rok spoza 1–9).
     */
    fun cohortYear(academicYearStart: Int?, nabor: String): Int? {
        val ay = academicYearStart ?: return null
        val start = nabor.toIntOrNull() ?: return null
        if (ay < 2000 || start < 2000) return null
        val year = ay - start + 1
        return if (year in 1..9) year else null
    }

    /** Semestr roku akademickiego z daty: X–II zimowy, III–IX letni. */
    fun seasonOf(date: LocalDate): Season =
        if (date.monthValue >= 10 || date.monthValue <= 2) Season.WINTER else Season.SUMMER

    /**
     * Rok i semestr dla naboru w danym roku akademickim.
     *   nabór 2024, rok akademicki 2026/2027, zima → 3. rok, semestr 5
     */
    fun semesterFor(academicYearStart: Int?, nabor: String, date: LocalDate = LocalDate.now()): Semester? {
        val ay = academicYearStart ?: return null
        val start = nabor.toIntOrNull() ?: return null
        if (ay < 2000 || start < 2000) return null
        val year = ay - start + 1
        if (year !in 1..9) return null
        val season = seasonOf(date)
        val semester = if (season == Season.WINTER) (2 * year) - 1 else 2 * year
        return Semester(year, semester, season)
    }

    /** Wybór z uzupełnionym rokiem i semestrem (semestr jest filtrem, nie polem). */
    fun withSemester(selection: PlanSelection, academicYearStart: Int?, date: LocalDate = LocalDate.now()): PlanSelection {
        val info = semesterFor(academicYearStart, selection.nabor, date) ?: return selection.copy(year = PlanSelection.ANY, sem = PlanSelection.ANY)
        return selection.copy(year = info.year.toString(), sem = info.semester.toString())
    }

    /**
     * Plany bazowe (grupy wykładowe) dla wyboru. Gdy kierunek nie ma wykładu
     * w tym semestrze, pokazujemy pierwsze pasujące grupy, żeby dało się wejść
     * w plan (np. specjalność uruchomiona tylko na starszym roku).
     */
    fun baseCandidates(groups: List<GroupDto>, selection: PlanSelection): List<GroupDto> {
        val pool = PlanSelectionLogic.filter(groups, selection)
        val lectures = pool.filter { it.kind == "Wyk" }
        if (lectures.isNotEmpty()) return lectures
        val semester = pool.filter { selection.sem == PlanSelection.ANY || it.semester?.toString() == selection.sem }
        return semester.ifEmpty { pool }
    }

    /**
     * Krok „plan”: kandydaci **oraz** wybór, którego trzeba odtąd używać.
     *
     * Gdy w wybranym semestrze nie ma grup (starszy rocznik, specjalność
     * uruchomiona później), luzujemy semestr i zwracamy wybór bez niego —
     * inaczej lista grup do dodania filtrowałaby się po semestrze, którego
     * w katalogu nie ma. To odpowiednik `computePlanCandidates` z webu.
     */
    fun planStep(
        groups: List<GroupDto>,
        selection: PlanSelection,
    ): Pair<PlanSelection, List<GroupDto>> {
        val strict = baseCandidates(groups, selection)
        if (strict.isNotEmpty() || selection.sem == PlanSelection.ANY) return selection to strict
        val relaxedSelection = selection.copy(sem = PlanSelection.ANY)
        val relaxed = baseCandidates(groups, relaxedSelection)
        return if (relaxed.isNotEmpty()) relaxedSelection to relaxed else selection to strict
    }

    /**
     * Grupy, które można dodać do planu: wszystko **poza wykładami** (są takie
     * same dla wszystkich) i poza grupami już dodanymi.
     */
    fun addableGroups(
        groups: List<GroupDto>,
        selection: PlanSelection,
        planGroups: List<String> = emptyList(),
    ): List<GroupDto> {
        val used = planGroups.toSet()
        val collator = java.text.Collator.getInstance(java.util.Locale.forLanguageTag("pl"))
        return PlanSelectionLogic.filter(groups, selection)
            .filter { it.kind != "Wyk" && it.id !in used }
            .sortedWith { a, b ->
                val kind = collator.compare(a.kind.orEmpty(), b.kind.orEmpty())
                if (kind != 0) kind else a.number.orEmpty().compareTo(b.number.orEmpty(), ignoreCase = true)
            }
    }

    private val KIND_LABELS = mapOf(
        "Ćw" to "Ćwiczenia",
        "Lab" to "Laboratorium",
        "Sem" to "Seminarium",
        "Lekt" to "Lektorat",
        "Warszt" to "Warsztat",
        "Proj" to "Projekt",
        "Prak" to "Praktyka",
        "Inf" to "Informatyka",
        "Egz" to "Egzamin",
        "eLear" to "e-learning",
    )

    fun kindLabel(kind: String?): String = KIND_LABELS[kind] ?: kind ?: "Zajęcia"
}
