// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TimerSourceNote } from "./timer-source-note";
import type { ScoreboardRoomDto } from "@/entities/arena-live/lib/types";

function room(overrides: Partial<ScoreboardRoomDto> = {}): ScoreboardRoomDto {
  return {
    scoreboardCount: 0,
    thisOrdinal: 0,
    thisIsSource: false,
    sidesSwapped: false,
    revealGeneration: 0,
    ...overrides,
  };
}

const NOTE = "Табло не подключено — время идёт на этом экране";

describe("TimerSourceNote", () => {
  afterEach(cleanup);

  it("warns when this panel is the fallback source (no scoreboard connected)", () => {
    render(<TimerSourceNote room={room({ scoreboardCount: 0, thisIsSource: true })} />);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it("stays silent while a scoreboard holds the source", () => {
    render(<TimerSourceNote room={room({ scoreboardCount: 1, thisIsSource: false })} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("stays silent on a scoreboard that is itself the source", () => {
    render(<TimerSourceNote room={room({ scoreboardCount: 1, thisOrdinal: 1, thisIsSource: true })} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  // Снапшот-заглушка до первого живого кадра — {0, false}: молчим, иначе
  // подпись мигала бы на каждой загрузке страницы.
  it("stays silent on the pre-first-frame stub snapshot", () => {
    render(<TimerSourceNote room={room()} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("stays silent when there is no room yet at all", () => {
    render(<TimerSourceNote room={null} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
});
