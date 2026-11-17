package pl.matiit.planzajec.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit
import pl.matiit.planzajec.data.PlanGraph

/**
 * Sprawdzanie nowej wersji w tle: co 12 godzin manifest (kilkaset bajtów),
 * a przy Wi-Fi także pobranie APK, jeśli użytkownik tego chce. Dzięki temu
 * okienko „nowa wersja” pojawia się od razu po wejściu do aplikacji.
 */
class UpdateWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val manager = PlanGraph.updates(applicationContext)
        val state = manager.checkAndDownload()

        // Sieć bywa chwilowo niedostępna — ponawiamy, ale bez nieskończonej pętli.
        val transient = state.error != null && state.release == null
        return if (transient && runAttemptCount < MAX_ATTEMPTS) Result.retry() else Result.success()
    }

    private companion object {
        const val MAX_ATTEMPTS = 2
    }
}

/** Harmonogram sprawdzania wydań: jedna praca cykliczna, bez budzenia procesu. */
object UpdateScheduler {

    private const val UNIQUE_PERIODIC = "app-update-periodic"

    fun ensurePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<UpdateWorker>(12, TimeUnit.HOURS)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 60, TimeUnit.MINUTES)
            .build()

        WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
            UNIQUE_PERIODIC,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }
}
