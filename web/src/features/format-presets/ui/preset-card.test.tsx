// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PresetCard } from "./preset-card";
import type { FormatPreset } from "@/entities/stage/lib/types";

const groupsSpec = {
  title: "Группы",
  type: "STAGE_TYPE_GROUPS" as const,
  bracket: { size: 0, thirdPlace: false },
  groups: { groupCount: 4 },
  sourceKind: "STAGE_SOURCE_KIND_UNSPECIFIED" as const,
  sourceIndex: -1,
  selector: "STAGE_SELECTOR_KIND_UNSPECIFIED" as const,
  placeFrom: 0,
  placeTo: 0,
  method: "STAGE_LAYOUT_METHOD_UNSPECIFIED" as const,
};

const bracketSpec = {
  title: "Плейофф",
  type: "STAGE_TYPE_BRACKET" as const,
  bracket: { size: 8, thirdPlace: false },
  groups: { groupCount: 0 },
  sourceKind: "STAGE_SOURCE_KIND_STAGE" as const,
  sourceIndex: 0,
  selector: "STAGE_SELECTOR_KIND_GROUP_PLACES" as const,
  placeFrom: 1,
  placeTo: 2,
  method: "STAGE_LAYOUT_METHOD_SEEDED" as const,
};

const preset: FormatPreset = {
  id: "p1",
  name: "Классика: 4 группы → сетка 8",
  stages: [groupsSpec, bracketSpec],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
};

describe("PresetCard", () => {
  afterEach(() => cleanup());

  it("shows the name, the schema summary and the relative update date", () => {
    render(<PresetCard preset={preset} onRename={vi.fn()} onDelete={vi.fn()} now={new Date("2026-08-14T00:00:00.000Z")} />);

    expect(screen.getByText("Классика: 4 группы → сетка 8")).toBeInTheDocument();
    expect(screen.getByText("Группы (4) → Сетка (8)")).toBeInTheDocument();
    expect(screen.getByText(/обновлён/i)).toHaveTextContent("обновлён 2 дня назад");
  });

  it("renders both labeled action buttons, delete as destructive", () => {
    render(<PresetCard preset={preset} onRename={vi.fn()} onDelete={vi.fn()} />);

    const renameBtn = screen.getByRole("button", { name: "Переименовать" });
    const deleteBtn = screen.getByRole("button", { name: "Удалить" });
    expect(renameBtn).toBeInTheDocument();
    expect(deleteBtn).toBeInTheDocument();
    expect(deleteBtn).toHaveAttribute("data-variant", "destructive");
  });

  it("calls onRename/onDelete when the respective button is clicked", () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(<PresetCard preset={preset} onRename={onRename} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "Переименовать" }));
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
