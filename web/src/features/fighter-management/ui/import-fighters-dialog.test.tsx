// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportReport } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { ImportFightersDialog } from "./import-fighters-dialog";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  if (!("ResizeObserver" in window)) {
    // @ts-expect-error - минимальный polyfill для jsdom (Checkbox использует radix use-size)
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => {
  cleanup();
});

type ImportVars = { file: File; dryRun: boolean; nominationIds?: string[] };
type MutateOpts = { onSuccess?: (report: ImportReport) => void; onError?: (e: Error) => void };

// Мутация импорта (спека 0049): отдаёт отчёт, который тест задаёт на каждый
// шаг — предпросмотр (dryRun: true) и запись (dryRun: false).
let nextReport: ImportReport | null = null;
let nextError: Error | null = null;
const importMutate = vi.fn((vars: ImportVars, opts?: MutateOpts) => {
  if (nextError) opts?.onError?.(nextError);
  else if (nextReport) opts?.onSuccess?.({ ...nextReport, dryRun: vars.dryRun });
});
const importReset = vi.fn();

vi.mock("../api/use-import-fighters", () => ({
  useImportFighters: () => ({
    mutate: importMutate,
    isPending: false,
    reset: importReset,
  }),
}));

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

function report(overrides: Partial<ImportReport> = {}): ImportReport {
  return {
    dryRun: true,
    summary: { rowsRead: 3, created: 2, updated: 1, skipped: 0, rejected: 0 },
    rows: [
      {
        line: 2,
        name: "Иванов Иван",
        club: "Сталь",
        outcome: "IMPORT_ROW_OUTCOME_CREATED",
        nominationTitles: ["Лонгсворд"],
        addedNominationIds: ["n1"],
        fighterId: "",
        error: "IMPORT_ROW_ERROR_UNSPECIFIED",
        errorDetail: "",
      },
    ],
    ...overrides,
  };
}

function csv(name = "roster.csv"): File {
  return new File(["имя;клуб;номинации\n"], name, { type: "text/csv" });
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

function pickFile(file = csv()): File {
  fireEvent.change(fileInput(), { target: { files: [file] } });
  return file;
}

function lastVars(): ImportVars {
  const calls = importMutate.mock.calls;
  return calls[calls.length - 1][0];
}

function renderDialog(onOpenChange = vi.fn()) {
  render(<ImportFightersDialog nominations={nominations} open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

describe("ImportFightersDialog (spec 0049, FR-2/FR-4/FR-5a/FR-11)", () => {
  beforeEach(() => {
    nextReport = report();
    nextError = null;
    vi.clearAllMocks();
  });

  describe("шаг 1 — выбор файла", () => {
    it("offers the template file and the default-nomination checkboxes (FR-11/FR-5a)", () => {
      renderDialog();

      expect(screen.getByRole("link", { name: /образец/i })).toHaveAttribute(
        "href",
        "/fighters-import-template.csv",
      );
      expect(screen.getByLabelText("Лонгсворд")).toBeInTheDocument();
      expect(screen.getByLabelText("Сабля")).toBeInTheDocument();
    });

    it("keeps the preview button disabled until a file is chosen", () => {
      renderDialog();

      expect(screen.getByRole("button", { name: "Проверить файл" })).toBeDisabled();

      pickFile();

      expect(screen.getByRole("button", { name: "Проверить файл" })).toBeEnabled();
    });

    it("previews with dryRun: true and the chosen default nominations (FR-2/AC-11)", () => {
      renderDialog();
      const file = pickFile();

      fireEvent.click(screen.getByLabelText("Лонгсворд"));
      fireEvent.click(screen.getByRole("button", { name: "Проверить файл" }));

      expect(importMutate).toHaveBeenCalledTimes(1);
      expect(lastVars()).toEqual({ file, dryRun: true, nominationIds: ["n1"] });
    });

    it("shows the error of a file-level failure and stays on step 1 (AC-10)", () => {
      nextError = new Error("файл слишком большой");
      renderDialog();
      pickFile();

      fireEvent.click(screen.getByRole("button", { name: "Проверить файл" }));

      expect(screen.getByText("файл слишком большой")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Проверить файл" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Импортировать" })).not.toBeInTheDocument();
    });
  });

  describe("шаг 2 — предпросмотр", () => {
    function toPreview() {
      const onOpenChange = renderDialog();
      const file = pickFile();
      fireEvent.click(screen.getByRole("button", { name: "Проверить файл" }));
      return { onOpenChange, file };
    }

    it("shows the FR-4 summary and the parsed rows, and says nothing is written yet (AC-2)", () => {
      toPreview();

      const summary = screen.getByTestId("import-summary");
      expect(summary).toHaveTextContent("Прочитано: 3");
      expect(summary).toHaveTextContent("Будет создано: 2");
      expect(summary).toHaveTextContent("Дополнено: 1");
      expect(summary).toHaveTextContent("Пропущено: 0");
      expect(summary).toHaveTextContent("Отклонено: 0");
      expect(screen.getByText("Иванов Иван")).toBeInTheDocument();
    });

    it("imports the same file with dryRun: false on «Импортировать» (FR-2)", () => {
      const { file } = toPreview();
      importMutate.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Импортировать" }));

      expect(importMutate).toHaveBeenCalledTimes(1);
      expect(lastVars()).toEqual({ file, dryRun: false, nominationIds: [] });
    });

    it("goes back to the file step without importing", () => {
      toPreview();
      importMutate.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Назад" }));

      expect(screen.getByRole("button", { name: "Проверить файл" })).toBeInTheDocument();
      expect(importMutate).not.toHaveBeenCalled();
    });
  });

  describe("шаг 3 — отчёт", () => {
    function toReport() {
      const onOpenChange = renderDialog();
      pickFile();
      fireEvent.click(screen.getByRole("button", { name: "Проверить файл" }));
      nextReport = report({
        summary: { rowsRead: 3, created: 2, updated: 1, skipped: 0, rejected: 0 },
      });
      fireEvent.click(screen.getByRole("button", { name: "Импортировать" }));
      return onOpenChange;
    }

    it("switches to the written report: no «Импортировать» twice (NFR-4/FR-10)", () => {
      toReport();

      expect(screen.queryByRole("button", { name: "Импортировать" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Готово" })).toBeInTheDocument();
      const summary = screen.getByTestId("import-summary");
      expect(summary).toHaveTextContent("Создано: 2");
      expect(summary).toHaveTextContent("Дополнено: 1");
    });

    it("closes the dialog on «Готово»", () => {
      const onOpenChange = toReport();

      fireEvent.click(screen.getByRole("button", { name: "Готово" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
