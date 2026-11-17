package pl.matiit.planzajec.domain

import java.text.Collator
import java.util.Locale
import pl.matiit.planzajec.data.model.CohortDto
import pl.matiit.planzajec.data.model.SelectionItemDto

/**
 * Kroki wyboru planu — **ta sama kolejność i te same podpisy co w wersji web**
 * (`public/app.js`, `WIZARD_LABELS`). Rocznik jest pierwszy, bo oferta
 * kierunków jest rocznikowa: to on zawęża listę kierunków.
 */
enum class WizardStep(val label: String) {
    NABOR("Rocznik"),
    KIERUNEK("Kierunek"),
    SPECJALNOSC("Specjalność"),
    TRYB("Tryb"),
    PLAN("Plan"),
}

/**
 * Logika ekranu wyboru przeniesiona z `public/wizard.js` — czysta, bez Androida,
 * więc testy JVM sprawdzają ją tak samo, jak self-test serwera sprawdza wersję JS.
 */
object PickerSteps {

    /** Od ilu kierunków pokazujemy pole „Szukaj kierunku” (web: `WIZ_SEARCH_MIN`). */
    const val SEARCH_MIN = 8

    /**
     * Kroki, które w tym wyborze już mają sens — kolejne pojawiają się same,
     * gdy poprzedni jest wypełniony (`PW.stepsFor`).
     */
    fun visible(selection: PlanSelection): List<WizardStep> = buildList {
        add(WizardStep.NABOR)
        if (selection.nabor.isNotBlank()) add(WizardStep.KIERUNEK)
        if (selection.field.isNotBlank()) {
            add(WizardStep.SPECJALNOSC)
            add(WizardStep.TRYB)
        }
        if (selection.mode.isNotBlank()) add(WizardStep.PLAN)
    }

    /**
     * Pierwszy krok, którego brakuje — domyślnie otwarty, dopóki użytkownik
     * nie kliknie innego wiersza. `specsKnown` = lista specjalności już przyszła
     * (dopóki nie wiemy, czy krok ma sens, lepiej go pokazać niż przeskoczyć).
     */
    fun firstIncomplete(
        selection: PlanSelection,
        specDecided: Boolean,
        specsKnown: Boolean,
        specsAvailable: Boolean,
    ): WizardStep {
        if (selection.nabor.isBlank()) return WizardStep.NABOR
        if (selection.field.isBlank()) return WizardStep.KIERUNEK
        if ((!specsKnown || specsAvailable) && !specDecided) return WizardStep.SPECJALNOSC
        if (selection.mode.isBlank()) return WizardStep.TRYB
        return WizardStep.PLAN
    }

    /**
     * Roczniki całego wydziału — suma list `nabory` po kierunkach, od najnowszego.
     * `groups` to liczba grup w roczniku (tyle pokazuje wiersz „Rocznik”).
     */
    fun cohortIndex(items: List<SelectionItemDto>): List<CohortDto> {
        val found = LinkedHashMap<String, Int>()
        for (item in items) {
            for (entry in item.nabory) {
                if (entry.value.isBlank()) continue
                found[entry.value] = (found[entry.value] ?: 0) + entry.groups
            }
        }
        return found.entries
            .map { CohortDto(value = it.key, groups = it.value) }
            .sortedByDescending { it.value.toIntOrNull() ?: 0 }
    }

    /** Kierunki mające grupy w danym roczniku, alfabetycznie (`kierunkiInCohort`). */
    fun kierunkiInCohort(items: List<SelectionItemDto>, nabor: String): List<SelectionItemDto> {
        if (nabor.isBlank()) return emptyList()
        val collator = Collator.getInstance(Locale.forLanguageTag("pl"))
        return items
            .mapNotNull { item ->
                val entry = item.nabory.firstOrNull { it.value == nabor } ?: return@mapNotNull null
                item.copy(groups = entry.groups)
            }
            .sortedWith { a, b -> collator.compare(a.label, b.label) }
    }

    /** Litery bez ogonków i wielkości — „Ćw” i „cw” to dla szukania to samo. */
    fun foldText(text: String): String {
        val lowered = text.lowercase(Locale.forLanguageTag("pl"))
        val out = StringBuilder(lowered.length)
        for (ch in lowered) {
            out.append(
                when (ch) {
                    'ą' -> 'a'
                    'ć' -> 'c'
                    'ę' -> 'e'
                    'ł' -> 'l'
                    'ń' -> 'n'
                    'ó' -> 'o'
                    'ś' -> 's'
                    'ź', 'ż' -> 'z'
                    else -> ch
                },
            )
        }
        return out.toString()
    }

    /**
     * Ocena dopasowania wpisanych liter (`searchScore` z webu): 3 = tekst
     * zaczyna się od szukanego, 2 = trafienie po znaku innym niż litera/cyfra,
     * 1 = trafienie w środku wyrazu, 0 = brak. Puste zapytanie = 1 dla wszystkiego.
     */
    fun score(text: String, query: String): Int {
        val needle = foldText(query).trim()
        if (needle.isEmpty()) return 1
        val hay = foldText(text)
        if (hay.startsWith(needle)) return 3
        val at = hay.indexOf(needle)
        if (at < 0) return 0
        val before = if (at > 0) hay[at - 1] else ' '
        return if (!before.isLetterOrDigit()) 2 else 1
    }

    /** Kierunki pasujące do wpisanych liter — najlepsze dopasowania najpierw. */
    fun rankKierunki(items: List<SelectionItemDto>, query: String): List<SelectionItemDto> {
        val scored = items.map { item -> item to score("${item.label} ${item.field.orEmpty()}", query) }
            .filter { it.second > 0 }
        val collator = Collator.getInstance(Locale.forLanguageTag("pl"))
        return scored
            .sortedWith { a, b ->
                val byScore = b.second - a.second
                if (byScore != 0) byScore else collator.compare(a.first.label, b.first.label)
            }
            .map { it.first }
    }
}
