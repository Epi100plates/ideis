package pl.matiit.planzajec.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import pl.matiit.planzajec.core.PlanConfig
import pl.matiit.planzajec.data.PlanGraph
import pl.matiit.planzajec.data.RefreshOutcome
import pl.matiit.planzajec.widget.WidgetUpdater

/**
 * Odświeżanie w tle: najpierw tani `GET /api/version`, więc worker zwykle nie
 * pobiera całego planu. Bez budzenia procesu — WorkManager sam dobiera moment
 * (Doze, batched jobs).
 */
class RefreshWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val repository = PlanGraph.repository(applicationContext)
        val target = repository.currentTarget()

        val outcome = withContext(Dispatchers.IO) {
            repository.groups(force = false)
            repository.refresh(target, force = runAttemptCount > 0)
        }

        return when (outcome) {
            is RefreshOutcome.Failed ->
                if (runAttemptCount < MAX_ATTEMPTS) Result.retry() else Result.failure()

            else -> {
                withContext(Dispatchers.IO) {
                    runCatching { WidgetUpdater.updateIfChanged(applicationContext) }
                }
                Result.success()
            }
        }
    }

    private companion object {
        const val MAX_ATTEMPTS = 3
    }
}

/** Harmonogram odświeżania: jedna cykliczna praca + jednorazowe pobudzenie. */
object RefreshScheduler {

    private const val UNIQUE_PERIODIC = "plan-refresh-periodic"
    private const val UNIQUE_NOW = "plan-refresh-now"

    private val networkConstraints: Constraints
        get() = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

    fun ensurePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<RefreshWorker>(
            PlanConfig.BACKGROUND_INTERVAL_MINUTES,
            TimeUnit.MINUTES,
        )
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES)
            .build()

        WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
            UNIQUE_PERIODIC,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    fun refreshNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<RefreshWorker>()
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
            .build()

        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
            UNIQUE_NOW,
            ExistingWorkPolicy.KEEP,
            request,
        )
    }
}
