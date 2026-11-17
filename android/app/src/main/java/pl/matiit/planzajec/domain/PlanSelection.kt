package pl.matiit.planzajec.domain

import pl.matiit.planzajec.data.model.GroupDto
import pl.matiit.planzajec.data.model.SelectionDefaultsDto

/**
 * Wybór w pickerze: nabór, kierunek, specjalność, rok, typ studiów, tryb.
 *
 * Port reguły z `public/selection.js` serwera ideis — ten sam kontrakt co
 * przeglądarka, żeby APK i web pokazywały dokładnie te same grupy:
 *
 *   ""   — dowolna wartość (pole „— dowolny —”, brak filtra)
 *   "—"  — grupy bez tego wymiaru (np. Erasmus+ bez stopnia, 1. rok bez
 *          specjalności) — specjalność bywa nieobowiązkowa
 *   inne — konkretna wartość z katalogu
 *
 * Uczelnia nie publikuje tych wymiarów osobno; serwer wyprowadza je z nazwy
 * grupy i kolumny „Toki nauki” (`server/dimensions.js`), a aplikacja tylko je
 * czyta i porównuje.
 */
data class PlanSelection(
    val nabor: String = ANY,
    val field: String = ANY,
    val spec: String = ANY,
    val year: String = ANY,
    val degree: String = ANY,
    val mode: String = ANY,
    /** Semestr wyliczony z naboru i daty (`PlanWizard.withSemester`) — filtr, nie pole. */
    val sem: String = ANY,
) {

    /** Czy wybór cokolwiek zawęża (wszystkie pola „dowolny”). */
    fun isAny(): Boolean = listOf(nabor, field, spec, year, degree, mode, sem).all { it == ANY }

    /**
     * Rok akademicki planu: nabór 2024 + 2. rok studiów = 2025/2026.
     * Bez naboru nie ma czego liczyć — wtedy pytamy o bieżący rok serwera.
     */
    fun academicYear(): Int? {
        val start = nabor.toIntOrNull() ?: return null
        if (start < 2000) return null
        val studyYear = year.toIntOrNull()?.takeIf { it >= 1 } ?: return start
        return start + studyYear - 1
    }

    /** Czy grupa pasuje do całego wyboru naraz. */
    fun matches(group: GroupDto): Boolean {
        if (!matchesNabory(group.nabory, nabor)) return false
        if (!matchesText(group.field, field)) return false
        if (!matchesText(group.spec, spec)) return false
        if (!matchesNumber(group.year, year)) return false
        if (!matchesText(group.degree, degree)) return false
        if (!matchesText(group.mode, mode)) return false
        // Semestr zawęża plan do bieżącego semestru roku akademickiego.
        if (!matchesNumber(group.semester, sem)) return false
        return true
    }

    /** Wartość wymiaru w formie „drutowej” — do porównań i zapisu w ustawieniach. */
    fun value(dimension: Dimension): String = when (dimension) {
        Dimension.NABOR -> nabor
        Dimension.FIELD -> field
        Dimension.SPEC -> spec
        Dimension.YEAR -> year
        Dimension.DEGREE -> degree
        Dimension.MODE -> mode
        Dimension.SEM -> sem
    }

    fun with(dimension: Dimension, value: String): PlanSelection = when (dimension) {
        Dimension.NABOR -> copy(nabor = value)
        Dimension.FIELD -> copy(field = value)
        Dimension.SPEC -> copy(spec = value)
        Dimension.YEAR -> copy(year = value)
        Dimension.DEGREE -> copy(degree = value)
        Dimension.MODE -> copy(mode = value)
        Dimension.SEM -> copy(sem = value)
    }

    companion object {
        /** Pole „dowolny/-a” — bez filtrowania. */
        const val ANY = ""

        /** Wartość oznaczająca „grupy bez tego wymiaru”. */
        const val NONE = "—"

        private fun matchesText(value: String?, wanted: String): Boolean = when (wanted) {
            ANY -> true
            NONE -> value.isNullOrBlank()
            else -> value == wanted
        }

        private fun matchesNumber(value: Int?, wanted: String): Boolean = when (wanted) {
            ANY -> true
            NONE -> value == null
            else -> value == wanted.toIntOrNull()
        }

        private fun matchesNabory(values: List<Int>, wanted: String): Boolean = when (wanted) {
            ANY -> true
            NONE -> values.isEmpty()
            else -> {
                val number = wanted.toIntOrNull()
                number != null && values.any { it == number }
            }
        }
    }
}

/** Wymiary katalogu w kolejności z pickera (jak `DIMENSIONS` w selection.js). */
enum class Dimension { NABOR, FIELD, SPEC, YEAR, DEGREE, MODE, SEM }

/** Wybór początkowy z serwera (`defaults` w `/api/groups`) → wybór w pickerze. */
fun SelectionDefaultsDto.toSelection(): PlanSelection = PlanSelection(
    nabor = nabor,
    field = field,
    spec = spec,
    year = year,
    degree = degree,
    mode = mode,
)

/** Dostępne wartości każdego wymiaru dla bieżącego wyboru. */
data class SelectionFacets(
    val nabor: List<String?> = emptyList(),
    val field: List<String?> = emptyList(),
    val spec: List<String?> = emptyList(),
    val year: List<String?> = emptyList(),
    val degree: List<String?> = emptyList(),
    val mode: List<String?> = emptyList(),
) {
    fun of(dimension: Dimension): List<String?> = when (dimension) {
        Dimension.NABOR -> nabor
        Dimension.FIELD -> field
        Dimension.SPEC -> spec
        Dimension.YEAR -> year
        Dimension.DEGREE -> degree
        Dimension.MODE -> mode
        Dimension.SEM -> emptyList()
    }
}

/**
 * Dopasowanie grup do wyboru — czysta logika, wspólna dla ekranu powitalnego
 * i arkusza „Grupa”. Wydzielona z ViewModelu, żeby dała się przetestować bez
 * Androida.
 */
object PlanSelectionLogic {

    /**
     * Rok i nabór to jedna informacja o roczniku: rok akademicki = nabór +
     * (rok studiów − 1). Liczone osobno zablokowałyby się nawzajem (nabór 2026
     * nie ma 2. roku), więc przy liczeniu opcji te dwa wymiary luzujemy razem.
     */
    private val COUPLED = mapOf(
        Dimension.NABOR to listOf(Dimension.YEAR),
        Dimension.YEAR to listOf(Dimension.NABOR),
    )

    /**
     * Kierunek jest nawigacją po całym katalogu, więc jego lista nigdy nie jest
     * zawężana przez pozostałe pola — inaczej przy „I stopnia, niestacjonarne”
     * nie dałoby się przejść na kierunek z samymi jednolitymi magisterskimi.
     */
    private val ALWAYS_WIDE = setOf(Dimension.FIELD)

    fun filter(groups: List<GroupDto>, selection: PlanSelection): List<GroupDto> =
        groups.filter(selection::matches)

    fun facets(groups: List<GroupDto>, selection: PlanSelection): SelectionFacets {
        val result = HashMap<Dimension, List<String?>>()
        for (dimension in Dimension.entries) {
            // Semestr jest wyliczany, nie wybierany — nie ma listy opcji.
            if (dimension == Dimension.SEM) continue
            var relaxed = selection.with(dimension, PlanSelection.ANY)
            for (other in COUPLED[dimension].orEmpty()) relaxed = relaxed.with(other, PlanSelection.ANY)
            if (dimension in ALWAYS_WIDE) {
                for (other in Dimension.entries) relaxed = relaxed.with(other, PlanSelection.ANY)
            }
            val values = LinkedHashSet<String?>()
            for (group in filter(groups, relaxed)) {
                when (dimension) {
                    Dimension.NABOR -> {
                        if (group.nabory.isEmpty()) values.add(null)
                        group.nabory.forEach { values.add(it.toString()) }
                    }

                    Dimension.FIELD -> values.add(group.field?.takeIf { it.isNotBlank() })
                    Dimension.SPEC -> values.add(group.spec?.takeIf { it.isNotBlank() })
                    Dimension.YEAR -> values.add(group.year?.toString())
                    Dimension.DEGREE -> values.add(group.degree?.takeIf { it.isNotBlank() })
                    Dimension.MODE -> values.add(group.mode?.takeIf { it.isNotBlank() })
                    Dimension.SEM -> Unit
                }
            }
            result[dimension] = sortValues(dimension, values.toList())
        }
        return SelectionFacets(
            nabor = result[Dimension.NABOR].orEmpty(),
            field = result[Dimension.FIELD].orEmpty(),
            spec = result[Dimension.SPEC].orEmpty(),
            year = result[Dimension.YEAR].orEmpty(),
            degree = result[Dimension.DEGREE].orEmpty(),
            mode = result[Dimension.MODE].orEmpty(),
        )
    }

    /**
     * Nabór, który obowiązuje dla grupy: wybór użytkownika, a gdy grupa nie ma
     * w nim planu — najnowszy dostępny (lista jest rosnąca).
     */
    fun pickNabor(group: GroupDto, preferred: String): String {
        if (group.nabory.isEmpty()) return preferred
        return if (group.nabory.any { it.toString() == preferred }) {
            preferred
        } else {
            group.nabory.max().toString()
        }
    }

    private fun sortValues(dimension: Dimension, values: List<String?>): List<String?> {
        val sorted = when (dimension) {
            Dimension.NABOR, Dimension.YEAR -> values.filterNotNull().sortedByDescending { it.toIntOrNull() ?: 0 }
            // Kolejność polska, jak w przeglądarce (`localeCompare('pl')`).
            else -> {
                val collator = java.text.Collator.getInstance(java.util.Locale.forLanguageTag("pl"))
                values.filterNotNull().sortedWith { a, b -> collator.compare(a, b) }
            }
        }
        return if (values.contains(null)) listOf<String?>(null) + sorted else sorted
    }
}
