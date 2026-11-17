package pl.matiit.planzajec.ui.components

import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import pl.matiit.planzajec.domain.ScheduleViews

/**
 * Próg gestu wspólny dla wszystkich widoków — tyle samo co w widoku dnia.
 * 32 dp zamiast 56 dp: przesunięcie na półtora kafelka musi wystarczyć, a nie
 * dopiero „przeciągnięcie na trzy czwarte ekranu”.
 *
 * Licznik rusza dopiero po pokonaniu systemowego „slopu” (~8 dp), więc realnie
 * palec musi przejechać ~40 dp — dlatego sam próg jest niższy, niż wynikałoby
 * to z odczucia „jak daleko trzeba przesunąć”.
 */
val PERIOD_SWIPE_THRESHOLD: Dp = 32.dp

/** Najkrótszy ruch, który w ogóle może zmienić okres (chroni przed drgnięciem palca). */
val PERIOD_SWIPE_MIN: Dp = 12.dp

/**
 * Prędkość pchnięcia, przy której wystarczy [PERIOD_SWIPE_MIN] zamiast progu
 * odległości. 600 dp/s to zwykły „pstryk” palcem — wcześniej taki gest
 * (szybki, ale krótki) był ignorowany i wyglądało to na zgubione przesunięcie.
 */
val PERIOD_SWIPE_VELOCITY: Dp = 600.dp

/**
 * Gest poziomy przenoszący między okresami widoku: palec w lewo → następny
 * okres, w prawo → poprzedni. Wspólny dla dnia, tygodnia, miesiąca i semestru,
 * żeby próg i kierunek były identyczne w całej aplikacji.
 *
 * Gest jest zaliczany **albo** po pokonaniu progu odległości, **albo** po
 * szybkim, krótkim pchnięciu — prędkość liczymy `VelocityTracker`em w trakcie
 * przeciągania. To odpowiada za „łapanie za każdym razem”: wcześniej liczyła się
 * tylko suma pikseli, więc krótki energiczny ruch przepadał.
 *
 * `onSwipe(true)` = kolejny okres. Elementy, które same przewijają się w poziomie
 * (siatka tygodnia), konsumują gest wcześniej — wtedy zmiana okresu nie następuje
 * i użytkownik może spokojnie przeciągać siatkę.
 */
@Composable
fun Modifier.periodSwipe(
    threshold: Dp = PERIOD_SWIPE_THRESHOLD,
    onSwipe: (forward: Boolean) -> Unit,
): Modifier {
    val density = LocalDensity.current
    val thresholdPx = with(density) { threshold.toPx() }
    val minPx = with(density) { PERIOD_SWIPE_MIN.toPx() }
    val velocityThresholdPx = with(density) { PERIOD_SWIPE_VELOCITY.toPx() }
    val currentOnSwipe by rememberUpdatedState(onSwipe)
    return pointerInput(thresholdPx, minPx, velocityThresholdPx) {
        var totalDrag = 0f
        val tracker = VelocityTracker()
        detectHorizontalDragGestures(
            onDragStart = {
                totalDrag = 0f
                // Próbki prędkości bierzemy wyłącznie z `change` (ten sam zegar
                // `uptimeMillis`); mieszanie z `nanoTime` psuło wyliczenia.
                tracker.resetTracking()
            },
            onHorizontalDrag = { change, dragAmount ->
                change.consume()
                totalDrag += dragAmount
                tracker.addPosition(change.uptimeMillis, change.position)
            },
            onDragCancel = {
                totalDrag = 0f
                tracker.resetTracking()
            },
            onDragEnd = {
                val velocityX = runCatching { tracker.calculateVelocity().x }.getOrDefault(0f)
                ScheduleViews.swipeForward(
                    deltaX = totalDrag,
                    thresholdPx = thresholdPx,
                    velocityPx = velocityX,
                    velocityThresholdPx = velocityThresholdPx,
                    minPx = minPx,
                )?.let(currentOnSwipe)
                totalDrag = 0f
                tracker.resetTracking()
            },
        )
    }
}
