package pl.matiit.planzajec.ui.theme

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Tło „aurora” jak w wersji web: gradient bazowy + kilka barwnych plam
 * radialnych. Rysowane raz i cache'owane (`drawWithCache`) — bez animacji,
 * bez rozmywania, więc przewijanie listy nie przemalowuje tła.
 *
 * Warianty „Wydajny” mają pustą listę plam i tylko gradient bazowy.
 */
@Composable
fun AuroraBackground(
    palette: StylePalette,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .drawWithCache {
                val width = size.width
                val height = size.height

                val base = Brush.linearGradient(
                    colors = palette.pageGradient,
                    start = Offset(0f, 0f),
                    end = Offset(width * 0.35f, height),
                )

                val blobs = palette.blobs.map { blob ->
                    Brush.radialGradient(
                        colors = listOf(
                            blob.color.copy(alpha = blob.alpha),
                            Color.Transparent,
                        ),
                        center = Offset(width * blob.centerX, height * blob.centerY),
                        radius = maxOf(width * blob.radiusX, height * blob.radiusY) / 2f,
                    )
                }

                onDrawBehind {
                    drawRect(base)
                    blobs.forEach { drawRect(it) }
                    // Delikatne przyciemnienie dołu, żeby dolne panele nie „uciekały”.
                    drawRect(
                        Brush.verticalGradient(
                            0.72f to Color.Transparent,
                            1f to Color.Black.copy(alpha = if (palette.isDark) 0.22f else 0.05f),
                        ),
                    )
                }
            },
    )
}
