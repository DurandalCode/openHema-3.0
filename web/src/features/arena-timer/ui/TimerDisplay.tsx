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
 * TimerDisplay — крупные часы боя (спека 0015): подсветка последних <5.00с
 * (FR-19), визуальный индикатор на `EXPIRED` (стоп на 0 с сигналом, FR-9).
 * Read-only (FR-17) — нет обработчиков.
 */
export function TimerDisplay({ status, remainingCs }: { status: TimerStatus; remainingCs: number }) {
  const lowTime = remainingCs < 500 && status !== "EXPIRED";
  const expired = status === "EXPIRED";

  return (
    <div
      data-timer-status={status}
      data-low-time={lowTime || undefined}
      className={cn(
        "font-mono font-bold tabular-nums transition-colors",
        expired
          ? "animate-pulse text-destructive"
          : lowTime
            ? "animate-pulse text-7xl text-destructive sm:text-8xl"
            : "text-6xl text-foreground sm:text-7xl",
      )}
    >
      {formatTimerCs(remainingCs)}
    </div>
  );
}
