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
import pl.matiit.planzajec.data.model.NoteMapDto
import pl.matiit.planzajec.data.model.NoteSaveDto

/** Błąd API notatek z komunikatem serwera (np. „maksymalnie 15 znaków”). */
class NoteException(val code: Int, message: String) : IOException(message)

/**
 * Notatki na kafelkach: jedno `GET` na cały plan i `POST` na każdy zapis.
 * Bez biblioteki HTTP — `HttpURLConnection` wystarcza, a APK nie rośnie.
 */
interface NotesRemote {
    suspend fun all(): NoteMapDto

    /**
     * Zapis notatki. `groups` i `academicYear` opisują plan, w którym zajęcia
     * muszą istnieć — serwer odrzuca notatki do zajęć spoza planu.
     */
    suspend fun save(
        classId: String,
        text: String,
        groups: List<String>,
        academicYear: Int?,
    ): NoteSaveDto
}

class HttpNotesRemote(
    private val baseUrl: String = PlanConfig.API_BASE,
) : NotesRemote {

    private val endpoint: String = baseUrl.trimEnd('/')

    override suspend fun all(): NoteMapDto {
        val text = text("$endpoint/api/notes", method = "GET")
        return if (text.isBlank()) NoteMapDto(ok = true) else PlanJson.decodeFromString<NoteMapDto>(text)
    }

    override suspend fun save(
        classId: String,
        text: String,
        groups: List<String>,
        academicYear: Int?,
    ): NoteSaveDto {
        val payload = buildString {
            append("{\"classId\":\"").append(escape(classId)).append('"')
            append(",\"text\":\"").append(escape(text)).append('"')
            append('}')
        }
        val body = text(
            NoteUrls.save(endpoint, groups, academicYear),
            method = "POST",
            body = payload.encodeToByteArray(),
        )
        return PlanJson.decodeFromString<NoteSaveDto>(body)
    }

    private suspend fun text(
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
                setRequestProperty("Content-Type", "application/json")
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
                throw NoteException(code, parseError(text) ?: "Błąd serwera ($code)")
            }
            text
        } catch (e: SocketTimeoutException) {
            throw IOException("Przekroczono czas połączenia", e)
        } finally {
            connection.disconnect()
        }
    }

    private fun parseError(body: String): String? =
        runCatching { PlanJson.decodeFromString<NoteSaveDto>(body).error }.getOrNull()
            ?: runCatching { PlanJson.decodeFromString<NoteMapDto>(body).error }.getOrNull()

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
    }
}
