package pl.matiit.planzajec.data

import pl.matiit.planzajec.data.model.FeedbackItemDto
import pl.matiit.planzajec.data.model.FeedbackPayload
import pl.matiit.planzajec.data.remote.FeedbackRemote

/**
 * Wysyłka propozycji i zgłoszeń błędów. Bez cache'u i bez kolejek: zgłoszenie
 * idzie od razu, a przy braku sieci użytkownik widzi komunikat i może spróbować
 * ponownie (treść zostaje w polu tekstowym).
 */
class FeedbackRepository(private val remote: FeedbackRemote) {

    suspend fun send(payload: FeedbackPayload): FeedbackItemDto =
        remote.send(payload).item ?: throw java.io.IOException("Serwer nie potwierdził zgłoszenia.")

    suspend fun list(limit: Int = 50): List<FeedbackItemDto> = remote.list(limit).items
}
