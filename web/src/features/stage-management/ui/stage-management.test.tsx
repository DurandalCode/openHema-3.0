// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StageManagement } from "./stage-management";
import type { Stage } from "@/entities/stage/lib/types";

const groupsStage: Stage = {
  id: "s1",
  nominationId: "n1",
  position: 0,
  title: "Групповой этап",
  type: "STAGE_TYPE_GROUPS",
  status: "POOL_LAYOUT_STATUS_READY",
  bracket: null,
};

const bracketStage: Stage = {
  id: "s2",
  nominationId: "n1",
  position: 1,
  title: "Плейофф",
  type: "STAGE_TYPE_BRACKET",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: { size: 8, thirdPlace: true },
};

const deleteMutate = vi.fn();
const createMutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
let stagesData: Stage[] = [groupsStage, bracketStage];
let deleteError: Error | null = null;
let createError: Error | null = null;

vi.mock("../api/use-stages", () => ({
  useStages: () => ({ data: stagesData, isLoading: false, error: null }),
}));
vi.mock("../api/use-delete-stage", () => ({
  useDeleteStage: () => ({ mutate: deleteMutate, isPending: false, error: deleteError }),
}));
vi.mock("../api/use-create-stage", () => ({
  useCreateStage: () => ({
    mutate: createMutate,
    isPending: false,
    error: createError,
    reset: vi.fn(),
  }),
}));

describe("StageManagement", () => {
  beforeEach(() => {
    stagesData = [groupsStage, bracketStage];
    deleteError = null;
    createError = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders stage cards with title, type and status", () => {
    render(<StageManagement nominationId="n1" />);
    expect(screen.getByText("Групповой этап")).toBeInTheDocument();
    expect(screen.getByText("Плейофф")).toBeInTheDocument();
    expect(screen.getByText("группы")).toBeInTheDocument();
    expect(screen.getByText("сетка")).toBeInTheDocument();
  });

  it("shows a delete button only for the bracket stage (AC-14: groups is not deletable)", () => {
    render(<StageManagement nominationId="n1" />);
    expect(screen.queryByLabelText("Удалить Групповой этап")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Удалить Плейофф")).toBeInTheDocument();
  });

  it("deleting the bracket stage calls the mutation with its id", () => {
    render(<StageManagement nominationId="n1" />);
    fireEvent.click(screen.getByLabelText("Удалить Плейофф"));
    expect(deleteMutate).toHaveBeenCalledWith("s2");
  });

  it("shows the server error when deletion is rejected", () => {
    deleteError = new Error("stage is not deletable");
    render(<StageManagement nominationId="n1" />);
    expect(screen.getByText("stage is not deletable")).toBeInTheDocument();
  });

  it("creating a stage opens the dialog and submits the form with default size 8", () => {
    render(<StageManagement nominationId="n1" />);

    fireEvent.click(screen.getByRole("button", { name: /Добавить этап/i }));
    const titleInput = screen.getByLabelText("Название");
    fireEvent.change(titleInput, { target: { value: "Плейофф 16" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Создать" }));

    expect(createMutate).toHaveBeenCalledWith(
      { title: "Плейофф 16", bracketSize: 8, thirdPlace: true },
      expect.anything(),
    );
  });

  it("shows the server error when creation is rejected", () => {
    createError = new Error("bracket size must be a power of two");
    render(<StageManagement nominationId="n1" />);
    fireEvent.click(screen.getByRole("button", { name: /Добавить этап/i }));
    expect(screen.getByText("bracket size must be a power of two")).toBeInTheDocument();
  });
});
