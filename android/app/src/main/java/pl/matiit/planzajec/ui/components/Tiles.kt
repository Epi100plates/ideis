package pl.matiit.planzajec.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateRectAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlin.math.abs

/**
 * Wspólny wygląd pasków kafelków — dolna nawigacja widoków i pasek tygodnia
 * w widoku dnia. Jedno miejsce definiuje promienie, obramowanie, przezroczystość,
 * akcent wyboru **i animację** podświetlenia, więc oba paski poruszają się
 * dokładnie tak samo i nie mogą się rozjechać wizualnie.
 */
object TileStyle {
    val radius = 20.dp
    val barRadius = 24.dp

    /**
     * Promień kafelka dnia w pasku tygodnia. Dni są **prostokątne** — mają
     * mieścić dwie linie tekstu i kropki pod numerem, więc zaokrąglenie 20 dp
     * zjadało im boki i wyglądało jak pigułka. Niższy promień trzyma je
     * w rodzinie kafelków, ale czytelnie pokazuje „prostokąt z miękkimi rogami”.
     */
    val subtleRadius = 10.dp

    /** Promień kafelka wybranej pozycji dla danego paska. */
    fun cellRadius(style: TileBarStyle): Dp =
        if (style == TileBarStyle.Subtle) subtleRadius else radius

    /** Promień zewnętrznej pigułki paska: dolna nawigacja 24 dp, pasek dni 16 dp. */
    fun barCorner(style: TileBarStyle): Dp =
        if (style == TileBarStyle.Subtle) subtleRadius + 6.dp else barRadius

    val gap = 2.dp
    val inset = 4.dp
    const val BAR_ALPHA = 0.94f
    const val BORDER_ALPHA = 0.55f

    /**
     * Wypełnienie pigułki wyboru. Wcześniej 0.14 — plamka była tak blada, że jej
     * przesuwanie czytało się jak **zanikanie** koloru, a nie ruch. Teraz pigułka
     * jest wyraźnym obiektem: pełniejsze wypełnienie, własna krawędź i delikatna
     * poświata wokół, żeby widać było, że coś naprawdę jedzie po pasku.
     */
    const val FILL_ALPHA = 0.26f
    const val EDGE_ALPHA = 0.55f
    const val GLOW_ALPHA = 0.10f

    /**
     * Wariant „subtelny” — dla paska tygodnia u góry. Ma być wyraźnie lżejszy
     * od dolnej nawigacji (brak poświaty, cieńsza ramka), ale zbudowany z tych
     * samych elementów, żeby góra i dół wyglądały jak rodzina.
     */
    const val SUBTLE_FILL_ALPHA = 0.22f
    const val SUBTLE_EDGE_ALPHA = 0.30f
    const val SUBTLE_GLOW_ALPHA = 0.05f
    const val SUBTLE_ALPHA = 0.34f
    const val SUBTLE_BORDER_ALPHA = 0.24f

    /** Ramka pigułki — 1 dp, jak obrys karty. */
    val edge = 1.dp

    /** Szerokość poświaty wokół pigułki. */
    val glow = 3.dp

    /**
     * Sprężyna podświetlenia — „liquid”: długi, miękki przelot z lekkim
     * przeregulowaniem. Niska sztywność (210) daje czas na płynięcie plamki
     * i widoczne rozciągnięcie, damping 0.72 — jedno muśnięcie krawędzi.
     */
    const val LIQUID_DAMPING = 0.72f
    const val LIQUID_STIFFNESS = 210f

    /**
     * Rozciągnięcie pigułki w kierunku ruchu: im dalej ma do celu, tym bardziej
     * wysuwa przednią krawędź (maks. 45% szerokości). Kapsuła nie teleportuje
     * się, tylko płynie i kurczy przy dojściu.
     */
    const val STRETCH_FACTOR = 0.26f
    const val STRETCH_MAX = 0.45f

    /** Spłaszczenie pigułki w trakcie przelotu (maks. 10% wysokości). */
    const val SQUASH = 0.10f

    /**
     * Dryf treści: kafelki pod pigułką jadą z nią o ułamek pozostałej drogi
     * (maks. 4 dp), więc widać kierunek ruchu, a nie tylko zmianę koloru.
     */
    const val LAG_FACTOR = 0.12f
    val lagMax = 4.dp

    /** Skala treści wybranego kafelka — drobne „nabrzmienie” jak w Liquid Glass. */
    const val SELECTED_SCALE = 1.05f

    /** Zmiana koloru treści: krótka, żeby przełączenie nie wyglądało na wygaszanie. */
    const val CONTENT_FADE_MS = 120
}

/** Jak mocno pasek kafelków zaznacza swoją obecność. */
enum class TileBarStyle {
    /** Dolna nawigacja: pełna pigułka z obramowaniem i poświatą. */
    Floating,

    /** Pasek tygodnia: ta sama konstrukcja, ale bez poświaty i z lekką ramką. */
    Subtle,
}

/**
 * Geometria paska: gdzie leżą kafelki po zmierzeniu szerokości. Liczona z realnie
 * zmierzonego rozmiaru, więc animacja działa przy każdej szerokości ekranu
 * i każdej skali czcionki. Bez Androida — testowana na JVM.
 */
@Immutable
class TileGrid(
    val widthPx: Float,
    val heightPx: Float,
    val gapPx: Float,
    val count: Int,
) {
    val tilePx: Float =
        if (count > 0) ((widthPx - gapPx * (count - 1)) / count).coerceAtLeast(0f) else 0f

    /** Pasek jest gotowy do rysowania dopiero po pierwszym pomiarze. */
    val measured: Boolean get() = count > 0 && tilePx > 0f && heightPx > 0f

    fun rectOf(index: Int): Rect {
        if (!measured) return Rect.Zero
        val safe = index.coerceIn(0, count - 1)
        return Rect(
            offset = Offset(safe * (tilePx + gapPx), 0f),
            size = Size(tilePx, heightPx),
        )
    }

    fun centerOf(index: Int): Float = rectOf(index).center.x

    companion object {
        val Empty = TileGrid(0f, 0f, 0f, 0)
    }
}

/**
 * Czysta matematyka ruchu pigułki. Trzymana osobno od rysowania, żeby dało się
 * ją sprawdzić testem: rozciągnięcie w kierunku ruchu, spłaszczenie w przelocie
 * i dryf treści kafelków.
 */
object TileMotion {

    /** O ile pikseli wysuwa się przednia krawędź; nigdy więcej niż [STRETCH_MAX] szerokości. */
    fun stretch(travelPx: Float, widthPx: Float): Float {
        if (widthPx <= 0f || travelPx == 0f) return 0f
        return (abs(travelPx) * TileStyle.STRETCH_FACTOR)
            .coerceAtMost(widthPx * TileStyle.STRETCH_MAX)
    }

    /** Postęp przelotu 0..1 — 1 tuż po zmianie wyboru, 0 po dojściu na miejsce. */
    fun progress(travelPx: Float, widthPx: Float): Float =
        if (widthPx <= 0f) 0f else (abs(travelPx) / widthPx).coerceIn(0f, 1f)

    /** O ile pikseli pigułka jest niższa w trakcie przelotu. */
    fun squash(travelPx: Float, widthPx: Float, heightPx: Float): Float =
        heightPx * TileStyle.SQUASH * progress(travelPx, widthPx)

    /**
     * Lewa krawędź rysowanej pigułki: przednia krawędź wysuwa się w stronę
     * celu, tylna zostaje na miejscu. Jazda w prawo = rozciągnięcie w prawo,
     * jazda w lewo = w lewo.
     */
    fun pillLeft(pillLeft: Float, travelPx: Float, stretchPx: Float): Float =
        if (travelPx >= 0f) pillLeft else pillLeft - stretchPx

    /**
     * Dryf treści kafelka: przeciwnie do kierunku ruchu, proporcjonalnie do
     * pozostałej drogi i tym mocniej, im bliżej celu pigułki stoi kafelek.
     * Ograniczony, bo to podpowiedź ruchu, nie przesuwanie layoutu.
     */
    fun lag(travelPx: Float, tileCenterPx: Float, targetCenterPx: Float, tileWidthPx: Float, maxPx: Float): Float {
        if (travelPx == 0f || tileWidthPx <= 0f) return 0f
        val distance = abs(tileCenterPx - targetCenterPx) / tileWidthPx
        val weight = 1f / (1f + distance)
        return (-travelPx * TileStyle.LAG_FACTOR * weight).coerceIn(-maxPx, maxPx)
    }
}

/**
 * Uchwyt podświetlenia: bieżąca (animowana) pozycja pigułki i cel. Odczyty
 * w fazie rysowania — `drawBehind`/`graphicsLayer` — więc animacja nie
 * powoduje rekompozycji kafelków.
 */
@Stable
class TileHighlight internal constructor(
    private val animated: State<Rect>,
    val target: Rect,
) {
    val rect: Rect get() = animated.value

    /** Ile pikseli zostało do celu (dodatnie = pigułka jedzie w prawo). */
    val travel: Float get() = target.left - animated.value.left
}

/**
 * Sprężyna podświetlenia dla zmierzonego paska. `null`, dopóki pasek nie ma
 * rozmiaru — wtedy nie ma czego animować (i nie ma skoku z zera przy starcie).
 */
@Composable
fun rememberTileHighlight(grid: TileGrid, index: Int): TileHighlight? {
    if (!grid.measured) return null
    val target = grid.rectOf(index)
    val animated = animateRectAsState(
        targetValue = target,
        animationSpec = spring(
            dampingRatio = TileStyle.LIQUID_DAMPING,
            stiffness = TileStyle.LIQUID_STIFFNESS,
        ),
        label = "tile-highlight",
    )
    return remember(animated, target) { TileHighlight(animated, target) }
}

/** Siatka kafelków z aktualnie zmierzonego paska (density → piksele). */
@Composable
fun rememberTileGrid(track: IntSize, count: Int, gap: Dp = TileStyle.gap): TileGrid {
    val density = LocalDensity.current
    return remember(track, count, gap, density) {
        TileGrid(
            widthPx = track.width.toFloat(),
            heightPx = track.height.toFloat(),
            gapPx = with(density) { gap.toPx() },
            count = count,
        )
    }
}

/**
 * Pływająca pigułka z kafelkami. [indicator] rysuje się **pod** kafelkami
 * (podświetlenie wybranej pozycji) i dostaje pełny rozmiar paska.
 */
@Composable
fun TileBar(
    modifier: Modifier = Modifier,
    trackModifier: Modifier = Modifier,
    style: TileBarStyle = TileBarStyle.Floating,
    indicator: (@Composable BoxScope.() -> Unit)? = null,
    content: @Composable RowScope.() -> Unit,
) {
    val subtle = style == TileBarStyle.Subtle
    Surface(
        shape = RoundedCornerShape(TileStyle.barCorner(style)),
        color = MaterialTheme.colorScheme.surface.copy(
            alpha = if (subtle) TileStyle.SUBTLE_ALPHA else TileStyle.BAR_ALPHA,
        ),
        contentColor = MaterialTheme.colorScheme.onSurface,
        border = BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outlineVariant.copy(
                alpha = if (subtle) TileStyle.SUBTLE_BORDER_ALPHA else TileStyle.BORDER_ALPHA,
            ),
        ),
        // Cień tylko na dole: góra ma być tłem, nie osobną „warstwą” nad planem.
        tonalElevation = if (subtle) 0.dp else 3.dp,
        shadowElevation = if (subtle) 0.dp else 2.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Box(Modifier.fillMaxWidth().padding(if (subtle) 3.dp else TileStyle.inset)) {
            indicator?.invoke(this)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(trackModifier),
                horizontalArrangement = Arrangement.spacedBy(TileStyle.gap),
                verticalAlignment = Alignment.CenterVertically,
                content = content,
            )
        }
    }
}

/**
 * Podświetlenie wybranej pozycji — wspólne dla obu pasków.
 *
 * Pozycję liczymy z realnie zmierzonej szerokości paska i równego podziału na
 * kafelki, a ruch idzie sprężyną. W trakcie przelotu pigułka **rozciąga się**
 * w kierunku ruchu i lekko **spłaszcza**, więc widać, że jedzie — zamiast
 * migotania koloru pod nieruchomymi etykietami.
 */
@Composable
fun BoxScope.TileIndicator(highlight: TileHighlight, style: TileBarStyle) {
    val subtle = style == TileBarStyle.Subtle
    val accent = MaterialTheme.colorScheme.primary
    val fill = accent.copy(alpha = if (subtle) TileStyle.SUBTLE_FILL_ALPHA else TileStyle.FILL_ALPHA)
    val edge = accent.copy(alpha = if (subtle) TileStyle.SUBTLE_EDGE_ALPHA else TileStyle.EDGE_ALPHA)
    val glow = accent.copy(alpha = if (subtle) TileStyle.SUBTLE_GLOW_ALPHA else TileStyle.GLOW_ALPHA)
    val density = LocalDensity.current
    val radiusPx = with(density) { TileStyle.cellRadius(style).toPx() }
    val edgePx = with(density) { TileStyle.edge.toPx() }
    val glowPx = with(density) {
        if (subtle) 0f else TileStyle.glow.toPx()
    }

    Box(
        Modifier
            .matchParentSize()
            .drawBehind {
                val pill = highlight.rect
                if (pill.width <= 0f) return@drawBehind
                val travel = highlight.target.left - pill.left
                val stretch = TileMotion.stretch(travel, pill.width)
                val squash = TileMotion.squash(travel, pill.width, pill.height)
                // Przednia krawędź wysuwa się w stronę celu, tylna zostaje.
                val left = TileMotion.pillLeft(pill.left, travel, stretch)
                val top = pill.top + squash / 2f
                val width = pill.width + stretch
                val height = pill.height - squash

                if (glowPx > 0f) {
                    drawRoundRect(
                        color = glow,
                        topLeft = Offset(left - glowPx, top - glowPx),
                        size = Size(width + glowPx * 2f, height + glowPx * 2f),
                        cornerRadius = CornerRadius(radiusPx + glowPx),
                    )
                }
                drawRoundRect(
                    color = fill,
                    topLeft = Offset(left, top),
                    size = Size(width, height),
                    cornerRadius = CornerRadius(radiusPx),
                )
                drawRoundRect(
                    color = edge,
                    topLeft = Offset(left, top),
                    size = Size(width, height),
                    cornerRadius = CornerRadius(radiusPx),
                    style = Stroke(width = edgePx),
                )
            },
    )
}

/**
 * Treść kafelka „ciągnięta” przez płynącą pigułkę: w trakcie przelotu kafelki
 * jadą o kilka dp w stronę przeciwną do ruchu i wracają na miejsce. Odczyty
 * stanu w `graphicsLayer`, więc klatki animacji nie kosztują rekompozycji.
 */
fun Modifier.tileLag(
    highlight: TileHighlight?,
    grid: TileGrid,
    index: Int,
): Modifier {
    if (highlight == null || !grid.measured) return this
    return graphicsLayer {
        val maxPx = TileStyle.lagMax.toPx()
        translationX = TileMotion.lag(
            travelPx = highlight.travel,
            tileCenterPx = grid.centerOf(index),
            targetCenterPx = highlight.target.center.x,
            tileWidthPx = grid.tilePx,
            maxPx = maxPx,
        )
    }
}

/** Kolor treści kafelka — akcent dla wybranego, przygaszony dla pozostałych. */
@Composable
fun tileContentColor(selected: Boolean): Color =
    if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant

/**
 * Płynna zmiana koloru treści kafelka — krótka, żeby wybór „przeskakiwał”
 * razem z pigułką, a nie wyglądał na powolne wygaszanie.
 */
@Composable
fun animatedTileContentColor(selected: Boolean): Color {
    val target = tileContentColor(selected)
    val color by animateColorAsState(
        targetValue = target,
        animationSpec = tween(durationMillis = TileStyle.CONTENT_FADE_MS, easing = FastOutSlowInEasing),
        label = "tile-content",
    )
    return color
}

/**
 * Delikatne „nabrzmienie” wybranego kafelka — sprężyna zamiast skoku, żeby
 * zmiana widoku wyglądała jak ruch plamki światła, a nie przełączenie zakładki.
 */
@Composable
fun animatedTileScale(selected: Boolean): Float {
    val scale by animateFloatAsState(
        targetValue = if (selected) TileStyle.SELECTED_SCALE else 1f,
        animationSpec = spring(
            dampingRatio = 0.72f,
            stiffness = 220f,
        ),
        label = "tile-scale",
    )
    return scale
}
