package pl.matiit.planzajec.data.remote

import java.net.URLEncoder

/**
 * Adres zapisu notatki (`POST /api/notes`).
 *
 * Serwer przyjmuje notatkę tylko dla zajęć, które **naprawdę są w planie**,
 * więc razem z identyfikatorem musi dostać grupy i rok akademicki planu —
 * bez nich nie ma czego sprawdzić (i odpowiada 400/404). Tu budujemy ten
 * adres, żeby dało się go przetestować bez sieci: numery grup są cyframi,
 * ale `groups` to lista rozdzielona przecinkiem, a `ay` może nie istnieć.
 */
object NoteUrls {

    fun save(base: String, groups: List<String>, academicYear: Int?): String {
        val clean = groups.map { it.trim() }.filter { it.isNotEmpty() }
        val params = mutableListOf<String>()
        when {
            clean.size == 1 -> params += "group=${enc(clean.first())}"
            clean.size > 1 -> params += "groups=${clean.joinToString(",") { enc(it) }}"
            else -> Unit
        }
        if (academicYear != null) params += "ay=$academicYear"
        val query = if (params.isEmpty()) "" else "?${params.joinToString("&")}"
        return "${base.trimEnd('/')}/api/notes$query"
    }

    private fun enc(value: String): String = URLEncoder.encode(value, "UTF-8")
}
