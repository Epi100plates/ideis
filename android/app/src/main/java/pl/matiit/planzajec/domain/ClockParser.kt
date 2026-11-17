package pl.matiit.planzajec.domain

import java.time.LocalTime
import pl.matiit.planzajec.data.model.ClassDto

/** Godziny z API przychodzą jako "9:00" (bez zera wiodącego), więc bez ISO. */
object ClockParser {

    fun parse(value: String?, fallbackMinutes: Int = -1): LocalTime? {
        val text = value?.trim()
        if (!text.isNullOrEmpty()) {
            val parts = text.split(':')
            if (parts.size == 2) {
                val hour = parts[0].toIntOrNull()
                val minute = parts[1].toIntOrNull()
                if (hour != null && minute != null && hour in 0..23 && minute in 0..59) {
                    return LocalTime.of(hour, minute)
                }
            }
        }
        if (fallbackMinutes in 0 until 24 * 60) {
            return LocalTime.of(fallbackMinutes / 60, fallbackMinutes % 60)
        }
        return null
    }
}
