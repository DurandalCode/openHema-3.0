// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TournamentSettingsForm } from "./tournament-settings-form";
import type { Tournament } from "@/entities/tournament/lib/types";

/**
 * Radix `Popover`/`Select` в jsdom требуют тех же полифиллов, что `Dialog`
 * (см. `shared/ui/dialog.test.tsx`).
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

const tournament: Tournament = {
  id: "t1",
  title: "Турнир",
  description: "",
  eventStartAt: "2026-08-12T00:00:00.000Z",
  eventEndAt: "",
  emblemUrl: "",
  isActive: true,
  contacts: [],
  createdAt: "",
  updatedAt: "",
};

const updateMutate = vi.fn();

vi.mock("../api/use-update-tournament", () => ({
  useUpdateTournament: () => ({ mutate: updateMutate, isPending: false, error: null }),
}));

describe("TournamentSettingsForm (AC-12)", () => {
  afterEach(() => {
    updateMutate.mockClear();
  });

  it("submits the ISO value picked via DateTimeField for the start date", () => {
    render(<TournamentSettingsForm tournament={tournament} />);

    // Кнопка-триггер поля связана с `<Label htmlFor>`, поэтому её доступное
    // имя — подпись поля ("Дата и время начала"), а не отображаемая дата.
    fireEvent.click(screen.getByRole("button", { name: "Дата и время начала" }));
    fireEvent.click(screen.getByRole("button", { name: "20" }));

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const input = updateMutate.mock.calls[0][0] as { eventStartAt: string | null };
    const submitted = new Date(input.eventStartAt as string);
    expect(submitted.getDate()).toBe(20);
  });

  it("submits null for the end date left empty (single-day tournament)", () => {
    render(<TournamentSettingsForm tournament={tournament} />);

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const input = updateMutate.mock.calls[0][0] as { eventEndAt: string | null };
    expect(input.eventEndAt).toBeNull();
  });
});
