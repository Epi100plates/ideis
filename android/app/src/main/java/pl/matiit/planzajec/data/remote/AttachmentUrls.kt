package pl.matiit.planzajec.data.remote

import java.net.URLEncoder

/**
 * Buduje adresy API materiałów. Wydzielone z klienta HTTP, żeby dało się je
 * przetestować bez sieci — `class` z planu zawiera znaki `|`, `:`, spacje.
 */
object AttachmentUrls {

    /** Indeks „które zajęcia mają materiały” — bez grupy, bo id zajęć jest wspólny. */
    fun index(base: String): String = "${base.trimEnd('/')}/api/attachments/index"

    fun list(base: String, group: String, classId: String): String =
        "${base.trimEnd('/')}/api/attachments?group=${enc(group)}&class=${enc(classId)}"

    fun upload(base: String, group: String, classId: String, fileName: String): String =
        "${list(base, group, classId)}&name=${enc(fileName)}"

    fun links(base: String, group: String, classId: String): String =
        "${base.trimEnd('/')}/api/attachments/links?group=${enc(group)}&class=${enc(classId)}"

    fun deleteFile(base: String, group: String, classId: String, id: String): String =
        "${base.trimEnd('/')}/api/attachments/${enc(id)}?group=${enc(group)}&class=${enc(classId)}"

    fun deleteLink(base: String, group: String, classId: String, id: String): String =
        "${base.trimEnd('/')}/api/attachments/links/${enc(id)}?group=${enc(group)}&class=${enc(classId)}"

    fun download(base: String, group: String, classId: String, id: String): String =
        "${base.trimEnd('/')}/api/attachments/${enc(id)}?group=${enc(group)}&class=${enc(classId)}"

    private fun enc(value: String): String = URLEncoder.encode(value, "UTF-8")
}
