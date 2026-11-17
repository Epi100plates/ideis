package pl.matiit.planzajec.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.currentState
import androidx.glance.layout.Spacer
import androidx.glance.layout.height
import java.time.ZoneId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import pl.matiit.planzajec.MainActivity
import pl.matiit.planzajec.R
import pl.matiit.planzajec.data.PlanGraph

/**
 * Widżet „plan na najbliższy tydzień”.
 *
 * Dane czytamy z cache na dysku w [provideGlance] (przed kompozycją), a model
 * budujemy w kompozycji — dzięki temu zmiana dnia w stanie Glance od razu
 * przelicza widok. Kolory pochodzą z wybranego stylu, a wersję graficzną
 * ([WidgetLook]) wybiera użytkownik osobno dla każdej instancji.
 *
 * Treść jest przewijana ([WidgetScrollList]): na liście są **wszystkie** dni
 * i wszystkie zajęcia z zakresu, a rozmiar widżetu decyduje tylko o tym, ile
 * linii widać bez przewijania. `SizeMode.Exact` daje widżetowi dokładnie tyle
 * miejsca, ile daje launcher, więc lista przewija się w obrębie kafla.
 */
class ScheduleWidget : GlanceAppWidget() {

    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repository = PlanGraph.repository(context)
        val target = repository.currentTarget()
        val group = target.groupId
        val stored = withContext(Dispatchers.IO) { repository.cachedPlan(target) }
        val styleId = PlanGraph.settings(context).styleId
        val systemNight = WidgetNight.isNight(context)

        provideContent {
            val state = currentState<Preferences>()
            val night = state[WidgetNightKey] ?: systemNight
            val model = WidgetModelBuilder.build(
                plan = stored?.plan,
                groupId = group,
                today = state.widgetToday(),
                nowMillis = System.currentTimeMillis(),
                savedAtMillis = stored?.savedAtMillis,
                zone = ZoneId.systemDefault(),
            )
            WidgetContent(
                model = model,
                look = state.widgetLook(),
                // Styl ze stanu: odczyt z pamięci raz w `provideGlance` zostawał
                // stary po zmianie motywu (sesja kompozycji Glance żyje dłużej).
                colors = WidgetTheme.colors(state.widgetStyle() ?: styleId, night),
            )
        }
    }

    /**
     * Podgląd w systemowym okienku przypinania widżetu (a od Androida 15 także
     * w wyborze widżetów). Glance nie rysuje podglądu sam — bez tej metody
     * launcher pokazywał pusty kafel.
     */
    override suspend fun providePreview(context: Context, widgetCategory: Int) {
        val night = WidgetNight.isNight(context)
        val colors = WidgetTheme.colors(PlanGraph.settings(context).styleId, night)
        provideContent {
            WidgetContent(
                model = WidgetPreview.weekModel(),
                look = WidgetLook.default,
                colors = colors,
            )
        }
    }
}

@Composable
internal fun WidgetContent(
    model: WidgetModel,
    look: WidgetLook,
    colors: WidgetColors,
) {
    val context = LocalContext.current
    val openApp = actionStartActivity(launchIntent(context))

    WidgetPanel(
        look = look,
        colors = colors,
        onClick = openApp,
    ) {
        val title = context.getString(R.string.widget_title)
        val subtitle = model.updatedLabel?.let {
            context.getString(R.string.widget_updated, model.rangeLabel, it)
        } ?: model.rangeLabel
        val header: @Composable () -> Unit = {
            WidgetLookHeader(
                look = look,
                title = title,
                groupLabel = model.groupLabel,
                subtitle = subtitle,
                colors = colors,
            )
        }

        if (model.isEmpty) {
            header()
            Spacer(GlanceModifier.height(6.dp))
            WidgetLookEmpty(context.getString(R.string.widget_empty), colors)
        } else {
            WidgetScrollList(
                items = WidgetScroll.weekItems(model.days),
                look = look,
                colors = colors,
                compact = true,
                onClick = openApp,
                header = header,
            )
        }
    }
}

private fun launchIntent(context: Context): Intent =
    Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
