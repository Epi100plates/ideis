package pl.matiit.planzajec.data.remote

import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.util.zip.GZIPInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import pl.matiit.planzajec.core.PlanConfig
import pl.matiit.planzajec.core.PlanJson
import pl.matiit.planzajec.data.model.FeedbackCreatedDto
import pl.matiit.planzajec.data.model.FeedbackItemDto
import pl.matiit.planzajec.data.model.FeedbackListDto
import pl.matiit.planzajec.data.model.FeedbackPayload

/** Adresy API propozycji i błędów — wydzielone, żeby dały się testować bez sieci. */
object FeedbackUrls {
    fun feedback(base: String): String = "${base.trimEnd('/')}/api/feedback"

    fun item(base: String, id: String): String =
        "${base.trimEnd('/')}/api/feedback/${java.net.URLEncoder.encode(id, "UTF-8")}"
}

interface FeedbackRemote {
    suspend fun send(payload: FeedbackPayload): FeedbackCreatedDto
    suspend fun list(limit: Int = 50): FeedbackListDto
}

/**
 * Klient zgłoszeń. Ten sam `HttpURLConnection` co przy materiałach — bez
 * dokładania biblioteki HTTP do aplikacji.
 */
class HttpFeedbackRemote(
    private val baseUrl: String = PlanConfig.API_BASE,
) : FeedbackRemote {

    override suspend fun send(payload: FeedbackPayload): FeedbackCreatedDto {
        val body = PlanJson.encodeToString(payload).encodeToByteArray()
        val text = request(FeedbackUrls.feedback(baseUrl), method = "POST", body = body)
        return PlanJson.decodeFromString<FeedbackCreatedDto>(text)
    }

    override suspend fun list(limit: Int): FeedbackListDto {
        val text = request("${FeedbackUrls.feedback(baseUrl)}?limit=$limit", method = "GET")
        return PlanJson.decodeFromString<FeedbackListDto>(text)
    }

    private suspend fun request(
        url: String,
        method: String,
        body: ByteArray? = null,
    ): String = withContext(Dispatchers.IO) {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            requestMethod = method
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Accept-Encoding", "gzip")
            setRequestProperty("User-Agent", "PlanZajec-Android/1.0")
            if (body != null) {
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                doOutput = true
            }
        }
        try {
            if (body != null) {
                connection.outputStream.use { out ->
                    out.write(body)
                    out.flush()
                }
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.let { raw ->
                val reader = if (connection.contentEncoding?.contains("gzip", true) == true) {
                    GZIPInputStream(raw)
                } else {
                    raw
                }
                reader.use { it.readBytes().decodeToString() }
            }.orEmpty()

            if (code !in 200..299) {
                val message = parseError(text) ?: "Błąd serwera ($code)"
                throw FeedbackException(code, message)
            }
            text
        } catch (e: SocketTimeoutException) {
            throw IOException("Przekroczono czas połączenia", e)
        } finally {
            connection.disconnect()
        }
    }

    private fun parseError(body: String): String? = runCatching {
        PlanJson.decodeFromString<FeedbackCreatedDto>(body).error
    }.getOrNull()

    private companion object {
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 20_000
    }
}

/** Błąd API zgłoszeń z komunikatem serwera (np. limit na IP). */
class FeedbackException(val code: Int, message: String) : IOException(message)
