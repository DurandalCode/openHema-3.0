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

/**
 * TimerDisplay — часы боя (спека 0015): подсветка последних <5.00с (FR-19),
 * визуальный индикатор на `EXPIRED` (стоп на 0 с сигналом, FR-9). Read-only
 * (FR-17) — нет обработчиков.
 *
 * `size="scoreboard"` — режим полноэкранного табло (NFR-1, «читаемость с
 * расстояния»): табло сознательно **исключение из дизайн-системы** —
 * не наследует тему (`dark:`/CSS-переменные), а держит фиксированный
 * максимальный контраст (белый на чёрном) независимо от системной/локальной
 * темы админа, плюс кратно крупнее шрифт. `size="panel"` (по умолчанию) —
 * обычный вид внутри админки, темизированный, без изменений.
 */
export function TimerDisplay({
  status,
  remainingCs,
  size = "panel",
}: {
  status: TimerStatus;
  remainingCs: number;
  size?: "panel" | "scoreboard";
}) {
  const lowTime = remainingCs < 500 && status !== "EXPIRED";
  const expired = status === "EXPIRED";
  const alert = expired || lowTime;

  return (
    <div
      data-timer-status={status}
      data-low-time={lowTime || undefined}
      className={cn(
        "font-mono font-black tabular-nums transition-colors",
        size === "scoreboard"
          ? cn(
              "text-[5rem] leading-none sm:text-[8rem] lg:text-[10rem]",
              alert ? "animate-pulse text-red-500" : "text-white",
            )
          : cn(
              "text-6xl sm:text-7xl",
              alert ? "animate-pulse text-destructive" : "text-foreground",
            ),
      )}
    >
      {formatTimerCs(remainingCs)}
    </div>
  );
}
