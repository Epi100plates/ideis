package pl.matiit.planzajec.widget

/**
 * Przykładowa treść podglądu widżetu.
 *
 * Systemowe podglądy (okienko „przypnij widżet”, a od Androida 15 także wybór
 * widżetów) rysuje kod aplikacji. Glance nie ma domyślnej treści, więc bez
 * własnego podglądu launcher pokazuje pusty kafel. Zamiast rysować osobny
 * obrazek, przepuszczamy stałe dane przez te same komponenty co prawdziwy
 * widżet — miniatura nie rozjedzie się przy zmianie układu wariantów.
 *
 * Czysty Kotlin, więc treść podglądu jest testowana na JVM.
 */
internal object WidgetPreview {

    const val GROUP = "Ćw (gr. 2)"

    val rows: List<WidgetRow> = listOf(
        WidgetRow(
            start = "10:45",
            end = "12:15",
            subject = "Analiza matematyczna",
            form = "Ćw",
            room = "204",
            remote = false,
            minutes = 90,
            // Miniatura pokazuje też plakietkę notatki — inaczej nikt nie
            // dowiedziałby się z podglądu, że widżet ją rysuje.
            note = "Kolos",
        ),
        WidgetRow(
            start = "12:30",
            end = "14:00",
            subject = "Programowanie",
            form = "Wyk",
            room = null,
            remote = true,
            minutes = 90,
        ),
        WidgetRow(
            start = "14:15",
            end = "15:45",
            subject = "Algebra liniowa",
            form = "Ćw",
            room = "S55 27",
            remote = false,
            minutes = 90,
        ),
    )

    /**
     * Dwa dni po jednym zajęciu — miniatura pokazuje nagłówek, dwie etykiety dni
     * i dwie linie zajęć, czyli prawdziwy układ widżetu tygodnia.
     */
    fun weekModel(): WidgetModel = WidgetModel(
        groupLabel = GROUP,
        rangeLabel = "10.11–16.11",
        updatedLabel = null,
        days = listOf(
            WidgetDay(label = "Pon 10.11", rows = rows.take(1)),
            WidgetDay(label = "Wt 11.11", rows = rows.drop(1).take(1)),
        ),
    )

    fun dayModel(): DayWidgetModel = DayWidgetModel(
        groupLabel = GROUP,
        dayLabel = "Dziś · Sob 15.11",
        updatedLabel = "10.11 19:20",
        rows = rows,
    )
}
