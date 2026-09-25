// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TimerDisplay, formatTimerCs } from "./TimerDisplay";

afterEach(() => {
  cleanup();
});

describe("formatTimerCs", () => {
  it("formats seconds and hundredths without minutes as SS.hh", () => {
    expect(formatTimerCs(530)).toBe("05.30"); // 5.30s
  });

  it("formats with minutes as M:SS.hh", () => {
    expect(formatTimerCs(7247)).toBe("1:12.47"); // 72.47s = 1:12.47
  });

  it("keeps both hundredths at the largest configured arena duration", () => {
    expect(formatTimerCs(360_000)).toBe("60:00.00");
  });

  it("clamps negative input to 00.00", () => {
    expect(formatTimerCs(-50)).toBe("00.00");
  });
});

describe("TimerDisplay", () => {
  it("renders the formatted time and exposes status via data attribute", () => {
    render(<TimerDisplay status="RUNNING" remainingCs={7247} />);
    expect(screen.getByText("1:12.47")).toBeInTheDocument();
    expect(screen.getByText("1:12.47")).toHaveAttribute("data-timer-status", "RUNNING");
  });

  it("marks low-time (<5.00s) via data attribute when not expired", () => {
    render(<TimerDisplay status="RUNNING" remainingCs={480} />);
    const el = screen.getByText("04.80");
    expect(el).toHaveAttribute("data-low-time", "true");
  });

  it("does not mark low-time when status is EXPIRED even at 0", () => {
    render(<TimerDisplay status="EXPIRED" remainingCs={0} />);
    const el = screen.getByText("00.00");
    expect(el).not.toHaveAttribute("data-low-time");
    expect(el).toHaveAttribute("data-timer-status", "EXPIRED");
  });

  it("does not mark low-time at/above the 5.00s threshold", () => {
    render(<TimerDisplay status="RUNNING" remainingCs={500} />);
    const el = screen.getByText("05.00");
    expect(el).not.toHaveAttribute("data-low-time");
  });

  it("size=scoreboard renders much larger, fixed white-on-black (design-system exception)", () => {
    render(<TimerDisplay status="RUNNING" remainingCs={9000} size="scoreboard" />);
    const el = screen.getByText("1:30.00");
    expect(el.className).toContain("text-white");
    expect(el.className).toMatch(/text-\[\d+rem\]/);
    expect(el.className).not.toContain("text-foreground");
  });

  it("size=scoreboard still turns red on low-time/expired", () => {
    render(<TimerDisplay status="EXPIRED" remainingCs={0} size="scoreboard" />);
    const el = screen.getByText("00.00");
    expect(el.className).toContain("text-red-500");
  });

  /**
   * size=strip (спека 0045, T4-fix): `BoutTimerStrip` — узкая горизонтальная
   * полоса на телефоне, а не отдельная колонка — размер `panel`
   * (`text-6xl`/`text-7xl`, рассчитан на десктопную колонку `TimerControls`)
   * переполнял строку по горизонтали на 390px (найдено ручной проверкой,
   * спека 0045 T16). `strip` — заметно компактнее `panel` и без `sm:`-роста.
   */
  it("size=strip renders a compact size that fits a horizontal strip", () => {
    render(<TimerDisplay status="RUNNING" remainingCs={9000} size="strip" />);
    const el = screen.getByText("1:30.00");
    expect(el.className).not.toMatch(/(?:^|\s)text-6xl(?:\s|$)/);
    expect(el.className).not.toMatch(/(?:^|\s)sm:text-7xl(?:\s|$)/);
    expect(el.className).toMatch(/(?:^|\s)text-(?:lg|xl|2xl)(?:\s|$)/);
  });

  it("size=strip still turns red/amber on expired/endgame", () => {
    render(<TimerDisplay status="EXPIRED" remainingCs={0} size="strip" alert="expired" />);
    const el = screen.getByText("00.00");
    expect(el.className).toContain("text-destructive");
  });

  // T18 (спека 0033): TimerDisplay больше не решает "мигать красным" сам —
  // решение приходит пропсом `alert`, посчитанным снаружи (scoreboardPhase).
  describe("alert prop (spec 0033, T18 — presentational, decision from outside)", () => {
    it("explicit alert='endgame' renders a distinct amber accent, not red", () => {
      render(<TimerDisplay status="RUNNING" remainingCs={9000} size="scoreboard" alert="endgame" />);
      const el = screen.getByText("1:30.00");
      expect(el.className).toContain("text-amber-400");
      expect(el.className).not.toContain("text-red-500");
      expect(el).toHaveAttribute("data-alert", "endgame");
    });

    it("explicit alert='expired' renders red with reduced-motion-safe pulse", () => {
      render(<TimerDisplay status="RUNNING" remainingCs={9000} size="scoreboard" alert="expired" />);
      const el = screen.getByText("1:30.00");
      expect(el.className).toContain("text-red-500");
      expect(el.className).toContain("motion-safe:animate-pulse");
      expect(el).toHaveAttribute("data-alert", "expired");
    });

    it("endgame and expired resolve to different CSS classes (AC-15)", () => {
      const { unmount } = render(
        <TimerDisplay status="RUNNING" remainingCs={9000} size="scoreboard" alert="endgame" />,
      );
      const endgameClass = screen.getByText("1:30.00").className;
      unmount();

      render(<TimerDisplay status="RUNNING" remainingCs={9000} size="scoreboard" alert="expired" />);
      const expiredClass = screen.getByText("1:30.00").className;

      expect(endgameClass).not.toBe(expiredClass);
    });

    it("explicit alert=null overrides the legacy threshold — no alert even when remainingCs is low", () => {
      render(<TimerDisplay status="RUNNING" remainingCs={0} size="scoreboard" alert={null} />);
      const el = screen.getByText("00.00");
      expect(el.className).toContain("text-white");
      expect(el.className).not.toContain("text-red-500");
      expect(el.className).not.toContain("text-amber-400");
      expect(el).not.toHaveAttribute("data-alert");
    });

    it("omitted alert (undefined) keeps the old undifferentiated behavior: endgame and expired look the same", () => {
      const { unmount } = render(<TimerDisplay status="RUNNING" remainingCs={480} size="scoreboard" />);
      const legacyLowTimeClass = screen.getByText("04.80").className;
      unmount();

      render(<TimerDisplay status="EXPIRED" remainingCs={0} size="scoreboard" />);
      const legacyExpiredClass = screen.getByText("00.00").className;

      // Both collapse to the same "expired"-styled bucket (red pulse) — no
      // amber ever appears when the caller hasn't opted into phase-aware alerts.
      expect(legacyLowTimeClass).toContain("text-red-500");
      expect(legacyExpiredClass).toContain("text-red-500");
      expect(legacyLowTimeClass).not.toContain("text-amber-400");
    });

    it("panel size also distinguishes endgame (amber) from expired (destructive pulse)", () => {
      const { unmount } = render(<TimerDisplay status="RUNNING" remainingCs={9000} alert="endgame" />);
      const el1 = screen.getByText("1:30.00");
      expect(el1.className).toContain("text-amber-500");
      unmount();

      render(<TimerDisplay status="RUNNING" remainingCs={9000} alert="expired" />);
      const el2 = screen.getByText("1:30.00");
      expect(el2.className).toContain("text-destructive");
      expect(el2.className).toContain("motion-safe:animate-pulse");
    });
  });
});
