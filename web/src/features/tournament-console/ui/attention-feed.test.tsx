// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AttentionFeed } from "./attention-feed";
import type { ConsoleAlert } from "@/entities/tournament-console/lib/types";

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

describe("AttentionFeed (спека 0043, FR-14/FR-15)", () => {
  afterEach(() => {
    cleanup();
  });

  it("пустая лента — «сигналов нет», не ошибка", () => {
    render(<AttentionFeed alerts={[]} />);
    expect(screen.getByText("Всё в порядке — сигналов нет.")).toBeInTheDocument();
  });

  it("AC-10: ARENA_IDLE ведёт на страницу площадки", () => {
    render(
      <AttentionFeed alerts={[alert({ kind: "arena_idle", arenaId: "a1", arenaName: "Ристалище 1" })]} />,
    );
    expect(screen.getByText("Площадка простаивает")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/arenas/a1");
  });

  it("AC-12: BOUT_STUCK ведёт на страницу площадки", () => {
    render(<AttentionFeed alerts={[alert({ kind: "bout_stuck", arenaId: "a1" })]} />);
    expect(screen.getByText("Бой не завершён вовремя")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/arenas/a1");
  });

  it("POOL_NOT_STARTED ведёт на страницу площадки", () => {
    render(<AttentionFeed alerts={[alert({ kind: "pool_not_started", arenaId: "a2" })]} />);
    expect(screen.getByText("Пул стоит, но не начат")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/arenas/a2");
  });

  it("AC-13: POOL_DONE_NOT_UNSEATED ведёт на страницу площадки", () => {
    render(<AttentionFeed alerts={[alert({ kind: "pool_done_not_unseated", arenaId: "a3" })]} />);
    expect(screen.getByText("Пул доигран, площадка занята впустую")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/arenas/a3");
  });

  it("AC-14: NEXT_STAGE_NOT_BUILT ведёт на схему этапов номинации", () => {
    render(
      <AttentionFeed
        alerts={[alert({ kind: "next_stage_not_built", nominationId: "n1", nominationName: "Длинный меч" })]}
      />,
    );
    expect(screen.getByText("Следующий этап не сформирован")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/nominations/n1/stages");
  });

  it("NOMINATION_STALLED ведёт на схему этапов номинации", () => {
    render(<AttentionFeed alerts={[alert({ kind: "nomination_stalled", nominationId: "n2" })]} />);
    expect(screen.getByText("Номинация не двинулась")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/nominations/n2/stages");
  });

  it("несколько сигналов одновременно — все присутствуют", () => {
    render(
      <AttentionFeed
        alerts={[alert({ kind: "arena_idle", arenaId: "a1" }), alert({ kind: "nomination_stalled", nominationId: "n1" })]}
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
