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
    chiefJudge: "",
    regulationsUrl: "",
    venueName: "",
    venueAddress: "",
    entryFeeAmount: "",
    entryFeeCurrency: "",
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

  // spec 0037 (T17): новые поля профиля турнира — судья, регламент, место,
  // взнос. Форма контролируемая: рендер + onChange, без своего сабмита.
  describe("new profile fields (spec 0037, FR-18)", () => {
    it("renders the chief judge field with its saved value", () => {
      render(
        <TournamentSettingsForm
          value={draft({ chiefJudge: "Иванов И.И." })}
          onChange={vi.fn()}
          errors={{}}
        />,
      );
      expect(screen.getByLabelText("Главный судья")).toHaveValue("Иванов И.И.");
    });

    it("calls onChange with chiefJudge on edit, preserving the rest of the draft", () => {
      const onChange = vi.fn();
      render(
        <TournamentSettingsForm
          value={draft({ regulationsUrl: "https://cdn/rules.pdf" })}
          onChange={onChange}
          errors={{}}
        />,
      );

      fireEvent.change(screen.getByLabelText("Главный судья"), {
        target: { value: "Петров П.П." },
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          chiefJudge: "Петров П.П.",
          regulationsUrl: "https://cdn/rules.pdf",
        }),
      );
    });

    it("renders the regulations URL field and reports edits", () => {
      const onChange = vi.fn();
      render(<TournamentSettingsForm value={draft()} onChange={onChange} errors={{}} />);

      const input = screen.getByLabelText("Ссылка на регламент");
      expect(input).toHaveAttribute("type", "url");
      fireEvent.change(input, { target: { value: "https://cdn.example.com/rules.pdf" } });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ regulationsUrl: "https://cdn.example.com/rules.pdf" }),
      );
    });

    it("renders venue name and address fields and reports edits independently", () => {
      const onChange = vi.fn();
      render(
        <TournamentSettingsForm
          value={draft({ venueAddress: "г. Москва, ул. Спортивная, 1" })}
          onChange={onChange}
          errors={{}}
        />,
      );

      fireEvent.change(screen.getByLabelText("Название площадки"), {
        target: { value: "Дворец спорта" },
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          venueName: "Дворец спорта",
          venueAddress: "г. Москва, ул. Спортивная, 1",
        }),
      );
    });

    it("renders the entry fee amount and currency fields and reports edits", () => {
      const onChange = vi.fn();
      render(
        <TournamentSettingsForm
          value={draft({ entryFeeCurrency: "RUB" })}
          onChange={onChange}
          errors={{}}
        />,
      );

      fireEvent.change(screen.getByLabelText("Сумма взноса"), {
        target: { value: "1500" },
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ entryFeeAmount: "1500", entryFeeCurrency: "RUB" }),
      );
    });

    it("edits to the entry fee currency preserve the amount", () => {
      const onChange = vi.fn();
      render(
        <TournamentSettingsForm
          value={draft({ entryFeeAmount: "1500" })}
          onChange={onChange}
          errors={{}}
        />,
      );

      fireEvent.change(screen.getByLabelText("Валюта"), {
        target: { value: "EUR" },
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ entryFeeAmount: "1500", entryFeeCurrency: "EUR" }),
      );
    });

    // Регрессия, которую боится задача T17: сохранение из-за правки НЕсвязанного
    // поля (название) не должно терять уже введённые новые поля — форма
    // контролируемая, `onChange` всегда получает ПОЛНЫЙ черновик.
    it("does not drop already-filled new fields when an unrelated field changes (FR-22)", () => {
      const onChange = vi.fn();
      render(
        <TournamentSettingsForm
          value={draft({
            chiefJudge: "Иванов И.И.",
            regulationsUrl: "https://cdn/rules.pdf",
            venueName: "Дворец спорта",
            venueAddress: "г. Москва, ул. Спортивная, 1",
            entryFeeAmount: "1500",
            entryFeeCurrency: "RUB",
          })}
          onChange={onChange}
          errors={{}}
        />,
      );

      fireEvent.change(screen.getByLabelText("Название *"), {
        target: { value: "Новое название" },
      });

      expect(onChange).toHaveBeenCalledWith({
        title: "Новое название",
        description: "",
        emblemUrl: "",
        eventStartAt: "2026-08-12T00:00:00.000Z",
        eventEndAt: null,
        contacts: [],
        chiefJudge: "Иванов И.И.",
        regulationsUrl: "https://cdn/rules.pdf",
        venueName: "Дворец спорта",
        venueAddress: "г. Москва, ул. Спортивная, 1",
        entryFeeAmount: "1500",
        entryFeeCurrency: "RUB",
      });
    });
  });
});
