// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ImportRowReport } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { ImportReportTable } from "./import-report-table";

afterEach(() => {
  cleanup();
});

function row(overrides: Partial<ImportRowReport>): ImportRowReport {
  return {
    line: 2,
    name: "Иванов Иван",
    club: "Сталь",
    outcome: "IMPORT_ROW_OUTCOME_CREATED",
    nominationTitles: ["Лонгсворд"],
    addedNominationIds: ["n1"],
    fighterId: "",
    error: "IMPORT_ROW_ERROR_UNSPECIFIED",
    errorDetail: "",
    ...overrides,
  };
}

function nomination(overrides: Partial<Nomination>): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Лонгсворд",
    description: "",
    fighterCapacity: null,
    metadata: { rulesUrl: "" },
    position: 0,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

const nominations = [
  nomination({ id: "n1", title: "Лонгсворд" }),
  nomination({ id: "n2", title: "Сабля" }),
];

describe("ImportReportTable (spec 0049, FR-3/FR-11a)", () => {
  it("shows the file line number as the admin sees it in an editor (FR-11a/AC-13)", () => {
    render(<ImportReportTable rows={[row({ line: 4 })]} nominations={nominations} />);

    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("renders each outcome with its own label (FR-3)", () => {
    render(
      <ImportReportTable
        rows={[
          row({ line: 2, name: "Новый", outcome: "IMPORT_ROW_OUTCOME_CREATED" }),
          row({ line: 3, name: "Дополненный", outcome: "IMPORT_ROW_OUTCOME_UPDATED" }),
          row({ line: 4, name: "Дубль", outcome: "IMPORT_ROW_OUTCOME_SKIPPED" }),
          row({
            line: 5,
            name: "",
            outcome: "IMPORT_ROW_OUTCOME_REJECTED",
            error: "IMPORT_ROW_ERROR_EMPTY_NAME",
          }),
        ]}
        nominations={nominations}
      />,
    );

    expect(screen.getByText("новый боец")).toBeInTheDocument();
    expect(screen.getByText("дополнение")).toBeInTheDocument();
    expect(screen.getByText("пропуск")).toBeInTheDocument();
    expect(screen.getByText("ошибка")).toBeInTheDocument();
  });

  it("spells out the rejection reason, with the unrecognised title itself (AC-3/AC-4/AC-12)", () => {
    render(
      <ImportReportTable
        rows={[
          row({
            line: 2,
            outcome: "IMPORT_ROW_OUTCOME_REJECTED",
            error: "IMPORT_ROW_ERROR_EMPTY_NAME",
          }),
          row({
            line: 3,
            outcome: "IMPORT_ROW_OUTCOME_REJECTED",
            error: "IMPORT_ROW_ERROR_UNKNOWN_NOMINATION",
            errorDetail: "Копьё",
            nominationTitles: ["Копьё"],
          }),
          row({
            line: 4,
            outcome: "IMPORT_ROW_OUTCOME_REJECTED",
            error: "IMPORT_ROW_ERROR_FIGHTER_WITHDRAWN",
          }),
        ]}
        nominations={nominations}
      />,
    );

    expect(screen.getByText("пустое имя")).toBeInTheDocument();
    expect(screen.getByText("неизвестная номинация: Копьё")).toBeInTheDocument();
    expect(screen.getByText("боец выведен с турнира")).toBeInTheDocument();
  });

  it("shows the nominations written in the file", () => {
    render(
      <ImportReportTable
        rows={[row({ nominationTitles: ["Лонгсворд", "Сабля"], addedNominationIds: ["n1", "n2"] })]}
        nominations={nominations}
      />,
    );

    expect(screen.getByText("Лонгсворд, Сабля")).toBeInTheDocument();
  });

  it("falls back to the nominations actually added when the file column was empty (FR-5a)", () => {
    render(
      <ImportReportTable
        rows={[row({ nominationTitles: [], addedNominationIds: ["n2"] })]}
        nominations={nominations}
      />,
    );

    expect(screen.getByText("Сабля")).toBeInTheDocument();
  });

  it("shows a dash for a fighter imported without any nominations (FR-5b/AC-14)", () => {
    render(
      <ImportReportTable
        rows={[row({ name: "Сидоров Сидор", nominationTitles: [], addedNominationIds: [] })]}
        nominations={nominations}
      />,
    );

    expect(screen.getByText("Сидоров Сидор")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows an empty state instead of a bare header when the file had no rows", () => {
    render(<ImportReportTable rows={[]} nominations={nominations} />);

    expect(screen.getByText(/нет строк/i)).toBeInTheDocument();
  });
});
