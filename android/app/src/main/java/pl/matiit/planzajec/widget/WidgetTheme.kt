package pl.matiit.planzajec.widget

import java.time.LocalDate
import pl.matiit.planzajec.ui.theme.CustomColors
import pl.matiit.planzajec.ui.theme.StyleCatalog
import pl.matiit.planzajec.ui.theme.StylePalette

/**
 * Motyw widżetu = motyw aplikacji.
 *
 * Wcześniej każde miejsce liczyło kolory po swojemu: widżet „Tydzień” brał styl
 * wybrany w aplikacji, ale widżet „Dzień” i jego podglądy miały **zaszyty**
 * visionOS — dlatego na pulpicie zawsze wyglądały ciemno, niezależnie od
 * ustawień aplikacji. Teraz paletę rozwiązuje dokładnie ta jedna funkcja, więc
 * oba widżety, oba podglądy i konfigurator nie mogą się już rozjechać.
 *
 * Tonacja (`night`) pochodzi z systemu (patrz [WidgetNight]): motywy jawny
 * „jasny”/„ciemny” jej nie używają, a „Auto” rozwiązuje się na wariant systemu.
 *
 * Motyw „Własny” dostaje dwa kolory użytkownika ([CustomColors]) — bez nich
 * widżet nie umie policzyć palety, bo nie ma jej w katalogu.
 */
internal object WidgetTheme {

    /** Paleta stylu aplikacji dla podanej tonacji. */
    fun palette(
        styleId: String?,
        night: Boolean,
        custom: CustomColors = CustomColors.DEFAULT,
    ): StylePalette = StyleCatalog.palette(styleId, systemDark = night, custom = custom)

    /** Kolory widżetu wyliczone z palety aplikacji. */
    fun colors(
        styleId: String?,
        night: Boolean,
        custom: CustomColors = CustomColors.DEFAULT,
    ): WidgetColors = widgetColors(palette(styleId, night, custom))

    /**
     * Odcisk treści i wyglądu instancji: dzień, **styl aplikacji**, tonacja,
     * **kolory motywu własnego** i model.
     *
     * Styl musi być w odcisku obu widżetów: bez niego zmiana motywu w aplikacji
     * nie unieważniała widżetu „Dzień” i ten zostawał w starych kolorach.
     * Kolory motywu własnego też — zmiana samej barwy nie zmienia `styleId`,
     * więc bez nich widżet zostałby w starych kolorach do restartu procesu.
     * `WidgetLook` dokłada [WidgetUpdater] osobno (wygląd jest per kopia).
     */
    fun contentKey(
        today: LocalDate,
        styleId: String?,
        night: Boolean,
        modelFingerprint: String,
        custom: CustomColors = CustomColors.DEFAULT,
    ): String = "$today|${StyleCatalog.normalize(styleId)}|$night|${custom.fingerprint()}|$modelFingerprint"
}
