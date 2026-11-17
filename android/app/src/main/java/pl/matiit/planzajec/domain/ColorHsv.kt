package pl.matiit.planzajec.domain

import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Barwa w zapisie HSV — potrzebna wyłącznie do wybierania kolorów motywu
 * „Własny” (trzy suwaki: barwa, nasycenie, jasność).
 *
 * Trzymamy to poza warstwą Compose, bo konwersja jest czystą matematyką:
 * `Hsv` ↔ `#RRGGBB`. Dzięki temu da się ją przetestować na JVM, a suwaki
 * w ustawieniach są tylko cienką warstwą nad tymi funkcjami.
 *
 * `hue` w stopniach 0–360, `saturation` i `value` w zakresie 0–1.
 */
data class Hsv(val hue: Float, val saturation: Float, val value: Float) {

    fun clamped(): Hsv = Hsv(
        hue = ((hue % 360f) + 360f) % 360f,
        saturation = saturation.coerceIn(0f, 1f),
        value = value.coerceIn(0f, 1f),
    )
}

object ColorHsv {

    /** `#RRGGBB` (albo `RRGGBB`) → HSV; `null`, gdy zapis jest niepoprawny. */
    fun fromHex(hex: String?): Hsv? {
        val raw = hex?.trim()?.removePrefix("#")?.uppercase() ?: return null
        if (raw.length != 6 || !raw.all { it in '0'..'9' || it in 'A'..'F' }) return null
        val value = raw.toInt(16)
        return fromRgb((value shr 16) and 0xFF, (value shr 8) and 0xFF, value and 0xFF)
    }

    fun fromRgb(red: Int, green: Int, blue: Int): Hsv {
        val r = red / 255f
        val g = green / 255f
        val b = blue / 255f
        val maxC = max(r, max(g, b))
        val minC = min(r, min(g, b))
        val delta = maxC - minC
        val hue = when {
            delta < 0.0001f -> 0f
            maxC == r -> 60f * (((g - b) / delta) % 6f)
            maxC == g -> 60f * (((b - r) / delta) + 2f)
            else -> 60f * (((r - g) / delta) + 4f)
        }
        return Hsv(
            hue = ((hue % 360f) + 360f) % 360f,
            saturation = if (maxC <= 0f) 0f else delta / maxC,
            value = maxC,
        ).clamped()
    }

    /** HSV → `#RRGGBB` (wielkie litery, zaokrąglenie kanałów do 0–255). */
    fun toHex(hsv: Hsv): String {
        val (r, g, b) = toRgb(hsv)
        // Locale.ROOT: w locale z innymi cyframi `%02X` mogłoby dać inny zapis.
        return String.format(Locale.ROOT, "#%02X%02X%02X", r, g, b)
    }

    fun toRgb(hsv: Hsv): Triple<Int, Int, Int> {
        val c = hsv.clamped()
        val chroma = c.value * c.saturation
        val sector = c.hue / 60f
        val x = chroma * (1f - abs((sector % 2f) - 1f))
        val (r1, g1, b1) = when (sector.toInt().coerceIn(0, 5)) {
            0 -> Triple(chroma, x, 0f)
            1 -> Triple(x, chroma, 0f)
            2 -> Triple(0f, chroma, x)
            3 -> Triple(0f, x, chroma)
            4 -> Triple(x, 0f, chroma)
            else -> Triple(chroma, 0f, x)
        }
        val m = c.value - chroma
        return Triple(
            ((r1 + m) * 255f).roundToInt().coerceIn(0, 255),
            ((g1 + m) * 255f).roundToInt().coerceIn(0, 255),
            ((b1 + m) * 255f).roundToInt().coerceIn(0, 255),
        )
    }
}
