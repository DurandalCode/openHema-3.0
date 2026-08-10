// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NominationResults } from "./nomination-results";
import type { NominationResults as NominationResultsDto } from "@/entities/nomination-results/lib/types";

const finishedBracket: NominationResultsDto["sections"][number] = {
  stageId: "stage-bracket",
  stageTitle: "Плейофф",
  stageType: "STAGE_TYPE_BRACKET",
  finished: true,
  placesFromOverallOrder: false,
  entries: [
    {
      placeFrom: 1,
      placeTo: 1,
      fighter: { fighterId: "f1", name: "Champion Fighter", club: "Sokol" },
      originLabel: "Чемпион",
    },
    {
      placeFrom: 2,
      placeTo: 2,
      fighter: { fighterId: "f2", name: "Runner Up", club: "Berkut" },
      originLabel: "Проигравший финала",
    },
    {
      placeFrom: 3,
      placeTo: 4,
      fighter: { fighterId: "f3", name: "Semifinal Loser A", club: "" },
      originLabel: "выбыл в 1/2 финала",
    },
    {
      placeFrom: 3,
      placeTo: 4,
      fighter: { fighterId: "f4", name: "Semifinal Loser B", club: "" },
      originLabel: "выбыл в 1/2 финала",
    },
    {
      placeFrom: 5,
      placeTo: 8,
      fighter: { fighterId: "f5", name: "Quarterfinal Loser", club: "" },
      originLabel: "выбыл в 1/4 финала",
    },
  ],
};

const unfinishedGroups: NominationResultsDto["sections"][number] = {
  stageId: "stage-groups",
  stageTitle: "Групповой этап",
  stageType: "STAGE_TYPE_GROUPS",
  finished: false,
  placesFromOverallOrder: false,
  entries: [],
};

describe("widgets/nomination-results NominationResults", () => {
  afterEach(cleanup);

  it("renders podium and full protocol for a finished section", () => {
    const results: NominationResultsDto = {
      nominationId: "n1",
      nominationFinished: true,
      sections: [finishedBracket],
    };
    render(<NominationResults results={results} />);

    // Champion/Runner Up: карточка пьедестала + строка полного протокола.
    expect(screen.getAllByText("Champion Fighter")).toHaveLength(2);
    expect(screen.getAllByText("Runner Up")).toHaveLength(2);
    // 3–4: обе строки диапазона попадают и в пьедестал, и в полный список.
    expect(screen.getAllByText("3–4")).toHaveLength(4);
    // Полный протокол включает и тех, кто не попал в пьедестал (только там).
    expect(screen.getAllByText("Quarterfinal Loser")).toHaveLength(1);
    expect(screen.getAllByText("5–8")).toHaveLength(1);
    expect(screen.getByText("выбыл в 1/4 финала")).toBeInTheDocument();
  });

  it("hides an unfinished section when showUnfinished is not passed", () => {
    const results: NominationResultsDto = {
      nominationId: "n1",
      nominationFinished: false,
      sections: [unfinishedGroups],
    };
    const { container } = render(<NominationResults results={results} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hides an unfinished section when showUnfinished is explicitly false", () => {
    const results: NominationResultsDto = {
      nominationId: "n1",
      nominationFinished: false,
      sections: [unfinishedGroups],
    };
    const { container } = render(<NominationResults results={results} showUnfinished={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an unfinished section marked as not finished when showUnfinished is true (FR-19)", () => {
    const results: NominationResultsDto = {
      nominationId: "n1",
      nominationFinished: false,
      sections: [unfinishedGroups],
    };
    render(<NominationResults results={results} showUnfinished />);
    expect(screen.getByText("Групповой этап")).toBeInTheDocument();
    expect(screen.getByText(/этап не доигран/i)).toBeInTheDocument();
  });

  it("shows the finished section together with the unfinished one under showUnfinished (AC-12)", () => {
    const results: NominationResultsDto = {
      nominationId: "n1",
      nominationFinished: false,
      sections: [finishedBracket, unfinishedGroups],
    };
    render(<NominationResults results={results} showUnfinished />);
    expect(screen.getAllByText("Champion Fighter").length).toBeGreaterThan(0);
    expect(screen.getByText(/этап не доигран/i)).toBeInTheDocument();
  });

  it("renders nothing for an unfinished nomination with no sections at all (AC-15)", () => {
    const results: NominationResultsDto = { nominationId: "n1", nominationFinished: false, sections: [] };
    const { container } = render(<NominationResults results={results} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a caveat when places come from the overall order across groups (FR-12)", () => {
    const results: NominationResultsDto = {
      nominationId: "n1",
      nominationFinished: true,
      sections: [{ ...finishedBracket, stageType: "STAGE_TYPE_GROUPS", placesFromOverallOrder: true }],
    };
    render(<NominationResults results={results} />);
    expect(screen.getByText(/без нормировки/i)).toBeInTheDocument();
  });
});
