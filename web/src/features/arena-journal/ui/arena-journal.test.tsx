// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalEntryDto } from "@/entities/arena-live/lib/journal";
import { ArenaJournal } from "./arena-journal";

afterEach(() => {
  cleanup();
});

function entry(overrides: Partial<JournalEntryDto>): JournalEntryDto {
  return {
    boutId: "b1",
    sequenceNumber: 7,
    fighterA: { fighterId: "f1", name: "Ильин", club: "" },
    fighterB: { fighterId: "f2", name: "Дерюгин", club: "" },
    kind: "BOUT_EVENT_KIND_STARTED",
    scoreA: 0,
    scoreB: 0,
    occurredAt: "2026-08-15T14:12:40",
    actorDisplayName: "",
    ...overrides,
  };
}

let journalState: {
  data: JournalEntryDto[] | undefined;
  isLoading: boolean;
  error: Error | null;
} = { data: [], isLoading: false, error: null };

vi.mock("../api/use-arena-journal", () => ({
  useArenaJournal: () => journalState,
}));

beforeEach(() => {
  vi.clearAllMocks();
  journalState = { data: [], isLoading: false, error: null };
});

describe("ArenaJournal (спека 0033, FR-33/FR-35, AC-19/AC-20)", () => {
  it("AC-19: renders entries newest-first with time and author", () => {
    journalState.data = [
      entry({
        boutId: "b2",
        sequenceNumber: 7,
        kind: "BOUT_EVENT_KIND_STARTED",
        occurredAt: "2026-08-15T14:12:40",
        actorDisplayName: "",
      }),
      entry({
        boutId: "b1",
        sequenceNumber: 6,
        kind: "BOUT_EVENT_KIND_FINISHED",
        scoreA: 2,
        scoreB: 5,
        occurredAt: "2026-08-15T14:11:58",
        actorDisplayName: "Тихонов",
      }),
    ];

    render(<ArenaJournal arenaId="a1" />);

    // Порядок отдаёт хук (сервер уже отсортировал, компонент не пересортировывает).
    const rows = screen.getAllByText(/бой \d/);
    expect(rows[0]).toHaveTextContent("бой 7 начат");
    expect(rows[1]).toHaveTextContent("бой 6 завершён · Ильин 2 : 5 Дерюгин");
    expect(screen.getByText("14:12:40")).toBeInTheDocument();
    expect(screen.getByText("· Тихонов")).toBeInTheDocument();
  });

  it("AC-20: empty state explains records appear with the first bout action, without calling itself an arena journal", () => {
    journalState.data = [];

    render(<ArenaJournal arenaId="a1" />);

    expect(screen.getByText("Пока пусто")).toBeInTheDocument();
    expect(screen.getByText(/появятся здесь с первым действием по бою/)).toBeInTheDocument();
    expect(screen.queryByText(/журнал площадки/i)).not.toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    journalState = { data: undefined, isLoading: true, error: null };

    render(<ArenaJournal arenaId="a1" />);

    expect(screen.queryByTestId("arena-journal")).not.toBeInTheDocument();
  });

  it("shows the error message on load failure", () => {
    journalState = { data: undefined, isLoading: false, error: new Error("Ошибка запроса") };

    render(<ArenaJournal arenaId="a1" />);

    expect(screen.getByText("Ошибка запроса")).toBeInTheDocument();
  });
});
