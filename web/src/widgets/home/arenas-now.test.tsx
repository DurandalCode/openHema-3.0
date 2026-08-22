// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ArenasNow } from "./arenas-now";
import type { LiveArenaDto } from "@/entities/tournament-live/lib/types";

function arena(overrides: Partial<LiveArenaDto> = {}): LiveArenaDto {
  return {
    arenaId: "a1",
    arenaName: "Арена 1",
    position: 0,
    state: "free",
    nominationId: "",
    nominationName: "",
    poolName: "",
    stageTitle: "",
    currentBout: null,
    poolBoutTotal: 0,
    poolBoutFinished: 0,
    ...overrides,
  };
}

describe("widgets/home ArenasNow (spec 0034, FR-14)", () => {
  afterEach(cleanup);

  it("renders nothing when there are no arenas", () => {
    const { container } = render(<ArenasNow arenas={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("orders cards by position, not by input order", () => {
    const { container } = render(
      <ArenasNow
        arenas={[
          arena({ arenaId: "a2", arenaName: "Арена 2", position: 1 }),
          arena({ arenaId: "a1", arenaName: "Арена 1", position: 0 }),
        ]}
      />,
    );
    const titles = Array.from(container.querySelectorAll('[data-slot="card-title"]'));
    expect(titles.map((t) => t.textContent)).toEqual(["Арена 1", "Арена 2"]);
  });
});
