// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { AttentionFeedCompact } from "./attention-feed";
import { alertSummary } from "./alert-row";
import type { ConsoleAlert } from "@/entities/tournament-console/lib/types";

/**
 * Radix `Dialog`/`FocusScope` в jsdom требуют pointer-capture/scrollIntoView
 * полифиллов (см. `shared/ui/sheet.test.tsx`) — `AttentionFeedCompact`
 * раскрывается в `Sheet`.
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

function alert(overrides: Partial<ConsoleAlert>): ConsoleAlert {
  return {
    kind: "arena_idle",
    since: new Date(2026, 7, 29, 11, 50, 0).toISOString(),
    arenaId: "",
    arenaName: "",
    nominationId: "",
    nominationName: "",
    poolId: "",
    poolName: "",
    boutId: "",
    ...overrides,
  };
}

describe("AttentionFeedCompact (спека 0045, T11, FR-12/FR-13)", () => {
  afterEach(() => {
    cleanup();
  });

  it("пустая лента — «сигналов нет», без строки-триггера", () => {
    render(<AttentionFeedCompact alerts={[]} />);

    expect(screen.getByText("Всё в порядке — сигналов нет.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("показывает «ВНИМАНИЕ · N» и текст первого сигнала", () => {
    const alerts = [
      alert({ kind: "arena_idle", arenaId: "a1", arenaName: "Ристалище 1" }),
      alert({ kind: "nomination_stalled", nominationId: "n1", nominationName: "Длинный меч" }),
    ];
    render(<AttentionFeedCompact alerts={alerts} />);

    expect(screen.getByText("ВНИМАНИЕ · 2")).toBeInTheDocument();
    expect(screen.getByText(alertSummary(alerts[0]))).toBeInTheDocument();
    // Полная разметка строки (AlertRow) не дублируется в свёрнутом виде.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("AC-6: клик по ленте разворачивает список всех N сигналов через AlertRow", () => {
    const alerts = [
      alert({ kind: "arena_idle", arenaId: "a1", arenaName: "Ристалище 1" }),
      alert({ kind: "bout_stuck", arenaId: "a2", arenaName: "Ристалище 2" }),
      alert({ kind: "nomination_stalled", nominationId: "n1", nominationName: "Длинный меч" }),
    ];
    render(<AttentionFeedCompact alerts={alerts} />);

    fireEvent.click(screen.getByRole("button"));

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "/admin/arenas/a1");
    expect(links[1]).toHaveAttribute("href", "/admin/arenas/a2");
    expect(links[2]).toHaveAttribute("href", "/admin/nominations/n1/stages");
  });

  it("разворачивание работает и при единственном сигнале", () => {
    const alerts = [alert({ kind: "arena_idle", arenaId: "a1", arenaName: "Ристалище 1" })];
    render(<AttentionFeedCompact alerts={alerts} />);

    expect(screen.getByText("ВНИМАНИЕ · 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/arenas/a1");
  });
});
