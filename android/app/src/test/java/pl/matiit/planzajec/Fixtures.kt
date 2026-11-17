package pl.matiit.planzajec

import pl.matiit.planzajec.core.PlanJson
import pl.matiit.planzajec.data.model.PlanDto

/** Wspólne wczytywanie próbki odpowiedzi API w testach JVM. */
object Fixtures {

    fun samplePlan(): PlanDto {
        val stream = Fixtures::class.java.getResourceAsStream("/plan-sample.json")
            ?: error("Brak plan-sample.json w test resources")
        val text = stream.use { it.readBytes().decodeToString() }
        return PlanJson.decodeFromString(PlanDto.serializer(), text)
    }
}
