// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TournamentSettingsForm } from "./tournament-settings-form";
import type { TournamentDraft } from "@/entities/tournament/lib/draft";

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

function draft(overrides: Partial<TournamentDraft> = {}): TournamentDraft {
  return {
    title: "Турнир",
    description: "",
    emblemUrl: "",
    eventStartAt: "2026-08-12T00:00:00.000Z",
    eventEndAt: null,
    contacts: [],
    ...overrides,
  };
}

describe("TournamentSettingsForm (spec 0029, controlled form)", () => {
  it("is a controlled component: typing calls onChange, not an internal mutation", () => {
    const onChange = vi.fn();
    render(<TournamentSettingsForm value={draft()} onChange={onChange} errors={{}} />);

    fireEvent.change(screen.getByLabelText("Название *"), {
      target: { value: "Новое название" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Новое название" }),
    );
  });

  it("renders inline errors from props, wired to their fields", () => {
    render(
      <TournamentSettingsForm
        value={draft({ title: "" })}
        onChange={vi.fn()}
        errors={{ title: "Введите название турнира", eventEndAt: "Дата окончания не может быть раньше начала" }}
      />,
    );

    expect(screen.getByText("Введите название турнира")).toBeInTheDocument();
    expect(
      screen.getByText("Дата окончания не может быть раньше начала"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Название *")).toHaveAttribute("aria-invalid", "true");
  });

  it("has no submit button — actions live in the page header", () => {
    render(<TournamentSettingsForm value={draft()} onChange={vi.fn()} errors={{}} />);
    expect(screen.queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
  });

  it("shows a neutral placeholder for an empty emblem URL (AC-10)", () => {
    render(<TournamentSettingsForm value={draft({ emblemUrl: "" })} onChange={vi.fn()} errors={{}} />);
    expect(screen.queryByRole("img", { name: "Эмблема турнира" })).not.toBeInTheDocument();
  });

  it("falls back to a neutral placeholder when the emblem URL fails to load (AC-10)", () => {
    render(
      <TournamentSettingsForm
        value={draft({ emblemUrl: "https://example.com/broken.png" })}
        onChange={vi.fn()}
        errors={{}}
      />,
    );

    const img = screen.getByRole("img", { name: "Эмблема турнира" });
    fireEvent.error(img);

    expect(screen.queryByRole("img", { name: "Эмблема турнира" })).not.toBeInTheDocument();
  });

  it("explains the contact rules next to the list (FR-14)", () => {
    render(<TournamentSettingsForm value={draft()} onChange={vi.fn()} errors={{}} />);
    expect(screen.getByText(/пустые контакты не сохраняются/i)).toBeInTheDocument();
    expect(screen.getByText(/@handle/)).toBeInTheDocument();
  });
});
