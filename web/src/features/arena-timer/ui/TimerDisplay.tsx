import { cn } from "@/shared/lib/cn";
import type { TimerStatus } from "@/features/arena-timer/model/timer-authority";

/**
 * formatTimerCs — форматирует сантисекунды в `MM:SS.hh` (если есть минуты)
 * либо `SS.hh` (спека 0015, FR-10: точность до сотых секунды).
 */
export function formatTimerCs(remainingCs: number): string {
  const totalCs = Math.max(0, Math.round(remainingCs));
  const totalSeconds = Math.floor(totalCs / 100);
  const hundredths = totalCs % 100;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hundredths).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return minutes > 0 ? `${minutes}:${ss}.${hh}` : `${ss}.${hh}`;
}

/** TimerAlertKind — тревожная фаза, которую рисует `TimerDisplay` (спека 0033, AC-15). */
export type TimerAlertKind = "endgame" | "expired";

/**
 * TimerDisplay — часы боя (спека 0015). Read-only (FR-17) — нет обработчиков.
 *
 * `size="scoreboard"` — режим полноэкранного табло (NFR-1, «читаемость с
 * расстояния»): табло сознательно **исключение из дизайн-системы** —
 * не наследует тему (`dark:`/CSS-переменные), а держит фиксированный
 * максимальный контраст независимо от системной/локальной темы админа, плюс
 * кратно крупнее шрифт (табло крупнее счёта, AC-14). `size="panel"`
 * (по умолчанию) — обычный вид внутри админки, темизированный.
 *
 * `alert` (спека 0033, T18) — компонент больше **не решает сам**, когда
 * «мигать красным»: решение о фазе (`scoreboardPhase`,
 * `entities/arena-live/lib/scoreboard-phase.ts`, порог концовки `<5.00с`,
 * AC-15) считается снаружи и приходит готовым:
 * - `"endgame"` — последние <5с, отдельный янтарный акцент, отличный от
 *   истёкшего времени (AC-15);
 * - `"expired"` — время вышло, тревожный мигающий вид;
 * - `null` — явно «без тревоги» (например, фаза `"waiting"`/`"running"`).
 *
 * `alert === undefined` (проп не передан) — обратная совместимость для мест,
 * ещё не знающих о пяти фазах табло (`TimerControls` панели секретаря —
 * следующая join-волна спеки 0033): компонент вычисляет тревогу по старой
 * недифференцированной пороговой арифметике (`remainingCs < 500`), где
 * «концовка» и «истекло» визуально **не различаются** (как было исторически).
 *
 * `size="panel"` подстраивает шрифт под inline-size контейнера в
 * `TimerControls`: восемь символов `60:00.00` должны вмещаться и в колонку
 * 300 px, и в карточку управления при увеличенном масштабе браузера.
 * `size="strip"` (спека 0045, T4-fix) — компактный размер для мобильной
 * полосы `BoutTimerStrip`, без роста от `sm:`.
 */
export function TimerDisplay({
  status,
  remainingCs,
  size = "panel",
  alert,
}: {
  status: TimerStatus;
  remainingCs: number;
  size?: "panel" | "scoreboard" | "strip";
  alert?: TimerAlertKind | null;
}) {
  const lowTime = remainingCs < 500 && status !== "EXPIRED";
  const legacyAlertOn = status === "EXPIRED" || lowTime;

  // `alert !== undefined` — вызывающий явно посчитал фазу и передал решение;
  // приоритетнее локальной арифметики. Иначе — старое поведение: тревога
  // есть/нет одним флагом, без различения endgame/expired (визуально обе
  // сливаются в один и тот же "expired"-вид, как до T18).
  const kind: TimerAlertKind | null = alert !== undefined ? alert : legacyAlertOn ? "expired" : null;

  return (
    <div
      data-timer-status={status}
      data-low-time={lowTime || undefined}
      data-alert={kind ?? undefined}
      className={cn(
        "font-mono font-black tabular-nums transition-colors",
        size === "scoreboard"
          ? cn(
              "text-[7rem] leading-none sm:text-[10rem] lg:text-[13rem]",
              kind === "expired" && "motion-safe:animate-pulse text-red-500",
              kind === "endgame" && "text-amber-400",
              kind === null && "text-white",
            )
          : size === "strip"
            ? cn(
                "text-xl leading-none",
                kind === "expired" && "motion-safe:animate-pulse text-destructive",
                kind === "endgame" && "text-amber-500",
                kind === null && "text-foreground",
              )
            : cn(
                "max-w-full whitespace-nowrap text-[clamp(1rem,18cqw,3rem)] leading-none",
                kind === "expired" && "motion-safe:animate-pulse text-destructive",
                kind === "endgame" && "text-amber-500",
                kind === null && "text-foreground",
              ),
      )}
    >
      {formatTimerCs(remainingCs)}
    </div>
  );
}
