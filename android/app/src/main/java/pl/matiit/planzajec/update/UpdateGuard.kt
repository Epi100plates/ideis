package pl.matiit.planzajec.update

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException

/**
 * Wykonuje sprawdzenie/pobieranie aktualizacji odpornie na błędy.
 *
 * `UpdateManager.check()` łapało tylko `IOException`, więc odpowiedź serwera,
 * której nie da się zdeserializować (`SerializationException`), leciała do
 * `lifecycleScope.launch` w `MainActivity` i kończyła aplikację. Tu każdy
 * wyjątek poza anulowaniem korutyny kończy się komunikatem w stanie, a nie crashem.
 */
internal suspend fun <T> guardedUpdate(block: suspend () -> T): Result<T> = try {
    Result.success(block())
} catch (cancelled: CancellationException) {
    // Anulowanie (wyjście z ekranu, zatrzymanie workera) musi lecieć dalej.
    throw cancelled
} catch (error: Exception) {
    Result.failure(error)
}

/** Komunikat dla użytkownika — bez technicznych szczegółów wyjątku. */
internal fun updateErrorText(error: Throwable?): String = when {
    error == null -> "Nie udało się sprawdzić aktualizacji."
    error is SerializationException -> "Nieprawidłowa odpowiedź serwera aktualizacji."
    error.message.isNullOrBlank() -> "Brak połączenia z serwerem aktualizacji."
    else -> error.message!!
}
