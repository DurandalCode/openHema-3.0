// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TournamentSettingsForm, type TournamentSettingsFormProps } from "./tournament-settings-form";
import type { TournamentDraft } from "@/entities/tournament/lib/draft";
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
    program: [],
    notifications: { applicationState: false, poolSeated: false },
    ...overrides,
  };
}

// savedTournament (спека 0042, T39): по умолчанию без загруженных файлов —
// оба поля-переключателя «файл ⇄ ссылка» рендерятся в режиме ссылки, тем же
// поведением, что тестировалось до T39.
function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    title: "Турнир",
    description: "",
    eventStartAt: "",
    eventEndAt: "",
    emblemUrl: "",
    isActive: true,
    contacts: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    chiefJudge: "",
    regulationsUrl: "",
    venueName: "",
    venueAddress: "",
    entryFeeMinor: null,
    entryFeeCurrency: "",
    program: [],
    regulationsFile: { url: "", name: "", size: 0 },
    emblemFile: { url: "", name: "", size: 0 },
    notifications: { applicationState: false, poolSeated: false },
    ...overrides,
  };
}

function renderForm(overrides: Partial<TournamentSettingsFormProps> = {}) {
  return render(
    <TournamentSettingsForm
      value={draft()}
      onChange={vi.fn()}
      errors={{}}
      savedTournament={tournament()}
      onSavedTournamentChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("TournamentSettingsForm (spec 0029, controlled form)", () => {
  it("is a controlled component: typing calls onChange, not an internal mutation", () => {
    const onChange = vi.fn();
    renderForm({ onChange });

    fireEvent.change(screen.getByLabelText("Название *"), {
      target: { value: "Новое название" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Новое название" }),
    );
  });

  it("renders inline errors from props, wired to their fields", () => {
    renderForm({
      value: draft({ title: "" }),
      errors: { title: "Введите название турнира", eventEndAt: "Дата окончания не может быть раньше начала" },
    });

    expect(screen.getByText("Введите название турнира")).toBeInTheDocument();
    expect(
      screen.getByText("Дата окончания не может быть раньше начала"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Название *")).toHaveAttribute("aria-invalid", "true");
  });

  it("has no submit button — actions live in the page header", () => {
    renderForm();
    expect(screen.queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
  });

  it("shows a neutral placeholder for an empty emblem URL (AC-10)", () => {
    renderForm({ value: draft({ emblemUrl: "" }) });
    expect(screen.queryByRole("img", { name: "Эмблема турнира" })).not.toBeInTheDocument();
  });

  it("falls back to a neutral placeholder when the emblem URL fails to load (AC-10)", () => {
    renderForm({ value: draft({ emblemUrl: "https://example.com/broken.png" }) });

    const img = screen.getByRole("img", { name: "Эмблема турнира" });
    fireEvent.error(img);

    expect(screen.queryByRole("img", { name: "Эмблема турнира" })).not.toBeInTheDocument();
  });

  it("explains the contact rules next to the list (FR-14)", () => {
    renderForm();
    expect(screen.getByText(/пустые контакты не сохраняются/i)).toBeInTheDocument();
    expect(screen.getByText(/@handle/)).toBeInTheDocument();
  });

  // spec 0037 (T17): новые поля профиля турнира — судья, регламент, место,
  // взнос. Форма контролируемая: рендер + onChange, без своего сабмита.
  describe("new profile fields (spec 0037, FR-18)", () => {
    it("renders the chief judge field with its saved value", () => {
      renderForm({ value: draft({ chiefJudge: "Иванов И.И." }) });
      expect(screen.getByLabelText("Главный судья")).toHaveValue("Иванов И.И.");
    });

    it("calls onChange with chiefJudge on edit, preserving the rest of the draft", () => {
      const onChange = vi.fn();
      renderForm({ value: draft({ regulationsUrl: "https://cdn/rules.pdf" }), onChange });

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
      renderForm({ onChange });

      const input = screen.getByLabelText("Ссылка на регламент");
      expect(input).toHaveAttribute("type", "url");
      fireEvent.change(input, { target: { value: "https://cdn.example.com/rules.pdf" } });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ regulationsUrl: "https://cdn.example.com/rules.pdf" }),
      );
    });

    it("renders venue name and address fields and reports edits independently", () => {
      const onChange = vi.fn();
      renderForm({ value: draft({ venueAddress: "г. Москва, ул. Спортивная, 1" }), onChange });

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
      renderForm({ value: draft({ entryFeeCurrency: "RUB" }), onChange });

      fireEvent.change(screen.getByLabelText("Сумма взноса"), {
        target: { value: "1500" },
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ entryFeeAmount: "1500", entryFeeCurrency: "RUB" }),
      );
    });

    it("edits to the entry fee currency preserve the amount", () => {
      const onChange = vi.fn();
      renderForm({ value: draft({ entryFeeAmount: "1500" }), onChange });

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
      renderForm({
        value: draft({
          chiefJudge: "Иванов И.И.",
          regulationsUrl: "https://cdn/rules.pdf",
          venueName: "Дворец спорта",
          venueAddress: "г. Москва, ул. Спортивная, 1",
          entryFeeAmount: "1500",
          entryFeeCurrency: "RUB",
        }),
        onChange,
      });

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
        program: [],
        notifications: { applicationState: false, poolSeated: false },
      });
    });
  });

  // spec 0042 (T39): регламент/эмблема переключаются на карточку файла,
  // когда `savedTournament` несёт загруженный файл — поле ссылки в этом
  // режиме не рендерится (см. также `file-or-link-field.test.tsx` для
  // поведения самого компонента).
  describe("uploaded files switch the field to file mode (spec 0042, T39)", () => {
    it("shows the regulations file card instead of the URL input when a file is set", () => {
      renderForm({
        savedTournament: tournament({
          regulationsFile: { url: "/api/files/r1", name: "rules.pdf", size: 1024 },
        }),
      });

      expect(screen.getByText("rules.pdf")).toBeInTheDocument();
      expect(screen.queryByLabelText("Ссылка на регламент")).not.toBeInTheDocument();
    });

    it("shows the emblem preview from the uploaded file, not from emblemUrl", () => {
      renderForm({
        value: draft({ emblemUrl: "https://cdn.example.com/logo.png" }),
        savedTournament: tournament({
          emblemFile: { url: "/api/files/e1", name: "logo.png", size: 1024 },
        }),
      });

      expect(screen.getByRole("img", { name: "Эмблема турнира" })).toHaveAttribute(
        "src",
        "/api/files/e1",
      );
    });
  });

  // spec 0042 (T40): переключатели уведомлений — часть обычного
  // сохраняемого черновика формы, как chiefJudge.
  describe("notifications section (spec 0042, T40, FR-19)", () => {
    it("renders both toggles from the draft", () => {
      renderForm({
        value: draft({ notifications: { applicationState: true, poolSeated: false } }),
      });

      expect(
        screen.getByRole("checkbox", { name: "Уведомлять о состоянии заявок" }),
      ).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Уведомлять о постановке пула на площадку" }),
      ).not.toBeChecked();
    });

    it("calls onChange with the updated notifications, preserving the rest of the draft", () => {
      const onChange = vi.fn();
      renderForm({ value: draft({ chiefJudge: "Иванов И.И." }), onChange });

      fireEvent.click(screen.getByRole("checkbox", { name: "Уведомлять о состоянии заявок" }));

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          chiefJudge: "Иванов И.И.",
          notifications: { applicationState: true, poolSeated: false },
        }),
      );
    });
  });
});
