package pl.matiit.planzajec.widget

/**
 * Jedna pozycja przewijanej listy widżetu: nagłówek, etykieta dnia albo zajęcia.
 *
 * Widżet nie obcina już planu do wysokości kafla — **wszystkie** zajęcia trafiają
 * na listę (`LazyColumn`, które Glance tłumaczy na `ListView`), a użytkownik
 * przewija ją w pionie. Rozmiar widżetu decyduje więc tylko o tym, ile linii
 * widać bez przewijania, a nie o tym, co w ogóle da się zobaczyć.
 *
 * Czysty Kotlin — pozycje buduje testowana funkcja, a warstwa Glance tylko je
 * rysuje ([WidgetScrollList]).
 */
internal sealed interface WidgetListItem {

    /**
     * Id pozycji. Glance wymaga wartości większej niż −2^62
     * (`LazyListScope.ReservedItemIdRangeEnd`), dlatego id są zawsze nieujemne.
     * Liczymy je z treści, żeby po odświeżeniu planu lista trzymała pozycję
     * przewinięcia, a nie wracała na początek (od Androida 12).
     */
    val id: Long

    /** Etykieta dnia w widżecie tygodnia. `first` = pierwszy dzień bez odstępu nad sobą. */
    data class Day(
        val label: String,
        val first: Boolean,
        override val id: Long,
    ) : WidgetListItem

    /** Jedne zajęcia. `last` = ostatnie w danym dniu (warianty rysują wtedy linię domykającą). */
    data class ClassRow(
        val row: WidgetRow,
        val last: Boolean,
        override val id: Long,
    ) : WidgetListItem
}

/** Buduje zawartość przewijanej listy widżetu — bez żadnego obcinania do wysokości. */
internal object WidgetScroll {

    /**
     * Id pozycji nagłówka. Zarezerwowane: [IdAllocator] zaczyna od tego
     * identyfikatora, więc treść nigdy go nie powtórzy (w obrębie jednej listy
     * id muszą być unikalne, inaczej `ListView` gubi pozycję przewinięcia).
     */
    const val HEADER_ITEM_ID: Long = 0L

    /** Wszystkie zajęcia tygodnia: etykieta dnia + każda linia jako osobna pozycja. */
    fun weekItems(days: List<WidgetDay>): List<WidgetListItem> {
        val ids = IdAllocator()
        val items = mutableListOf<WidgetListItem>()
        var first = true
        days.forEach { day ->
            // Puste dni (zjazdy wypadają w weekendy) nie mają czego pokazać.
            if (day.rows.isEmpty()) return@forEach
            items += WidgetListItem.Day(
                label = day.label,
                first = first,
                id = ids.next("dzien|${day.label}"),
            )
            first = false
            day.rows.forEachIndexed { index, row ->
                items += WidgetListItem.ClassRow(
                    row = row,
                    last = index == day.rows.lastIndex,
                    id = ids.next("zajecia|${day.label}|${row.fingerprint()}"),
                )
            }
        }
        return items
    }

    /** Wszystkie zajęcia jednego dnia — bez etykiety, bo ta siedzi w nagłówku widżetu. */
    fun dayItems(rows: List<WidgetRow>): List<WidgetListItem> {
        val ids = IdAllocator()
        return rows.mapIndexed { index, row ->
            WidgetListItem.ClassRow(
                row = row,
                last = index == rows.lastIndex,
                id = ids.next("zajecia|${row.fingerprint()}"),
            )
        }
    }

    /**
     * Nadaje unikalne id: hasz treści, a przy kolizji (ta sama treść dwa razy)
     * dokłada licznik. Deterministyczne — te same dane dają te same id.
     */
    private class IdAllocator {

        private val used = mutableSetOf(HEADER_ITEM_ID)

        fun next(key: String): Long {
            var salt = 0
            while (true) {
                val candidate = hash(if (salt == 0) key else "$key#$salt")
                if (used.add(candidate)) return candidate
                salt += 1
            }
        }
    }

    /** FNV-1a 64-bit, przycięte do liczb nieujemnych. */
    private fun hash(text: String): Long {
        var hash = FNV_OFFSET_BASIS
        text.forEach { char ->
            hash = hash xor char.code.toLong()
            hash *= FNV_PRIME
        }
        return hash and Long.MAX_VALUE
    }

    private const val FNV_OFFSET_BASIS = -3750763034362895579L
    private const val FNV_PRIME = 1099511628211L
}
