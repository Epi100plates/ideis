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
import pl.matiit.planzajec.data.model.AttachmentIndexDto
import pl.matiit.planzajec.data.model.AttachmentListDto

/** Błąd API materiałów z komunikatem serwera (np. „limit plików”). */
class AttachmentException(val code: Int, message: String) : IOException(message)

interface AttachmentsRemote {
    suspend fun list(group: String, classId: String): AttachmentListDto
    suspend fun upload(group: String, classId: String, fileName: String, bytes: ByteArray): AttachmentListDto
    suspend fun addLink(group: String, classId: String, url: String, title: String?): AttachmentListDto
    suspend fun deleteFile(group: String, classId: String, id: String): AttachmentListDto
    suspend fun deleteLink(group: String, classId: String, id: String): AttachmentListDto
    suspend fun index(): AttachmentIndexDto
}

/**
 * Klient materiałów: upload to surowe bajty (bez multipart), więc wystarcza
 * `HttpURLConnection`. Każde wywołanie poza wątkiem głównym, dłuższe timeauty
 * przy wysyłaniu pliku.
 */
class HttpAttachmentsRemote(
    private val baseUrl: String = PlanConfig.API_BASE,
) : AttachmentsRemote {

    override suspend fun list(group: String, classId: String): AttachmentListDto =
        request(AttachmentUrls.list(baseUrl, group, classId), method = "GET")

    override suspend fun upload(
        group: String,
        classId: String,
        fileName: String,
        bytes: ByteArray,
    ): AttachmentListDto = request(
        AttachmentUrls.upload(baseUrl, group, classId, fileName),
        method = "POST",
        body = bytes,
        contentType = "application/octet-stream",
        readTimeoutMs = UPLOAD_TIMEOUT_MS,
    )

    override suspend fun addLink(
        group: String,
        classId: String,
        url: String,
        title: String?,
    ): AttachmentListDto {
        val payload = buildString {
            append("{\"url\":\"").append(escape(url)).append('"')
            if (!title.isNullOrBlank()) {
                append(",\"title\":\"").append(escape(title)).append('"')
            }
            append('}')
        }
        return request(
            AttachmentUrls.links(baseUrl, group, classId),
            method = "POST",
            body = payload.encodeToByteArray(),
            contentType = "application/json",
        )
    }

    override suspend fun deleteFile(group: String, classId: String, id: String): AttachmentListDto =
        request(AttachmentUrls.deleteFile(baseUrl, group, classId, id), method = "DELETE")

    override suspend fun deleteLink(group: String, classId: String, id: String): AttachmentListDto =
        request(AttachmentUrls.deleteLink(baseUrl, group, classId, id), method = "DELETE")

    override suspend fun index(): AttachmentIndexDto {
        val text = text(AttachmentUrls.index(baseUrl), method = "GET")
        return if (text.isBlank()) {
            AttachmentIndexDto(ok = true)
        } else {
            PlanJson.decodeFromString<AttachmentIndexDto>(text)
        }
    }

    private suspend fun request(
        url: String,
        method: String,
        body: ByteArray? = null,
        contentType: String? = null,
        readTimeoutMs: Int = READ_TIMEOUT_MS,
    ): AttachmentListDto {
        val text = text(url, method, body, contentType, readTimeoutMs)
        return if (text.isBlank()) {
            AttachmentListDto(ok = true)
        } else {
            PlanJson.decodeFromString<AttachmentListDto>(text)
        }
    }

    private suspend fun text(
        url: String,
        method: String,
        body: ByteArray? = null,
        contentType: String? = null,
        readTimeoutMs: Int = READ_TIMEOUT_MS,
    ): String = withContext(Dispatchers.IO) {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            this.readTimeout = readTimeoutMs
            requestMethod = method
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Accept-Encoding", "gzip")
            setRequestProperty("User-Agent", "PlanZajec-Android/1.0")
            if (method != "GET") setRequestProperty("x-plan-upload", "1")
            if (contentType != null) {
                setRequestProperty("Content-Type", contentType)
                doOutput = true
            }
        }
        try {
            if (body != null) {
                connection.outputStream.use { out ->
                    out.write(body)
                    out.flush()
                }
            } else if (method == "POST") {
                connection.setFixedLengthStreamingMode(0)
                connection.outputStream.use { it.flush() }
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
                throw AttachmentException(code, message)
            }
            text
        } catch (e: SocketTimeoutException) {
            throw IOException("Przekroczono czas połączenia", e)
        } finally {
            connection.disconnect()
        }
    }

    private fun parseError(body: String): String? =
        runCatching { PlanJson.decodeFromString<AttachmentListDto>(body).error }
            .recoverCatching { PlanJson.decodeFromString<AttachmentIndexDto>(body).error }
            .getOrNull()

    private fun escape(value: String): String = buildString {
        value.forEach { ch ->
            when (ch) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> append(ch)
            }
        }
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 20_000
        const val UPLOAD_TIMEOUT_MS = 120_000
    }
}
