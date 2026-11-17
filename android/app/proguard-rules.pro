# Zasady R8 dla wydania.

# Glance: odbiornik i definicja widżetu są tworzone przez system.
-keep class pl.matiit.planzajec.widget.** { *; }
-keep class * extends androidx.glance.appwidget.GlanceAppWidgetReceiver { *; }
-keep class * extends androidx.glance.appwidget.GlanceAppWidget { *; }

# kotlinx.serialization: serializatory generowane przez wtyczkę.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class pl.matiit.planzajec.data.model.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclasseswithmembers class pl.matiit.planzajec.data.model.** {
    kotlinx.serialization.KSerializer serializer(...);
}
