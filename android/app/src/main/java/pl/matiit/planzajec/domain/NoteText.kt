package pl.matiit.planzajec.domain

/**
 * Notatka na kafelku zajęć („Kolos”, „Egzamin”) — reguły wspólne dla pola
 * w szczegółach i plakietki na kafelku.
 *
 * Ta sama reguła stoi na serwerze (`server/notes.js`): jedna linia, maksymalnie
 * [MAX_LENGTH] znaków, bez znaków sterujących. Limit liczymy w **znakach**, nie
 * w jednostkach UTF-16, żeby emoji nie zostało ucięte w połowie.
 */
object NoteText {

    /** Tyle znaków mieści się na kafelku — tyle samo pilnuje serwer i web. */
    const val MAX_LENGTH = 15

    /** Notatka w postaci do wysłania: jedna linia, przycięta do limitu. */
    fun sanitize(raw: String): String {
        val flat = buildString(raw.length) {
            raw.forEach { ch -> append(if (ch.isISOControl()) ' ' else ch) }
        }
        val collapsed = flat.replace(WHITESPACE, " ").trim()
        return clamp(collapsed)
    }

    /** Czy tekst jest już poprawną notatką (nie trzeba go zmieniać)? */
    fun isClean(raw: String): Boolean = sanitize(raw) == raw

    /** Przycina do [MAX_LENGTH] znaków, nie ruszając par zastępczych. */
    fun clamp(text: String): String {
        if (text.isEmpty()) return ""
        val total = text.codePointCount(0, text.length)
        if (total <= MAX_LENGTH) return text
        return text.substring(0, text.offsetByCodePoints(0, MAX_LENGTH)).trim()
    }

    private val WHITESPACE = Regex("\\s+")
}
