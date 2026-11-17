package pl.matiit.planzajec.domain

/**
 * Etykiety wymiarów katalogu — jedno miejsce dla pickera, podtytułu planu
 * i „Co nowego”. Te same nazwy co w wersji web (`DEGREE_LABELS`
 * i `MODE_LABELS` w `public/app.js`), bo opis wyboru musi brzmieć identycznie.
 */
object SelectionLabels {

    val DEGREE = mapOf(
        "1st" to "I stopnia",
        "2st" to "II stopnia",
        "jmgr" to "jednolite magisterskie",
        "inż" to "inżynierskie",
        "mgr" to "magisterskie",
        "lic" to "licencjackie",
        "podypl" to "podyplomowe",
        "dr" to "doktoranckie",
    )

    val MODE = mapOf("N" to "niestacjonarne", "S" to "stacjonarne")

    /** „2026” → „2026/2027”. */
    fun nabor(value: String?): String {
        if (value == PlanSelection.NONE) return "bez naboru"
        val start = value?.toIntOrNull() ?: return value.orEmpty()
        return "$start/${start + 1}"
    }

    /**
     * Etykieta jednej wartości wymiaru. `null` oznacza „grupy bez tego
     * wymiaru” — np. 1. rok nie ma specjalności i właśnie tak to pokazujemy.
     */
    fun value(dimension: Dimension, value: String?): String {
        if (value == null) {
            return when (dimension) {
                Dimension.NABOR -> "(bez naboru)"
                Dimension.SPEC -> "(bez specjalności)"
                Dimension.DEGREE -> "(bez typu)"
                Dimension.MODE -> "(bez trybu)"
                Dimension.YEAR -> "(bez roku)"
                Dimension.FIELD -> "(bez kierunku)"
                Dimension.SEM -> "(bez semestru)"
            }
        }
        return when (dimension) {
            Dimension.NABOR -> nabor(value)
            Dimension.YEAR -> "$value. rok"
            Dimension.DEGREE -> DEGREE[value] ?: value
            Dimension.MODE -> MODE[value] ?: value
            Dimension.SEM -> "semestr $value"
            Dimension.FIELD, Dimension.SPEC -> value
        }
    }

    /** Opis wyboru, np. „nabór 2026/2027 · Informatyka · 1. rok · I stopnia · niestacjonarne”. */
    fun describe(selection: PlanSelection): String {
        val parts = mutableListOf<String>()
        if (selection.nabor.isNotEmpty() && selection.nabor != PlanSelection.NONE) {
            parts += "nabór ${nabor(selection.nabor)}"
        }
        if (selection.field.isNotEmpty()) parts += selection.field
        if (selection.spec.isNotEmpty() && selection.spec != PlanSelection.NONE) parts += selection.spec
        if (selection.spec == PlanSelection.NONE) parts += "bez specjalności"
        if (selection.year.isNotEmpty() && selection.year != PlanSelection.NONE) {
            parts += "${selection.year}. rok"
        }
        if (selection.degree.isNotEmpty() && selection.degree != PlanSelection.NONE) {
            parts += DEGREE[selection.degree] ?: selection.degree
        }
        if (selection.mode.isNotEmpty() && selection.mode != PlanSelection.NONE) {
            parts += MODE[selection.mode] ?: selection.mode
        }
        return parts.joinToString(" · ")
    }

    /** Etykiety wymiarów w pickerze (kolejność pól). */
    fun fieldLabel(dimension: Dimension): String = when (dimension) {
        Dimension.NABOR -> "Nabór"
        Dimension.FIELD -> "Kierunek"
        Dimension.SPEC -> "Specjalność"
        Dimension.YEAR -> "Rok studiów"
        Dimension.DEGREE -> "Typ studiów"
        Dimension.MODE -> "Tryb"
        Dimension.SEM -> "Semestr"
    }

    /** Podpowiedź pod polem — tylko tam, gdzie coś trzeba wyjaśnić. */
    fun fieldHint(dimension: Dimension): String = when (dimension) {
        Dimension.NABOR -> "rok, w którym zaczynałeś studia"
        Dimension.SPEC -> "opcjonalna — na 1. roku zwykle jej nie ma"
        else -> ""
    }
}
