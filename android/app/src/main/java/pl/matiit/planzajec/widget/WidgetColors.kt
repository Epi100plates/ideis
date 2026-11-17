package pl.matiit.planzajec.widget

import androidx.compose.ui.graphics.lerp
import androidx.glance.unit.ColorProvider
import pl.matiit.planzajec.ui.theme.StylePalette

/**
 * Kolory widżetu wyliczone z palety stylu. Widżet nie ma własnego przełącznika
 * jasny/ciemny — dostaje gotową, konkretną paletę (dzień/noc wybiera system).
 */
internal data class WidgetColors(
    /** Tło panelu (pełne). */
    val surface: ColorProvider,
    /** Tło „minimal”/„kafelki”: lekko przezroczyste, żeby nie dominowało na pulpicie. */
    val surfaceFlat: ColorProvider,
    /** Tło wariantu „szkło” — wyraźnie przezroczyste. */
    val surfaceGlass: ColorProvider,
    val title: ColorProvider,
    val subtle: ColorProvider,
    /**
     * Metadane (`Wyk · sala · 1h 30m`). Ciemniejsze od [subtle], bo w widżecie
     * drugorzędny tekst musi być czytelny z dystansu, a nie tylko „delikatny”.
     */
    val meta: ColorProvider,
    val accent: ColorProvider,
    /** Tekst na wypełnieniu akcentem (nagłówek wariantu „Akcent”). */
    val accentOn: ColorProvider,
    /** Delikatne tło kart/plakietek w odcieniu akcentu. */
    val accentWash: ColorProvider,
    /** Cienkie linie osi czasu i separatorów. */
    val line: ColorProvider,
    /**
     * Tło kafelka w wariancie „Kafelki” — odsunięte od panelu w stronę koloru
     * tekstu, więc karty są widoczne i w jasnej, i w ciemnej palecie.
     */
    val tile: ColorProvider,
    /** Mocniejsze tło pod kafelkiem — rysuje 1 dp „obwódki” bez wsparcia Glance. */
    val tileEdge: ColorProvider,
)

internal fun widgetColors(palette: StylePalette): WidgetColors = WidgetColors(
    surface = ColorProvider(palette.panelSolid),
    surfaceFlat = ColorProvider(palette.panelSolid.copy(alpha = 0.90f)),
    surfaceGlass = ColorProvider(palette.panelSolid.copy(alpha = 0.62f)),
    title = ColorProvider(palette.text),
    subtle = ColorProvider(palette.textSoft),
    meta = ColorProvider(lerp(palette.textSoft, palette.text, META_MIX)),
    accent = ColorProvider(palette.accent),
    accentOn = ColorProvider(palette.accentOn),
    accentWash = ColorProvider(palette.accent.copy(alpha = 0.15f)),
    line = ColorProvider(palette.edge),
    tile = ColorProvider(lerp(palette.panelSolid, palette.text, TILE_MIX)),
    tileEdge = ColorProvider(lerp(palette.panelSolid, palette.text, TILE_EDGE_MIX)),
)

/** Metadane bliżej koloru tekstu niż `textSoft` — czytelność z dystansu. */
private const val META_MIX = 0.45f

/** O ile kafelek odcina się od panelu (w stronę koloru tekstu). */
private const val TILE_MIX = 0.10f

/**
 * Kolor „obwódki” wokół kafelka. Wcześniej 0.30 — karty zlewały się w jeden
 * blok na jasnych tapetach, bo różnica między wypełnieniem a ramką była zbyt mała.
 */
private const val TILE_EDGE_MIX = 0.44f
