package pl.matiit.planzajec.ui.theme

import android.view.Window
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.graphics.drawable.toDrawable
import androidx.core.view.WindowCompat

/** Aktualna paleta motywu — komponenty mogą z niej korzystać bezpośrednio. */
val LocalStylePalette = staticCompositionLocalOf { StyleCatalog.palette("lg2-dark", true) }

@Composable
fun PlanTheme(
    styleId: String?,
    systemDark: Boolean = isSystemInDarkTheme(),
    /** Dwa kolory motywu „Własny” — paletę liczy z nich `CustomTheme`. */
    customColors: CustomColors = CustomColors.DEFAULT,
    content: @Composable () -> Unit,
) {
    val palette = remember(styleId, systemDark, customColors) {
        StyleCatalog.palette(styleId, systemDark, customColors)
    }
    val colorScheme = remember(palette) { colorSchemeFor(palette) }

    CompositionLocalProvider(LocalStylePalette provides palette) {
        MaterialTheme(colorScheme = colorScheme, typography = Typography(), content = content)
    }
}

/**
 * Paski systemowe w kolorze tła i z ikonami dopasowanymi do jasności stylu —
 * wspólne dla ekranu planu i konfiguratora widżetu (jasny styl + białe ikony
 * były nieczytelne).
 */
@Composable
fun SystemBarsEffect(window: Window, palette: StylePalette) {
    val view = LocalView.current
    SideEffect {
        window.setBackgroundDrawable(palette.page.toArgb().toDrawable())
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = !palette.isDark
            isAppearanceLightNavigationBars = !palette.isDark
        }
    }
}

/**
 * Mapowanie palety stylu na role Material 3. Panele są mieszane z tłem, żeby
 * karty miały czytelny, stabilny kolor także bez prawdziwego backdrop-blur.
 */
private fun colorSchemeFor(p: StylePalette): ColorScheme {
    val panel = p.panel.compositeOver(p.page)
    val base = if (p.isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = p.accent,
        onPrimary = p.accentOn,
        primaryContainer = p.accentSoft,
        onPrimaryContainer = p.text,
        secondary = p.textSoft,
        onSecondary = p.page,
        secondaryContainer = panel,
        onSecondaryContainer = p.text,
        tertiary = p.accent,
        tertiaryContainer = p.accentSoft,
        onTertiaryContainer = p.text,
        background = p.page,
        onBackground = p.text,
        surface = p.panelSolid,
        onSurface = p.text,
        surfaceVariant = panel,
        onSurfaceVariant = p.textSoft,
        surfaceTint = p.accent,
        outline = p.edge,
        outlineVariant = p.edge.copy(alpha = p.edge.alpha * 0.5f),
        surfaceBright = panel,
        surfaceDim = p.page,
        surfaceContainerLowest = p.page,
        surfaceContainerLow = p.panelSolid,
        surfaceContainer = panel,
        surfaceContainerHigh = panel,
        surfaceContainerHighest = panel,
        error = if (p.isDark) Color(0xFFFFB4AB) else Color(0xFFB3261E),
        onError = if (p.isDark) Color(0xFF690005) else Color.White,
        errorContainer = if (p.isDark) Color(0xFF93000A) else Color(0xFFF9DEDC),
        onErrorContainer = if (p.isDark) Color(0xFFFFDAD6) else Color(0xFF410E0B),
        scrim = Color.Black,
    )
}
