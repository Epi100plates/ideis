package pl.matiit.planzajec.widget

/**
 * Wersja graficzna widżetu. Wybór jest **per instancja** — zapisywany przy
 * dodawaniu widżetu (albo przytrzymaniu go i wybraniu „Edytuj”), więc na jednym
 * pulpicie mogą stać obok siebie różne warianty.
 *
 * Identyfikatory trafiają do SharedPreferences, więc nie zmieniamy ich przy
 * porządkowaniu kodu.
 */
enum class WidgetLook(val id: String) {
    /** Szkło, ciepły akcent — obecny wygląd visionOS: godziny w dwóch liniach. */
    Vision("vision"),

    /** Płaski, cichy: monochromatyczne godziny w jednej kolumnie. */
    Minimal("minimal"),

    /** Kolorowy nagłówek i karty zajęć w odcieniu akcentu. */
    Accent("accent"),

    /** Pionowa oś czasu: punkt przy każdych zajęciach. */
    Timeline("timeline"),

    /** Kafelki jak w aplikacji: karta na zajęcia z paskiem koloru przedmiotu. */
    Tiles("tiles"),

    /**
     * Kompakt: jedno zajęcie = jedna linia (godziny · przedmiot · sala),
     * cienkie separatory. Najgęstszy wariant — dla małych widżetów.
     */
    Compact("compact"),

    /**
     * Szkło: półprzezroczysty panel, duża godzina, cienkie linie między
     * zajęciami i typ zajęć w plakietce. Najbardziej „systemowy” wygląd.
     */
    Glass("glass");

    companion object {
        val default: WidgetLook = Vision

        fun fromId(id: String?): WidgetLook =
            entries.firstOrNull { it.id == id } ?: default
    }
}
