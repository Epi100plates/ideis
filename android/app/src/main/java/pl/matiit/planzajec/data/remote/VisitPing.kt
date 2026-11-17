package pl.matiit.planzajec.data.remote

import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import pl.matiit.planzajec.core.PlanConfig

/**
 * Licznik wejść aplikacji Android — `POST /api/visit` z `{"source":"apk"}`.
 *
 * Jedno uruchomienie = jedno wejście. Flaga `sent` jest w pamięci procesu, więc
 * obrót telefonu albo powrót z tła nie nabija licznika, a zimny start — tak.
 * Wysyłka idzie na osobnym wątku z krótkim timeoutem: brak sieci nie może
 * opóźnić ani zepsuć startu planu. Licznik jest tylko statystyką.
 */
object VisitPing {

    private val sent = AtomicBoolean(false)

    fun pingOnce(baseUrl: String = PlanConfig.API_BASE) {
        if (!sent.compareAndSet(false, true)) return
        Thread({
            val connection = runCatching {
                (URL(baseUrl.trimEnd('/') + "/api/visit").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = TIMEOUT_MS
                    readTimeout = TIMEOUT_MS
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("User-Agent", "PlanZajec-Android/1.0")
                }
            }.getOrNull() ?: return@Thread
            try {
                connection.outputStream.use { it.write("""{"source":"apk"}""".toByteArray()) }
                connection.responseCode // odczyt kodu zamyka połączenie
            } catch (_: Exception) {
                // Licznik jest opcjonalny — brak sieci nie jest błędem aplikacji.
            } finally {
                connection.disconnect()
            }
        }, "visit-ping").apply { isDaemon = true }.start()
    }

    private const val TIMEOUT_MS = 5_000
}
