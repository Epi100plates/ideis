package pl.matiit.planzajec.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Wszystkie motywy z wersji web (Liquid Glass 1–3, visionOS, visionOS Wydajny,
 * Apple, Auto, Jasny, Ciemny) odwzorowane jako dane: paleta tła, „aurora”
 * (plamy radialne) i materiał paneli.
 *
 * Identyfikatory są 1:1 z `public/app.js` (`lg2-dark`, `visionos-perf-light`, …),
 * więc zapisany wybór użytkownika da się przenieść między platformami.
 *
 * Grupa [StyleGroup.KOLOROWE] (fiolet, róż, połączony) powstała w aplikacji
 * i nie ma odpowiednika w wersji web — web spadnie do motywu domyślnego, jeśli
 * dostanie taki identyfikator.
 */
enum class StyleGroup(val label: String) {
    LIQUID_GLASS("Liquid Glass"),
    VISION_OS("visionOS"),
    CLASSIC("Klasyczne"),
    KOLOROWE("Kolorowe"),
    WLASNY("Własny"),
}

data class StyleDef(
    val id: String,
    val label: String,
    val hint: String,
    val group: StyleGroup,
    val isDark: Boolean,
)

/** Jedna plama tła: kolor, krycie i położenie względne (0–1). */
data class AuroraBlob(
    val color: Color,
    val alpha: Float,
    val centerX: Float,
    val centerY: Float,
    val radiusX: Float,
    val radiusY: Float,
)

/**
 * Rozwiązana paleta dla konkretnego motywu. `Auto` jest rozwiązywane wcześniej
 * na podstawie ustawień systemu, więc tutaj zawsze mamy konkretną tonację.
 */
data class StylePalette(
    val id: String,
    val label: String,
    val isDark: Boolean,
    val page: Color,
    val pageGradient: List<Color>,
    val blobs: List<AuroraBlob>,
    val panel: Color,
    val panelSolid: Color,
    val edge: Color,
    val text: Color,
    val textSoft: Color,
    val accent: Color,
    val accentOn: Color,
    val accentSoft: Color,
    val radius: Dp,
) {
    /** Wariant „Wydajny”: bez plam i bez półprzezroczystego szkła. */
    val isPerformance: Boolean get() = blobs.isEmpty()
}

object StyleCatalog {

    val styles: List<StyleDef> = listOf(
        StyleDef("lg1-dark", "Liquid Glass 1", "ciemny · czarne, minimalne szkło", StyleGroup.LIQUID_GLASS, true),
        StyleDef("lg1-light", "Liquid Glass 1", "jasny · srebrny, miękki blask", StyleGroup.LIQUID_GLASS, false),
        StyleDef("lg2-dark", "Liquid Glass 2", "ciemny · ultraclear, mocny refleks", StyleGroup.LIQUID_GLASS, true),
        StyleDef("lg2-light", "Liquid Glass 2", "jasny · lodowy, bardzo przejrzysty", StyleGroup.LIQUID_GLASS, false),
        StyleDef("lg3-dark", "Liquid Glass 3", "ciemny · mrożony grafit", StyleGroup.LIQUID_GLASS, true),
        StyleDef("lg3-light", "Liquid Glass 3", "jasny · ciepły, mleczny frost", StyleGroup.LIQUID_GLASS, false),
        StyleDef("visionos-dark", "visionOS", "ciemny · głęboka przestrzeń", StyleGroup.VISION_OS, true),
        StyleDef("visionos-light", "visionOS", "jasny · dzienne światło", StyleGroup.VISION_OS, false),
        StyleDef("visionos-perf-dark", "visionOS Wydajny", "ciemny · ten sam wygląd, bez rozmywania", StyleGroup.VISION_OS, true),
        StyleDef("visionos-perf-light", "visionOS Wydajny", "jasny · ten sam wygląd, bez rozmywania", StyleGroup.VISION_OS, false),
        StyleDef("apple", "Apple", "jasny, czysty — jak apple.com/pl/os", StyleGroup.CLASSIC, false),
        StyleDef("auto", "Auto", "jak system", StyleGroup.CLASSIC, false),
        StyleDef("light", "Jasny", "klasyczny", StyleGroup.CLASSIC, false),
        StyleDef("dark", "Ciemny", "na noc", StyleGroup.CLASSIC, true),
        StyleDef("violet-dark", "Fiolet", "ciemny · aksamitny fiolet", StyleGroup.KOLOROWE, true),
        StyleDef("violet-light", "Fiolet", "jasny · lawendowe światło", StyleGroup.KOLOROWE, false),
        StyleDef("pink-dark", "Róż", "ciemny · różowa poświata", StyleGroup.KOLOROWE, true),
        StyleDef("pink-light", "Róż", "jasny · pudrowy róż", StyleGroup.KOLOROWE, false),
        StyleDef("mix-dark", "Połączony", "ciemny · fiolet przechodzący w róż", StyleGroup.KOLOROWE, true),
        StyleDef("mix-light", "Połączony", "jasny · fiolet z różem", StyleGroup.KOLOROWE, false),
        /*
         * Motyw „Własny” nie ma zaszytej palety — liczy ją `CustomTheme` z dwóch
         * kolorów wybranych przez użytkownika (akcent + tło). `isDark` opisuje
         * tylko domyślną parę; o tonacji decyduje kolor tła.
         */
        StyleDef("custom", "Własny", "twoje dwa kolory · akcent i tło", StyleGroup.WLASNY, true),
    )

    /** Stare identyfikatory z wersji web — migracja bez błędu. */
    private val aliases = mapOf(
        "glass" to "lg2-dark",
        "lg2-fast" to "visionos-perf-dark",
        "visionos-fast" to "visionos-perf-dark",
    )

    const val DEFAULT_STYLE = "lg2-dark"

    fun normalize(id: String?): String {
        val raw = id?.trim().orEmpty()
        if (raw.isEmpty()) return DEFAULT_STYLE
        aliases[raw]?.let { return it }
        return if (styles.any { it.id == raw }) raw else DEFAULT_STYLE
    }

    fun def(id: String?): StyleDef = styles.first { it.id == normalize(id) }

    /** Id rzeczywistego motywu; `auto` wybiera jasny/ciemny wg systemu. */
    fun resolve(id: String?, systemDark: Boolean): String {
        val normalized = normalize(id)
        return when (normalized) {
            "auto" -> if (systemDark) "dark" else "light"
            else -> normalized
        }
    }

    fun palette(id: String?, systemDark: Boolean, custom: CustomColors = CustomColors.DEFAULT): StylePalette =
        paletteFor(resolve(id, systemDark), custom)

    // --- palety -------------------------------------------------------------

    private fun color(hex: Long) = Color(hex)

    private val classicLight = StylePalette(
        id = "light",
        label = "Jasny",
        isDark = false,
        page = color(0xFFF4F6FB),
        pageGradient = listOf(color(0xFFF4F6FB), color(0xFFEDF1F8)),
        blobs = emptyList(),
        panel = color(0xCCFFFFFF),
        panelSolid = color(0xFFFFFFFF),
        edge = color(0x1F1B2430),
        text = color(0xFF14161C),
        textSoft = color(0xFF4A5468),
        accent = color(0xFF4F46E5),
        accentOn = Color.White,
        accentSoft = color(0xFFEEF0FF),
        radius = 20.dp,
    )

    private val classicDark = StylePalette(
        id = "dark",
        label = "Ciemny",
        isDark = true,
        page = color(0xFF0B0E13),
        pageGradient = listOf(color(0xFF0F141C), color(0xFF0B0E13)),
        blobs = emptyList(),
        panel = color(0xFF1A1F2A),
        panelSolid = color(0xFF151A23),
        edge = color(0x2EFFFFFF),
        text = color(0xFFE8ECF4),
        textSoft = color(0xFFB3BCCC),
        accent = color(0xFF8B8BFF),
        accentOn = color(0xFF14142B),
        accentSoft = color(0xFF1E1F3D),
        radius = 20.dp,
    )

    private val apple = StylePalette(
        id = "apple",
        label = "Apple",
        isDark = false,
        page = color(0xFFF5F5F7),
        pageGradient = listOf(color(0xFFFFFFFF), color(0xFFF5F5F7)),
        blobs = emptyList(),
        panel = color(0xF2FFFFFF),
        panelSolid = color(0xFFFFFFFF),
        edge = color(0x14000000),
        text = color(0xFF1D1D1F),
        textSoft = color(0xFF424245),
        accent = color(0xFF0071E3),
        accentOn = Color.White,
        accentSoft = color(0xFFE8F2FF),
        radius = 18.dp,
    )

    /**
     * Trzy motywy kolorowe — te same palety ma wersja web
     * (`public/styles.js`, grupa „Kolorowe”). Każdy ma wariant jasny i ciemny,
     * żeby dał się wybrać niezależnie od trybu systemu.
     *
     * `panelSolid` jest tu mocniej zabarwiony niż w motywach klasycznych —
     * z tego koloru rysuje się tło widżetu, więc odcień motywu musi być widoczny
     * także na pulpicie, a nie tylko we wnętrzu aplikacji.
     */
    private val violetDark = StylePalette(
        id = "violet-dark",
        label = "Fiolet",
        isDark = true,
        page = color(0xFF07040F),
        pageGradient = listOf(color(0xFF170B32), color(0xFF0B0518), color(0xFF04020A)),
        blobs = listOf(
            AuroraBlob(color(0xFF7C3AED), 0.56f, 0.10f, -0.02f, 0.82f, 0.66f),
            AuroraBlob(color(0xFFC026D3), 0.30f, 0.96f, 0.06f, 0.66f, 0.56f),
            AuroraBlob(color(0xFF4F46E5), 0.34f, 0.50f, 1.10f, 0.76f, 0.62f),
        ),
        panel = color(0x0DE4D9FF),
        panelSolid = color(0xFF120A24),
        edge = color(0x33D9CCFF),
        text = color(0xFFF3EEFF),
        textSoft = color(0xFFCFC4E8),
        accent = color(0xFFC4B5FD),
        accentOn = color(0xFF1B0F3A),
        accentSoft = color(0x24C4B5FD),
        radius = 26.dp,
    )

    private val violetLight = StylePalette(
        id = "violet-light",
        label = "Fiolet",
        isDark = false,
        page = color(0xFFF2EEFF),
        pageGradient = listOf(color(0xFFFBF8FF), color(0xFFF0E9FF), color(0xFFE4DAFF)),
        blobs = listOf(
            AuroraBlob(color(0xFFA78BFA), 0.42f, 0.08f, -0.02f, 0.74f, 0.64f),
            AuroraBlob(color(0xFFC084FC), 0.30f, 0.96f, 0.06f, 0.64f, 0.56f),
            AuroraBlob(color(0xFF9AB6FF), 0.26f, 0.50f, 1.10f, 0.66f, 0.58f),
        ),
        panel = color(0x75FFFFFF),
        panelSolid = color(0xFFFDFBFF),
        edge = color(0x21301E63),
        text = color(0xFF1B1030),
        textSoft = color(0xFF4E3F6B),
        accent = color(0xFF6D28D9),
        accentOn = Color.White,
        accentSoft = color(0xFFEDE4FF),
        radius = 26.dp,
    )

    private val pinkDark = StylePalette(
        id = "pink-dark",
        label = "Róż",
        isDark = true,
        page = color(0xFF0D040A),
        pageGradient = listOf(color(0xFF2C0A1F), color(0xFF140510), color(0xFF07020A)),
        blobs = listOf(
            AuroraBlob(color(0xFFFF4D96), 0.52f, 0.10f, -0.02f, 0.82f, 0.66f),
            AuroraBlob(color(0xFFB01E63), 0.34f, 0.96f, 0.06f, 0.66f, 0.56f),
            AuroraBlob(color(0xFFFF8AB7), 0.22f, 0.50f, 1.10f, 0.76f, 0.62f),
        ),
        panel = color(0x0DFFE4F0),
        panelSolid = color(0xFF1E0A16),
        edge = color(0x33FFD1E3),
        text = color(0xFFFFF0F6),
        textSoft = color(0xFFE8C4D6),
        accent = color(0xFFFFB3CE),
        accentOn = color(0xFF3A0A1F),
        accentSoft = color(0x24FFB3CE),
        radius = 24.dp,
    )

    private val pinkLight = StylePalette(
        id = "pink-light",
        label = "Róż",
        isDark = false,
        page = color(0xFFFFEFF5),
        pageGradient = listOf(color(0xFFFFF8FB), color(0xFFFFECF3), color(0xFFFBD9E6)),
        blobs = listOf(
            AuroraBlob(color(0xFFFF9EC4), 0.44f, 0.92f, -0.02f, 0.74f, 0.62f),
            AuroraBlob(color(0xFFFFC2D6), 0.30f, 0.04f, 0.08f, 0.64f, 0.56f),
            AuroraBlob(color(0xFFF0A6C8), 0.24f, 0.50f, 1.10f, 0.66f, 0.58f),
        ),
        panel = color(0x75FFFFFF),
        panelSolid = color(0xFFFFFBFD),
        edge = color(0x21A03D63),
        text = color(0xFF2C0F1D),
        textSoft = color(0xFF6B4657),
        accent = color(0xFFBE1E63),
        accentOn = Color.White,
        accentSoft = color(0xFFFFE3EE),
        radius = 24.dp,
    )

    /** Fiolet przechodzący w róż: dwie plamy w przeciwległych narożnikach. */
    private val mixDark = StylePalette(
        id = "mix-dark",
        label = "Połączony",
        isDark = true,
        page = color(0xFF08040D),
        pageGradient = listOf(color(0xFF23103A), color(0xFF120818), color(0xFF05020A)),
        blobs = listOf(
            AuroraBlob(color(0xFF8B5CF6), 0.50f, 0.06f, -0.02f, 0.80f, 0.64f),
            AuroraBlob(color(0xFFFF5C9A), 0.40f, 0.94f, 0.10f, 0.66f, 0.58f),
            AuroraBlob(color(0xFF4F46E5), 0.28f, 0.50f, 1.10f, 0.74f, 0.60f),
        ),
        panel = color(0x0DEBD9FF),
        panelSolid = color(0xFF170C22),
        edge = color(0x33E6D2FF),
        text = color(0xFFF6F0FF),
        textSoft = color(0xFFD9C8E8),
        accent = color(0xFFE9B8FF),
        accentOn = color(0xFF26073A),
        accentSoft = color(0x24E9B8FF),
        radius = 26.dp,
    )

    private val mixLight = StylePalette(
        id = "mix-light",
        label = "Połączony",
        isDark = false,
        page = color(0xFFF6EEFB),
        pageGradient = listOf(color(0xFFFDF7FF), color(0xFFF4E9FB), color(0xFFEBDCF5)),
        blobs = listOf(
            AuroraBlob(color(0xFFB794F6), 0.40f, 0.06f, -0.02f, 0.76f, 0.62f),
            AuroraBlob(color(0xFFFFB0CE), 0.34f, 0.94f, 0.08f, 0.64f, 0.58f),
            AuroraBlob(color(0xFF8FB8FF), 0.24f, 0.50f, 1.10f, 0.66f, 0.58f),
        ),
        panel = color(0x75FFFFFF),
        panelSolid = color(0xFFFEFCFF),
        edge = color(0x212E1B45),
        text = color(0xFF1E1030),
        textSoft = color(0xFF584268),
        accent = color(0xFFA21CAF),
        accentOn = Color.White,
        accentSoft = color(0xFFF6E3FA),
        radius = 26.dp,
    )

    /** Identyfikator motywu → paleta (motywy z wersji web trzymają się wzoru web). */
    private fun paletteFor(id: String, custom: CustomColors): StylePalette = when (id) {
        // Motyw użytkownika: paletę liczy `CustomTheme` z jego dwóch kolorów.
        "custom" -> CustomTheme.palette(custom)

        // Motywy aplikacji (grupa „Kolorowe”) — patrz wyżej.
        "violet-dark" -> violetDark
        "violet-light" -> violetLight
        "pink-dark" -> pinkDark
        "pink-light" -> pinkLight
        "mix-dark" -> mixDark
        "mix-light" -> mixLight

        "lg1-dark" -> StylePalette(
            id = id, label = "Liquid Glass 1", isDark = true,
            page = color(0xFF030303),
            pageGradient = listOf(color(0xFF10163A), color(0xFF070A18), color(0xFF02040C)),
            blobs = listOf(
                AuroraBlob(color(0xFF655CFF), 0.62f, 0.12f, 0.02f, 0.80f, 0.62f),
                AuroraBlob(color(0xFFFF5497), 0.36f, 0.94f, 0.08f, 0.66f, 0.56f),
                AuroraBlob(color(0xFF00D0BB), 0.38f, 0.50f, 1.08f, 0.74f, 0.62f),
                AuroraBlob(color(0xFF4884FF), 0.24f, 0.70f, 0.46f, 0.44f, 0.38f),
            ),
            panel = color(0x08FFFFFF), panelSolid = color(0xFF111214),
            edge = color(0x18FFFFFF),
            text = Color.White, textSoft = color(0xFFD6D6DA),
            accent = color(0xFFF2F2F4), accentOn = color(0xFF0A0A0A), accentSoft = color(0x12FFFFFF),
            radius = 22.dp,
        )

        "lg1-light" -> StylePalette(
            id = id, label = "Liquid Glass 1", isDark = false,
            page = color(0xFFDCE4EE),
            pageGradient = listOf(color(0xFFEDE8FF), color(0xFFFFE4D6), color(0xFFD6EFF8)),
            blobs = listOf(
                AuroraBlob(color(0xFFA496FF), 0.44f, 0.08f, 0.00f, 0.72f, 0.62f),
                AuroraBlob(color(0xFFFFB091), 0.42f, 0.96f, 0.04f, 0.62f, 0.56f),
                AuroraBlob(color(0xFF78D2EB), 0.34f, 0.50f, 1.08f, 0.66f, 0.56f),
            ),
            panel = color(0x5CFFFFFF), panelSolid = color(0xFFF7F9FC),
            edge = color(0x1F233448),
            text = color(0xFF14161C), textSoft = color(0xFF4A5468),
            accent = color(0xFF4F46E5), accentOn = Color.White, accentSoft = color(0xFFEEF0FF),
            radius = 22.dp,
        )

        "lg2-dark" -> StylePalette(
            id = id, label = "Liquid Glass 2", isDark = true,
            page = color(0xFF04070C),
            pageGradient = listOf(color(0xFF031522), color(0xFF04101A), color(0xFF01050A)),
            blobs = listOf(
                AuroraBlob(color(0xFF00CAFF), 0.50f, 0.08f, -0.02f, 0.82f, 0.66f),
                AuroraBlob(color(0xFF4880FF), 0.38f, 0.96f, 0.06f, 0.66f, 0.56f),
                AuroraBlob(color(0xFF00FFD0), 0.24f, 0.50f, 1.10f, 0.76f, 0.62f),
                AuroraBlob(color(0xFF78F5FF), 0.13f, 0.58f, 0.40f, 0.42f, 0.36f),
            ),
            panel = color(0x08D6ECFF), panelSolid = color(0xFF0A1622),
            edge = color(0x29BEDCFF),
            text = Color.White, textSoft = color(0xFFC9D8E8),
            accent = color(0xFFDCECFF), accentOn = color(0xFF04121E), accentSoft = color(0x1AAAD7FF),
            radius = 28.dp,
        )

        "lg2-light" -> StylePalette(
            id = id, label = "Liquid Glass 2", isDark = false,
            page = color(0xFFD5E7F7),
            pageGradient = listOf(color(0xFFF2FCFF), color(0xFFDCEFFC), color(0xFFC6DEF2)),
            blobs = listOf(
                AuroraBlob(color(0xFF68D8FF), 0.48f, 0.06f, -0.02f, 0.74f, 0.64f),
                AuroraBlob(color(0xFF6094FF), 0.36f, 0.98f, 0.04f, 0.64f, 0.56f),
                AuroraBlob(color(0xFF70FFD8), 0.28f, 0.50f, 1.10f, 0.66f, 0.58f),
            ),
            panel = color(0x57FFFFFF), panelSolid = color(0xFFF5FBFF),
            edge = color(0x211C4669),
            text = color(0xFF0F1A24), textSoft = color(0xFF425466),
            accent = color(0xFF0B63B8), accentOn = Color.White, accentSoft = color(0xFFDCEFFF),
            radius = 28.dp,
        )

        "lg3-dark" -> StylePalette(
            id = id, label = "Liquid Glass 3", isDark = true,
            page = color(0xFF0A0806),
            pageGradient = listOf(color(0xFF1A120C), color(0xFF0E0906), color(0xFF040202)),
            blobs = listOf(
                AuroraBlob(color(0xFFFF9E42), 0.42f, 0.88f, -0.02f, 0.82f, 0.64f),
                AuroraBlob(color(0xFFFF5C80), 0.24f, 0.02f, 0.10f, 0.70f, 0.58f),
                AuroraBlob(color(0xFFB8683D), 0.22f, 0.50f, 1.10f, 0.80f, 0.64f),
                AuroraBlob(color(0xFFFFD28C), 0.12f, 0.34f, 0.44f, 0.46f, 0.40f),
            ),
            panel = color(0x0EFFF6EC), panelSolid = color(0xFF1A1512),
            edge = color(0x29FFEBD7),
            text = Color.White, textSoft = color(0xFFE3D5C4),
            accent = color(0xFFFFE3BD), accentOn = color(0xFF241706), accentSoft = color(0x24FFE3BD),
            radius = 22.dp,
        )

        "lg3-light" -> StylePalette(
            id = id, label = "Liquid Glass 3", isDark = false,
            page = color(0xFFE8DECF),
            pageGradient = listOf(color(0xFFFCF7EF), color(0xFFF0E5D6), color(0xFFE1D2BD)),
            blobs = listOf(
                AuroraBlob(color(0xFFFFB870), 0.46f, 0.90f, -0.02f, 0.74f, 0.62f),
                AuroraBlob(color(0xFFFF849A), 0.30f, 0.02f, 0.08f, 0.64f, 0.56f),
                AuroraBlob(color(0xFF9ABA88), 0.26f, 0.50f, 1.10f, 0.66f, 0.58f),
            ),
            panel = color(0x8AFFFCF7), panelSolid = color(0xFFFBF6EE),
            edge = color(0x2158442C),
            text = color(0xFF241B10), textSoft = color(0xFF5B4A37),
            accent = color(0xFF9A5B21), accentOn = Color.White, accentSoft = color(0xFFFFEBD5),
            radius = 22.dp,
        )

        "visionos-dark" -> StylePalette(
            id = id, label = "visionOS", isDark = true,
            page = color(0xFF05070D),
            pageGradient = listOf(color(0xFF0A0E22), color(0xFF060814), color(0xFF02030A)),
            blobs = listOf(
                AuroraBlob(color(0xFF5C78FF), 0.56f, 0.12f, -0.02f, 0.82f, 0.66f),
                AuroraBlob(color(0xFFBE52FF), 0.38f, 0.96f, 0.04f, 0.66f, 0.56f),
                AuroraBlob(color(0xFFFFB262), 0.34f, 0.92f, 0.88f, 0.58f, 0.50f),
                AuroraBlob(color(0xFF00D8C6), 0.26f, 0.18f, 1.10f, 0.74f, 0.60f),
            ),
            panel = color(0x0DDCEAFF), panelSolid = color(0xFF0C1220),
            edge = color(0x33FFE2BE),
            text = Color.White, textSoft = color(0xFFD8E2F0),
            accent = color(0xFFFFE2BE), accentOn = color(0xFF231505), accentSoft = color(0x24FFE2BE),
            radius = 26.dp,
        )

        "visionos-light" -> StylePalette(
            id = id, label = "visionOS", isDark = false,
            page = color(0xFFE5DBCD),
            pageGradient = listOf(color(0xFFFCF7EF), color(0xFFEEE3D4), color(0xFFDDE4EE)),
            blobs = listOf(
                AuroraBlob(color(0xFFFFCC8E), 0.60f, 0.10f, -0.02f, 0.74f, 0.64f),
                AuroraBlob(color(0xFFBE9CFF), 0.34f, 0.94f, 0.06f, 0.64f, 0.58f),
                AuroraBlob(color(0xFF7CB8E6), 0.34f, 0.50f, 1.10f, 0.66f, 0.58f),
            ),
            panel = color(0x75FFFDF9), panelSolid = color(0xFFFBF7F1),
            edge = color(0x1F553C23),
            text = color(0xFF231A10), textSoft = color(0xFF5B4A37),
            accent = color(0xFF8A5B22), accentOn = Color.White, accentSoft = color(0xFFFFEBD5),
            radius = 26.dp,
        )

        "visionos-perf-dark" -> StylePalette(
            id = id, label = "visionOS Wydajny", isDark = true,
            page = color(0xFF05070D),
            pageGradient = listOf(color(0xFF0B1122), color(0xFF05070D), color(0xFF020309)),
            blobs = emptyList(),
            panel = color(0xFF10182B), panelSolid = color(0xFF0F1728),
            edge = color(0x33FFE2BE),
            text = Color.White, textSoft = color(0xFFD8E2F0),
            accent = color(0xFFFFE2BE), accentOn = color(0xFF231505), accentSoft = color(0xFF262134),
            radius = 26.dp,
        )

        "visionos-perf-light" -> StylePalette(
            id = id, label = "visionOS Wydajny", isDark = false,
            page = color(0xFFE5DBCD),
            pageGradient = listOf(color(0xFFFCF7EF), color(0xFFF0E7DA), color(0xFFE5DBCD)),
            blobs = emptyList(),
            panel = color(0xFFFFFBF5), panelSolid = color(0xFFFFFDF9),
            edge = color(0x1F553C23),
            text = color(0xFF231A10), textSoft = color(0xFF5B4A37),
            accent = color(0xFF8A5B22), accentOn = Color.White, accentSoft = color(0xFFFFEBD5),
            radius = 26.dp,
        )

        "apple" -> apple
        "dark" -> classicDark
        else -> classicLight
    }

    /** Kolejność i podpisy grup w menu stylu (jak w wersji web + „Kolorowe”, „Własny”). */
    val groups: List<Pair<StyleGroup, List<StyleDef>>> =
        listOf(
            StyleGroup.LIQUID_GLASS to styles.filter { it.group == StyleGroup.LIQUID_GLASS },
            StyleGroup.VISION_OS to styles.filter { it.group == StyleGroup.VISION_OS },
            StyleGroup.CLASSIC to styles.filter { it.group == StyleGroup.CLASSIC },
            StyleGroup.KOLOROWE to styles.filter { it.group == StyleGroup.KOLOROWE },
            StyleGroup.WLASNY to styles.filter { it.group == StyleGroup.WLASNY },
        )
}
