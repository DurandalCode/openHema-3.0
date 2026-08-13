// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { EditApplicationDialog } from "./edit-application-dialog";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

const application: Application = {
  id: "a1",
  nominationId: "n1",
  tournamentId: "t1",
  applicantUserId: "u1",
  applicantDisplayName: "Иван Петров",
  state: "APPLICATION_STATE_PAID",
  club: "Клинок Севера",
  needsEquipment: false,
  createdAt: "2026-03-18T00:00:00.000Z",
  updatedAt: "2026-03-18T00:00:00.000Z",
};

const nominations: Nomination[] = [
  {
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
  },
];

const editMutate = vi.fn(
  (_vars: unknown, opts?: { onSuccess?: (application: Application) => void }) => {
    opts?.onSuccess?.(application);
  },
);
const editReset = vi.fn();

vi.mock("../api/use-edit-application", () => ({
  useEditApplication: () => ({
    mutate: editMutate,
    isPending: false,
    error: null,
    reset: editReset,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditApplicationDialog", () => {
  it("is a controlled component: no own trigger, renders content only when open=true", () => {
    const { rerender } = render(
      <EditApplicationDialog
        open={false}
        onOpenChange={vi.fn()}
        application={application}
        nominations={nominations}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Редактировать/ })).not.toBeInTheDocument();

    rerender(
      <EditApplicationDialog
        open
        onOpenChange={vi.fn()}
        application={application}
        nominations={nominations}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Правка заявки")).toBeInTheDocument();
  });

  it("saves and closes via onOpenChange(false) on success", () => {
    const onOpenChange = vi.fn();
    render(
      <EditApplicationDialog
        open
        onOpenChange={onOpenChange}
        application={application}
        nominations={nominations}
      />,
    );

    fireEvent.change(screen.getByLabelText("Клуб"), { target: { value: "Новый клуб" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(editMutate).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: "a1", club: "Новый клуб" }),
      expect.anything(),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
