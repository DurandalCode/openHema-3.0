"use client";

import { cn } from "@/shared/lib/cn";

export type ConsoleMode = "management" | "bout";

/**
 * ModeSwitch — переключатель режимов «Управление ареной» ⇄ «Ведение боя»
 * (спека 0033, FR-1/FR-3/FR-4): два равнозначных входа в панель (этот
 * переключатель и кнопка у текущего боя в `ManagementView`) ведут в одно
 * место, `onSelect("bout")`. Когда пул не стоит, вход в панель неактивен —
 * заблокированная кнопка объясняет причину через `title` (AC-3): «пул не
 * стоит — вести нечего».
 */
export function ModeSwitch({
  mode,
  canEnterBout,
  onSelect,
}: {
  mode: ConsoleMode;
  canEnterBout: boolean;
  onSelect: (mode: ConsoleMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Режим страницы площадки"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5"
    >
      <button
        type="button"
        aria-pressed={mode === "management"}
        onClick={() => onSelect("management")}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          mode === "management"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Управление ареной
      </button>
      <button
        type="button"
        aria-pressed={mode === "bout"}
        disabled={!canEnterBout}
        title={canEnterBout ? undefined : "Пул не стоит — вести нечего"}
        onClick={() => onSelect("bout")}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          !canEnterBout && "cursor-not-allowed opacity-50",
          mode === "bout"
            ? "bg-background text-foreground shadow-sm"
            : canEnterBout && "text-muted-foreground hover:text-foreground",
        )}
      >
        Ведение боя ⛶
      </button>
    </div>
  );
}
