package pl.matiit.planzajec.core

import kotlinx.serialization.json.Json

/**
 * Jeden współdzielony parser JSON. `ignoreUnknownKeys` jest konieczne, bo API
 * dokłada pola (np. nowe statystyki) bez zmiany wersji.
 */
val PlanJson: Json = Json {
    ignoreUnknownKeys = true
    isLenient = true
    explicitNulls = false
    encodeDefaults = true
}
