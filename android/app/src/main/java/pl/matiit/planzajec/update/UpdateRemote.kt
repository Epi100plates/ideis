package pl.matiit.planzajec.update

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import pl.matiit.planzajec.BuildConfig
import pl.matiit.planzajec.core.PlanConfig
import pl.matiit.planzajec.core.PlanJson
import pl.matiit.planzajec.data.remote.PlanHttpException

/** Źródło informacji o wydaniach; interfejs pozwala podmienić sieć w testach. */
interface UpdateRemote {
    /** Manifest najnowszego wydania albo null, gdy serwer nic nie opublikował (404). */
    suspend fun latest(currentVersionCode: Int): UpdateManifestDto?
}

/**
 * Klient `GET /api/app/latest` na [HttpURLConnection] — ta sama filozofia co
 * przy planie: zero bibliotek HTTP, krótkie timeauty, praca poza wątkiem UI.
 */
class HttpUpdateRemote(
    private val baseUrl: String = PlanConfig.API_BASE,
) : UpdateRemote {

    override suspend fun latest(currentVersionCode: Int): UpdateManifestDto? =
        withContext(Dispatchers.IO) {
            val connection = (
                URL(baseUrl.trimEnd('/') + "/api/app/latest?versionCode=$currentVersionCode")
                    .openConnection() as HttpURLConnection
                ).apply {
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                requestMethod = "GET"
                setRequestProperty("Accept", "application/json")
                setRequestProperty("User-Agent", "PlanZajec-Android/${BuildConfig.VERSION_NAME}")
            }
            try {
                when (val code = connection.responseCode) {
                    // Starsze serwery odpowiadają 404 i to nadal znaczy „nic nie
                    // opublikowano”. Nowsze oddają 200 z pustym manifestem
                    // (`versionCode = 0`), żeby przeglądarka nie logowała 404
                    // przy każdym starcie aplikacji webowej.
                    HttpURLConnection.HTTP_NOT_FOUND -> null

                    in 200..299 -> connection.inputStream.use { stream ->
                        PlanJson.decodeFromString<UpdateManifestDto>(stream.readBytes().decodeToString())
                    }.takeIf { it.versionCode >= 1 }

                    else -> throw PlanHttpException(code, "HTTP $code dla /api/app/latest")
                }
            } finally {
                connection.disconnect()
            }
        }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 8_000
        const val READ_TIMEOUT_MS = 12_000
    }
}
