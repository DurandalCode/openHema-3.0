"use client";

import { useLocalPreference } from "@/shared/hooks/use-local-preference";
import { cn } from "@/shared/lib/cn";

/** ScoreboardAppearance — собственная палитра табло (спека 0033, FR-31). */
export type ScoreboardAppearance = "dark" | "light";

/**
 * useScoreboardAppearance — обёртка над `useLocalPreference` (T10) с
 * фиксированным ключом на площадку (`scoreboard-appearance:<arenaId>`) и
 * дефолтом `"dark"` (спека 0033, FR-31/AC-18: «табло тёмное» до первого
 * переключения). Тема приложения (`next-themes`) здесь **не читается и не
 * пишется** — правило 0015 (NFR-1) остаётся в силе, это отдельная,
 * захардкоженная пара палитр только для этого экрана.
 */
export function useScoreboardAppearance(arenaId: string): [ScoreboardAppearance, () => void] {
  const [appearance, setAppearance] = useLocalPreference<ScoreboardAppearance>(
    `scoreboard-appearance:${arenaId}`,
    "dark",
  );

  function toggle() {
    setAppearance(appearance === "dark" ? "light" : "dark");
  }

  return [appearance, toggle];
}

/**
 * AppearanceToggle — единственный интерактивный элемент табло (FR-32): не
 * трогает ни доменное, ни живое состояние, только собственную палитру этого
 * экрана. Малозаметен в покое (низкая непрозрачность) и проявляется по
 * `hover:`/`focus-visible:` — чисто CSS, без ручного JS auto-hide таймера
 * (упрощение, сознательно допущенное спекой: «можно не реализовывать
 * пиксель-в-пиксель»). Доступен с клавиатуры (реальная `<button>`,
 * `aria-pressed`, видимый focus-ring).
 */
export function AppearanceToggle({ arenaId }: { arenaId: string }) {
  const [appearance, toggle] = useScoreboardAppearance(arenaId);
  const isLight = appearance === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isLight}
      aria-label={
        isLight ? "Переключить оформление табло на тёмное" : "Переключить оформление табло на светлое"
      }
      data-appearance={appearance}
      className={cn(
        "fixed right-4 top-4 z-10 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        "opacity-20 transition-opacity duration-300 hover:opacity-100 focus-visible:opacity-100",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        isLight
          ? "border-black/40 bg-white/70 text-black focus-visible:outline-black"
          : "border-white/40 bg-black/40 text-white focus-visible:outline-white",
      )}
    >
      {isLight ? "Тёмная тема" : "Светлая тема"}
    </button>
  );
}
