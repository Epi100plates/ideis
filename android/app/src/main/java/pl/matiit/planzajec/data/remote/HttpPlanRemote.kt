package pl.matiit.planzajec.data.remote

import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.util.zip.GZIPInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import pl.matiit.planzajec.core.PlanConfig
import pl.matiit.planzajec.core.PlanJson
import pl.matiit.planzajec.data.PlanTarget
import pl.matiit.planzajec.data.model.GroupsDto
import pl.matiit.planzajec.data.model.KierunkiDto
import pl.matiit.planzajec.data.model.PlanDto
import pl.matiit.planzajec.data.model.SpecjalnosciDto
import pl.matiit.planzajec.data.model.TrybyDto
import pl.matiit.planzajec.data.model.VersionDto

/** Błąd HTTP z kodem odpowiedzi — pozwala odróżnić 404 grupy od braku sieci. */
class PlanHttpException(val code: Int, message: String) : IOException(message)

/**
 * Klient API oparty na [HttpURLConnection]: zero dodatkowych zależności, gzip,
 * krótkie timeauty. Każde wywołanie działa poza wątkiem głównym.
 */
class HttpPlanRemote(
    private val baseUrl: String = PlanConfig.API_BASE,
) : PlanRemote {

    override suspend fun plan(target: PlanTarget): PlanDto = getJson(planPath("/api/plan", target))

    override suspend fun version(target: PlanTarget): VersionDto =
        getJson(planPath("/api/version", target))

    override suspend fun groups(): GroupsDto =
        getJson("/api/groups")

    override suspend fun kierunki(): KierunkiDto =
        getJson("/api/ideis/kierunki")

    override suspend fun specjalnosci(kierunekId: String, nabor: String): SpecjalnosciDto =
        getJson(
            "/api/ideis/specjalnosci?kierunek=${encode(kierunekId)}"
                + (if (nabor.isNotBlank()) "&nabor=${encode(nabor)}" else ""),
        )

    override suspend fun tryby(kierunekId: String, nabor: String, spec: String): TrybyDto =
        getJson(
            "/api/ideis/tryby?kierunek=${encode(kierunekId)}"
                + (if (nabor.isNotBlank()) "&nabor=${encode(nabor)}" else "")
                + (if (spec.isNotBlank()) "&spec=${encode(spec)}" else ""),
        )

    /**
     * Wspólne doklejanie grup i `ay` — ten sam kontrakt co `apiUrl()` w wersji
     * web. Zawsze wysyłamy `?groups=`, także dla jednej grupy: serwer filtruje
     * wtedy zajęcia po numerach grup z kolumny „Grupy”. Przy `?group=` strona
     * grupy wykładowej zwraca też zajęcia innych grup tego samego toku.
     */
    private fun planPath(path: String, target: PlanTarget): String {
        val groups = target.orderedGroups
        val params = mutableListOf(
            "groups=${groups.joinToString(",") { encode(it) }}",
        )
        target.academicYear?.let { params += "ay=$it" }
        return "$path?${params.joinToString("&")}"
    }

    private suspend inline fun <reified T> getJson(path: String): T = withContext(Dispatchers.IO) {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            requestMethod = "GET"
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Accept-Encoding", "gzip")
            setRequestProperty("User-Agent", "PlanZajec-Android/1.0")
        }
        try {
            val code = connection.responseCode
            if (code !in 200..299) {
                throw PlanHttpException(code, "HTTP $code dla $path")
            }
            val body = connection.inputStream.let { stream ->
                val reader = if (connection.contentEncoding?.contains("gzip", ignoreCase = true) == true) {
                    GZIPInputStream(stream)
                } else {
                    stream
                }
                reader.use { it.readBytes().decodeToString() }
            }
            PlanJson.decodeFromString<T>(body)
        } catch (e: SocketTimeoutException) {
            throw IOException("Przekroczono czas połączenia", e)
        } finally {
            connection.disconnect()
        }
    }

    private fun encode(value: String): String =
        java.net.URLEncoder.encode(value, "UTF-8")

    private companion object {
        const val CONNECT_TIMEOUT_MS = 10_000
        const val READ_TIMEOUT_MS = 15_000
    }
}
