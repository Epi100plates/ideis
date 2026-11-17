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
import pl.matiit.planzajec.ui.theme.CustomColors

/**
 * Widżet „Dzień” — pojedynczy dzień (dziś lub najbliższy z zajęciami).
 *
 * Wygląd wybiera użytkownik przy dodawaniu (albo przytrzymaniu) widżetu —
 * patrz [WidgetLook] i [WidgetConfigActivity]. Kolory i tonacja idą za motywem
 * aplikacji, tak samo jak w widżecie tygodnia ([WidgetTheme]); wcześniej ten
 * widżet miał zaszyty visionOS i zawsze wyglądał ciemno.
 *
 * Treść jest przewijana ([WidgetScrollList]): lista pokazuje **wszystkie**
 * zajęcia dnia, także te poza krawędzią kafla. `SizeMode.Exact` daje widżetowi
 * dokładnie tyle miejsca, ile daje launcher, więc lista przewija się w obrębie
 * widżetu, a nie rozpycha go w dół.
 */
class DayScheduleWidget : GlanceAppWidget() {

    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repository = PlanGraph.repository(context)
        val target = repository.currentTarget()
        val group = target.groupId
        val stored = withContext(Dispatchers.IO) { repository.cachedPlan(target) }
        val settings = PlanGraph.settings(context)
        val styleId = settings.styleId
        val custom = CustomColors.normalize(settings.customPrimary, settings.customBackground)
        val notes = withContext(Dispatchers.IO) { PlanGraph.notes(context).cached() }
        val systemNight = WidgetNight.isNight(context)

        provideContent {
            val state = currentState<Preferences>()
            val night = state[WidgetNightKey] ?: systemNight
            // Model liczymy dopiero w kompozycji: zmiana dnia lub tonacji w stanie
            // Glance przerysowuje widok od razu, bez czekania na nową sesję.
            val model = DayWidgetModelBuilder.build(
                plan = stored?.plan,
                groupId = group,
                today = state.widgetToday(),
                nowMillis = System.currentTimeMillis(),
                savedAtMillis = stored?.savedAtMillis,
                zone = ZoneId.systemDefault(),
                notes = state.widgetNotes(notes),
            )
            DayWidgetContent(
                model = model,
                look = state.widgetLook(),
                // Styl ze stanu Glance — powód jak w widżecie tygodnia.
                colors = WidgetTheme.colors(
                    styleId = state.widgetStyle() ?: styleId,
                    night = night,
                    custom = state.widgetCustomColors(custom),
                ),
            )
        }
    }

    /**
     * Podgląd w systemowym okienku przypinania widżetu (a od Androida 15 także
     * w wyborze widżetów) — bez niego Glance rysuje pusty kafel.
     */
    override suspend fun providePreview(context: Context, widgetCategory: Int) {
        val night = WidgetNight.isNight(context)
        val settings = PlanGraph.settings(context)
        val colors = WidgetTheme.colors(
            styleId = settings.styleId,
            night = night,
            custom = CustomColors.normalize(settings.customPrimary, settings.customBackground),
        )
        provideContent {
            DayWidgetContent(
                model = WidgetPreview.dayModel(),
                look = WidgetLook.default,
                colors = colors,
            )
        }
    }
}

@Composable
internal fun DayWidgetContent(
    model: DayWidgetModel,
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
        val header: @Composable () -> Unit = {
            WidgetLookHeader(
                look = look,
                title = context.getString(R.string.widget_day_title),
                groupLabel = model.groupLabel,
                subtitle = model.updatedLabel?.let {
                    context.getString(R.string.widget_day_subtitle, model.dayLabel, it)
                } ?: model.dayLabel,
                colors = colors,
            )
        }

        if (model.isEmpty) {
            header()
            Spacer(GlanceModifier.height(6.dp))
            WidgetLookEmpty(context.getString(R.string.widget_day_empty), colors)
        } else {
            WidgetScrollList(
                items = WidgetScroll.dayItems(model.rows),
                look = look,
                colors = colors,
                compact = false,
                onClick = openApp,
                header = header,
            )
        }
    }
}

private fun launchIntent(context: Context): Intent =
    Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
