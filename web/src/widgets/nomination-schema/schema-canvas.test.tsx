// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SchemaCanvas } from "./schema-canvas";
import type { Stage } from "@/entities/stage/lib/types";

afterEach(() => {
  cleanup();
});

const groupsStage: Stage = {
  id: "s1",
  nominationId: "n1",
  position: 0,
  title: "Групповой этап",
  type: "STAGE_TYPE_GROUPS",
  status: "POOL_LAYOUT_STATUS_READY",
  bracket: null,
  groups: { groupCount: 4 },
  rule: null,
  executionStatus: "STAGE_STATUS_UNSPECIFIED",
};

const bracketStage: Stage = {
  id: "s2",
  nominationId: "n1",
  position: 1,
  title: "Плейофф",
  type: "STAGE_TYPE_BRACKET",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: { size: 8, thirdPlace: true },
  groups: null,
  rule: null,
  executionStatus: "STAGE_STATUS_UNSPECIFIED",
};

const parallelBracketStage: Stage = {
  ...bracketStage,
  id: "s3",
  title: "Утешительная сетка",
};

function renderCanvas(stages: Stage[], onCreateStage = vi.fn()) {
  render(
    <SchemaCanvas
      stages={stages}
      issues={[]}
      nominationId="n1"
      onInspect={vi.fn()}
      onDelete={vi.fn()}
      onCreateStage={onCreateStage}
    />,
  );
  return { onCreateStage };
}

describe("SchemaCanvas (спека 0031, FR-8/FR-17/FR-30, AC-5/AC-18)", () => {
  it("labels each level 'Уровень N' (AC-5)", () => {
    renderCanvas([groupsStage, bracketStage]);
    expect(screen.getByText("Уровень 1")).toBeInTheDocument();
    expect(screen.getByText("Уровень 2")).toBeInTheDocument();
  });

  it("keeps parallel branches of the same level in one row", () => {
    renderCanvas([groupsStage, bracketStage, parallelBracketStage]);
    // both bracket stages share position 1 → same level, only one "Уровень 2" label
    expect(screen.getAllByText("Уровень 2")).toHaveLength(1);
    expect(screen.getByText("Плейофф")).toBeInTheDocument();
    expect(screen.getByText("Утешительная сетка")).toBeInTheDocument();
  });

  it("always renders the empty drop zone with '+ Группы'/'+ Плейофф' buttons (FR-17)", () => {
    renderCanvas([groupsStage, bracketStage]);
    expect(screen.getByRole("button", { name: "+ Группы" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Плейофф" })).toBeInTheDocument();
  });

  it("shows the drop-zone hint and buttons even when the schema is entirely empty (AC-18)", () => {
    renderCanvas([]);
    expect(
      screen.getByText(/Перетащите сюда.*Группы.*Плейофф/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Группы" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Плейофф" })).toBeInTheDocument();
    expect(screen.queryByText("Этапов ещё нет.")).not.toBeInTheDocument();
  });

  it("'+ Группы' calls onCreateStage('groups')", () => {
    const { onCreateStage } = renderCanvas([]);
    fireEvent.click(screen.getByRole("button", { name: "+ Группы" }));
    expect(onCreateStage).toHaveBeenCalledWith("groups");
  });

  it("'+ Плейофф' calls onCreateStage('bracket')", () => {
    const { onCreateStage } = renderCanvas([]);
    fireEvent.click(screen.getByRole("button", { name: "+ Плейофф" }));
    expect(onCreateStage).toHaveBeenCalledWith("bracket");
  });
});
