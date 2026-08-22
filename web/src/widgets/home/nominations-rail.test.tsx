// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NominationsRail } from "./nominations-rail";
import type { LiveNominationDto } from "@/entities/tournament-live/lib/types";

function nomination(overrides: Partial<LiveNominationDto> = {}): LiveNominationDto {
  return {
    nominationId: "n1",
    title: "Длинный меч",
    position: 0,
    phase: "upcoming",
    currentStageTitle: "",
    boutTotal: 0,
    boutFinished: 0,
    fighterCount: 0,
    ...overrides,
  };
}

describe("widgets/home NominationsRail (spec 0034, FR-20)", () => {
  afterEach(cleanup);

  it("renders nothing when there are no nominations", () => {
    const { container } = render(<NominationsRail nominations={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the "идёт"/"скоро"/"итоги" phase marks', () => {
    render(
      <NominationsRail
        nominations={[
          nomination({ nominationId: "a", title: "Идущая", phase: "running" }),
          nomination({ nominationId: "b", title: "Скоро", phase: "upcoming", position: 1 }),
          nomination({ nominationId: "c", title: "Итоги", phase: "finished", position: 2 }),
        ]}
      />,
    );
    expect(screen.getByText("идёт")).toBeInTheDocument();
    expect(screen.getByText("скоро")).toBeInTheDocument();
    expect(screen.getByText("итоги")).toBeInTheDocument();
  });

  it("orders rows by position", () => {
    const { container } = render(
      <NominationsRail
        nominations={[
          nomination({ nominationId: "b", title: "Вторая", position: 1 }),
          nomination({ nominationId: "a", title: "Первая", position: 0 }),
        ]}
      />,
    );
    const links = Array.from(container.querySelectorAll('a[href^="/nominations/"]'));
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/nominations/a",
      "/nominations/b",
    ]);
  });

  it("links each row to its public nomination page and shows the current stage caption", () => {
    render(
      <NominationsRail
        nominations={[nomination({ nominationId: "n1", currentStageTitle: "Плейофф 1/4", fighterCount: 24 })]}
      />,
    );
    const link = screen.getByRole("link", { name: /Длинный меч/ });
    expect(link).toHaveAttribute("href", "/nominations/n1");
    expect(screen.getByText("Плейофф 1/4 · 24 бойцов")).toBeInTheDocument();
  });

  it('links "Все номинации" to the given allNominationsHref', () => {
    render(<NominationsRail nominations={[nomination()]} allNominationsHref="/somewhere" />);
    expect(screen.getByRole("link", { name: "Все номинации" })).toHaveAttribute(
      "href",
      "/somewhere",
    );
  });
});
