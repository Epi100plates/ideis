package pl.matiit.planzajec.ui.theme

import androidx.compose.ui.graphics.toArgb

/**
 * Dane pickera motywu „Własny” — **te same co `CUSTOM_PAIRS`, `CUSTOM_ACCENTS`
 * i `CUSTOM_BACKGROUNDS` w `public/styles.js`**. Zgodność pilnuje
 * `scripts/self-test.js`, bo inaczej web i APK proponowałyby inne kolory.
 *
 * Kolory gotowych par nie są tu wpisane drugi raz: bierzemy je z palet
 * w [StyleCatalog], więc nowa paleta w katalogu nie wymaga zmiany w tym pliku.
 */
data class CustomPair(val styleId: String, val name: String)

object CustomPairs {

    /**
     * Pary „na start” — jedno dotknięcie daje gotowy, sensowny motyw.
     * `styleId` wskazuje paletę, z której bierzemy akcent i tło.
     */
    val pairs: List<CustomPair> = listOf(
        CustomPair("violet-dark", "Fiolet na czerni"),
        CustomPair("pink-dark", "Róż w mroku"),
        CustomPair("mix-dark", "Fiolet z różem"),
        CustomPair("lg3-dark", "Ciepły grafit"),
        CustomPair("apple", "Papier"),
        CustomPair("violet-light", "Lawenda"),
    )

    /** Próbki akcentu: barwy, które są czytelne i na ciemnym, i na jasnym tle. */
    val accents = listOf(
        "#7C5CFF", "#22D3EE", "#34D399", "#F59E0B",
        "#F472B6", "#60A5FA", "#A3E635", "#FB7185",
    )

    /** Próbki tła: trzy ciemne tony i trzy jasne — ten kolor wyznacza tonację. */
    val backgrounds = listOf(
        "#0C0A18", "#05070C", "#141018",
        "#F4F5F8", "#FFF7F0", "#F2F7FF",
    )

    /** Kolory pary: akcent i tło z gotowej palety (bez drugiej listy kolorów). */
    fun colors(pair: CustomPair): CustomColors {
        val palette = StyleCatalog.palette(pair.styleId, systemDark = false)
        return CustomColors.normalize(
            hex(palette.accent.toArgb()),
            hex(palette.page.toArgb()),
        )
    }

    private fun hex(argb: Int): String = hexOf(rgbOf(argb))
}
