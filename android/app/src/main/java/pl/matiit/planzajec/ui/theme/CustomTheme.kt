package pl.matiit.planzajec.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Motyw „Własny”: dwa kolory wybrane przez użytkownika — **akcent** i **tło**.
 *
 * Reszta palety jest z nich wyliczana, a nie wpisywana na sztywno: tekst, panele,
 * obramowania, gradient i plamy tła. Dzięki temu każda para kolorów daje spójny
 * motyw — także wtedy, gdy ktoś wybierze jasny akcent na jasnym tle (wtedy akcent
 * jest przyciemniany do czytelnego kontrastu).
 *
 * Reguły są **identyczne w wersji web** (`public/styles.js`, `customPalette`),
 * bo wybór ma wyglądać tak samo na obu platformach. Zmiana stałej tutaj wymaga
 * tej samej zmiany w JS — pilnuje tego `scripts/self-test.js`.
 */
data class CustomColors(
    /** Kolor akcentu, `#RRGGBB`. */
    val primary: String,
    /** Kolor tła strony, `#RRGGBB`. */
    val background: String,
) {
    /** Odcisk do porównań (wielkość liter nie ma znaczenia). */
    fun fingerprint(): String = "${primary.uppercase()}|${background.uppercase()}"

    companion object {
        /** Para domyślna: fiolet na granatowym tle — wygląda dobrze od razu. */
        val DEFAULT = CustomColors(primary = "#7C5CFF", background = "#0C0A18")

        /** Poprawne `#RRGGBB` albo `null`; akceptuje też zapis bez `#` i 3 znaki. */
        fun normalizeHex(value: String?): String? {
            val raw = value?.trim()?.removePrefix("#")?.uppercase() ?: return null
            val six = when {
                raw.length == 6 -> raw
                raw.length == 3 -> raw.map { "$it$it" }.joinToString("")
                else -> return null
            }
            return if (six.all { it in '0'..'9' || it in 'A'..'F' }) "#$six" else null
        }

        /** Wartości z ustawień; brak albo śmieci zastępuje para domyślna. */
        fun normalize(primary: String?, background: String?): CustomColors = CustomColors(
            primary = normalizeHex(primary) ?: DEFAULT.primary,
            background = normalizeHex(background) ?: DEFAULT.background,
        )
    }
}

object CustomTheme {

    /**
     * Poniżej tej luminancji (WCAG, 0–1) tło uznajemy za ciemne.
     * 0,179 to punkt, w którym biały i czarny tekst mają **ten sam** kontrast —
     * dzięki temu wybór nie jest „na oko” i zgadza się z `theme-boot.js` (web).
     */
    const val DARK_LUMINANCE = 0.179

    /** Minimalny kontrast akcentu na tle (WCAG: 4,0 to bezpieczny kompromis). */
    const val ACCENT_CONTRAST_TARGET = 4.0

    /** Ile akcent przesuwa się w stronę bieli/czerni w jednym kroku. */
    const val ACCENT_STEP = 0.14

    /** Bezpiecznik pętli — więcej kroków i tak nic nie zmieni. */
    const val MAX_ACCENT_STEPS = 10

    /** Kolor tekstu na ciemnym i jasnym tle (te same wartości co w `styles.js`). */
    const val TEXT_ON_DARK = 0xFFF2F5FF.toInt()
    const val TEXT_ON_LIGHT = 0xFF12141B.toInt()

    /** Tekst odwrotny do akcentu: ciemny na jasnym akcencie, biały na ciemnym. */
    const val ACCENT_ON_DARK = 0xFF10131A.toInt()
    const val ACCENT_ON_LIGHT = 0xFFFFFFFF.toInt()

    private const val PANEL_ALPHA = 0x1A
    private const val EDGE_ALPHA = 0x33
    private const val ACCENT_SOFT_ALPHA = 0x26
    private const val PANEL_SOLID_MIX = 0.10
    private const val TEXT_SOFT_MIX = 0.35
    private const val GRADIENT_TOP_MIX = 0.16
    private const val GRADIENT_MID_MIX = 0.04
    private const val GRADIENT_END_MIX = 0.25
    private const val BLOB_HIGHLIGHT_MIX = 0.12
    private const val RADIUS_DP = 26

    /**
     * Paleta wyliczona z dwóch kolorów. Tonacja (jasna/ciemna) wynika **z tła**,
     * więc użytkownik nie musi jej dodatkowo wybierać — a jasne tło nie może dać
     * białego tekstu, bo ten zniknąłby na stronie.
     */
    fun palette(colors: CustomColors): StylePalette {
        val bg = rgb(colors.background) ?: rgb(CustomColors.DEFAULT.background)!!
        val primary = rgb(colors.primary) ?: rgb(CustomColors.DEFAULT.primary)!!
        val dark = relLuminance(bg) < DARK_LUMINANCE

        val text = if (dark) rgbOf(TEXT_ON_DARK) else rgbOf(TEXT_ON_LIGHT)
        val accent = readableAccent(primary, bg, dark)
        // Tekst na akcencie: biały, gdy spełnia próg kontrastu — inaczej ciemny.
        val accentOn = accentTextOn(accent)
        val end = if (dark) rgbOf(0xFF000000.toInt()) else rgbOf(0xFFFFFFFF.toInt())

        return StylePalette(
            id = ID,
            label = "Własny",
            isDark = dark,
            page = bg.color(),
            pageGradient = listOf(
                mix(bg, accent, GRADIENT_TOP_MIX).color(),
                mix(bg, accent, GRADIENT_MID_MIX).color(),
                mix(bg, end, GRADIENT_END_MIX).color(),
            ),
            blobs = listOf(
                AuroraBlob(
                    color = mix(accent, rgbOf(0xFFFFFFFF.toInt()), BLOB_HIGHLIGHT_MIX).color(),
                    alpha = 0.42f,
                    centerX = 0.10f,
                    centerY = -0.02f,
                    radiusX = 0.82f,
                    radiusY = 0.66f,
                ),
                AuroraBlob(
                    color = accent.color(),
                    alpha = 0.26f,
                    centerX = 0.92f,
                    centerY = 0.08f,
                    radiusX = 0.66f,
                    radiusY = 0.56f,
                ),
            ),
            panel = accent.withAlpha(PANEL_ALPHA),
            panelSolid = mix(bg, accent, PANEL_SOLID_MIX).color(),
            edge = text.withAlpha(EDGE_ALPHA),
            text = text.color(),
            textSoft = mix(text, bg, TEXT_SOFT_MIX).color(),
            accent = accent.color(),
            accentOn = accentOn.color(),
            accentSoft = accent.withAlpha(ACCENT_SOFT_ALPHA),
            radius = RADIUS_DP.dp,
        )
    }

    /** Identyfikator motywu w katalogu stylów (`StyleCatalog.styles`). */
    const val ID = "custom"

    /**
     * Akcent przyciemniany/rozjaśniany tak długo, aż będzie czytelny na tle.
     * Bez tego jasny akcent na jasnym tle dawał plakietkę nie do odczytania.
     */
    fun readableAccent(primary: Rgb, background: Rgb, dark: Boolean): Rgb {
        var accent = primary
        val towards = if (dark) rgbOf(0xFFFFFFFF.toInt()) else rgbOf(0xFF000000.toInt())
        repeat(MAX_ACCENT_STEPS) {
            if (contrast(accent, background) >= ACCENT_CONTRAST_TARGET) return accent
            accent = mix(accent, towards, ACCENT_STEP)
        }
        return accent
    }

    /**
     * Co aplikacja zrobi z wybranym akcentem — podpis pod podglądem motywu.
     *
     * Bez tego użytkownik wybiera jasny fiolet, a widzi ciemniejszy i uznaje
     * picker za zepsuty; tutaj dostaje wprost: „przyciemniony do #6B4FDB,
     * kontrast 5,1:1”.
     */
    data class AccentReport(
        val picked: String,
        val applied: String,
        val contrast: Double,
        val corrected: Boolean,
        val dark: Boolean,
    )

    fun report(colors: CustomColors): AccentReport {
        val normalized = CustomColors.normalize(colors.primary, colors.background)
        val bg = rgb(normalized.background) ?: rgb(CustomColors.DEFAULT.background)!!
        val picked = rgb(normalized.primary) ?: rgb(CustomColors.DEFAULT.primary)!!
        val dark = relLuminance(bg) < DARK_LUMINANCE
        val applied = readableAccent(picked, bg, dark)
        return AccentReport(
            picked = normalized.primary,
            applied = hexOf(applied),
            contrast = contrast(applied, bg),
            corrected = hexOf(applied) != hexOf(picked),
            dark = dark,
        )
    }
}

/**
 * Kanały 0–255. Osobny typ zamiast `Color`, bo paletę liczymy na liczbach —
 * dokładnie tak samo jak `customPalette` w `public/styles.js` (te same wyniki
 * pośrednie, ten sam zapis ARGB).
 */
data class Rgb(val r: Int, val g: Int, val b: Int) {

    /** ARGB z podanym kryciem (`alpha` 0–255). */
    fun argb(alpha: Int = 0xFF): Int = (alpha shl 24) or (r shl 16) or (g shl 8) or b

    fun color(): Color = Color(argb())

    fun withAlpha(alpha: Int): Color = Color(argb(alpha))
}

/** `#RRGGBB` → kanały; `null`, gdy zapis jest niepoprawny. */
internal fun rgb(hex: String): Rgb? {
    val clean = CustomColors.normalizeHex(hex) ?: return null
    val value = clean.removePrefix("#").toInt(16)
    return Rgb((value shr 16) and 0xFF, (value shr 8) and 0xFF, value and 0xFF)
}

/** Kanały → `#RRGGBB` (wielkie litery). Locale.ROOT, bo w innych locale `%02X` bywa inny. */
internal fun hexOf(c: Rgb): String = String.format(Locale.ROOT, "#%02X%02X%02X", c.r, c.g, c.b)

internal fun rgbOf(argb: Int): Rgb = Rgb((argb shr 16) and 0xFF, (argb shr 8) and 0xFF, argb and 0xFF)

/** Mieszanie kanałów: 0 = [a], 1 = [b]. Zaokrąglenie jak `Math.round` w JS. */
internal fun mix(a: Rgb, b: Rgb, t: Double): Rgb = Rgb(
    (a.r + (b.r - a.r) * t).roundToInt(),
    (a.g + (b.g - a.g) * t).roundToInt(),
    (a.b + (b.b - a.b) * t).roundToInt(),
)

/**
 * Luminancja względna wg WCAG (0–1): linearyzacja kanałów z wykładnikiem 2,4.
 *
 * Bez linearyzacji (surowe 0–255) środek skali wypadał za jasno — jasny fiolet
 * `#7F6AFF` wychodził „ciemny” i dostawał biały tekst o kontraście 3,7:1,
 * zamiast ciemnego o 5:1. Ten sam wzór jest w `public/styles.js`
 * (`relativeLuminance`) i w `public/theme-boot.js`.
 */
internal fun relLuminance(c: Rgb): Double {
    fun channel(value: Int): Double {
        val srgb = value / 255.0
        return if (srgb <= 0.03928) srgb / 12.92 else Math.pow((srgb + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
}

/** Kontrast WCAG dwóch kolorów (1–21). */
internal fun contrast(a: Rgb, b: Rgb): Double {
    val la = relLuminance(a)
    val lb = relLuminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
}

/**
 * Kolor tekstu na akcencie: **biały**, gdy ma co najmniej
 * [CustomTheme.ACCENT_CONTRAST_TARGET] kontrastu, inaczej ciemny.
 *
 * Kolejność jest celowa: na nasyconym akcencie biały tekst wygląda jak przycisk
 * Material 3, więc nie zamieniamy go na ciemny tylko dlatego, że ciemny wypadł
 * minimalnie lepiej. Ciemny wchodzi dopiero wtedy, gdy biały **nie spełnia**
 * progu (np. żółty akcent).
 */
internal fun accentTextOn(accent: Rgb): Rgb {
    val light = rgbOf(CustomTheme.ACCENT_ON_LIGHT)
    val dark = rgbOf(CustomTheme.ACCENT_ON_DARK)
    return if (contrast(light, accent) >= CustomTheme.ACCENT_CONTRAST_TARGET) light else dark
}
