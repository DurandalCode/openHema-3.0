// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tournament } from "@/entities/tournament/lib/types";
import { useUnsavedGuardStore } from "@/shared/lib/unsaved-guard-store";
import { TournamentScreen } from "./tournament-screen";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    title: "Клинок Севера 2026",
    description: "Ежегодный турнир",
    eventStartAt: "2026-12-01T10:00:00.000Z",
    eventEndAt: "2026-12-03T18:00:00.000Z",
    emblemUrl: "",
    isActive: true,
    contacts: [{ id: "c1", type: "CONTACT_TYPE_TELEGRAM", value: "@org" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: new Date().toISOString(),
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

type MutateOpts = {
  onSuccess?: (t: Tournament) => void;
  onError?: (e: Error) => void;
};

let updateResult: { ok: true; tournament: Tournament } | { ok: false; error: string } = {
  ok: true,
  tournament: tournament(),
};
const updateMutate = vi.fn((_input: unknown, opts?: MutateOpts) => {
  if (updateResult.ok) opts?.onSuccess?.(updateResult.tournament);
  else opts?.onError?.(new Error(updateResult.error));
});
let updatePending = false;

vi.mock("../api/use-update-tournament", () => ({
  useUpdateTournament: () => ({ mutate: updateMutate, isPending: updatePending }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  updatePending = false;
  updateResult = { ok: true, tournament: tournament() };
  useUnsavedGuardStore.setState({ dirtyReason: null, pendingHref: null });
});

describe("TournamentScreen (spec 0029)", () => {
  it("fills the section header: crumb, title, and last-change status (AC-1)", () => {
    render(<TournamentScreen tournament={tournament()} />);

    const header = document.querySelector('[data-slot="page-header"]') as HTMLElement;
    expect(within(header).getByText("ТУРНИР · КЛИНОК СЕВЕРА 2026")).toBeInTheDocument();
    expect(within(header).getByText("Профиль турнира")).toBeInTheDocument();
    expect(within(header).getByText(/Изменено/)).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Отменить правки" })).toBeInTheDocument();
  });

  it("shows only 'ТУРНИР' in the crumb when the tournament has no title yet", () => {
    render(<TournamentScreen tournament={tournament({ title: "" })} />);
    const header = document.querySelector('[data-slot="page-header"]') as HTMLElement;
    expect(within(header).getByText("ТУРНИР")).toBeInTheDocument();
  });

  it("shows the unsaved-changes bar once a field is edited (AC-4)", () => {
    render(<TournamentScreen tournament={tournament()} />);

    expect(screen.queryByText(/Несохранённые изменения/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Название *"), {
      target: { value: "Новое название" },
    });

    const bar = document.querySelector('[data-slot="unsaved-changes-bar"]') as HTMLElement;
    expect(within(bar).getByText(/название/)).toBeInTheDocument();
  });

  it("'Отменить правки' resets fields, hides the bar, and never touches the server (AC-5)", () => {
    render(<TournamentScreen tournament={tournament()} />);

    fireEvent.change(screen.getByLabelText("Название *"), {
      target: { value: "Новое название" },
    });
    expect(screen.getByText(/Несохранённые изменения/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Отменить правки" }));

    expect(screen.queryByText(/Несохранённые изменения/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Название *")).toHaveValue("Клинок Севера 2026");
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("successful save shows a success toast and clears the unsaved bar (AC-6)", () => {
    const saved = tournament({ description: "Новое описание", updatedAt: "2026-08-14T12:00:00.000Z" });
    updateResult = { ok: true, tournament: saved };

    render(<TournamentScreen tournament={tournament()} />);

    fireEvent.change(screen.getByLabelText("Описание"), {
      target: { value: "Новое описание" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Несохранённые изменения/)).not.toBeInTheDocument();
  });

  it("an empty title blocks saving with an inline error and no request (AC-7)", () => {
    render(<TournamentScreen tournament={tournament()} />);

    fireEvent.change(screen.getByLabelText("Название *"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(screen.getByText("Введите название турнира")).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  // Регресс-тест: раньше handleSave проверял только errors.title/eventEndAt
  // явным перечислением — ошибка нового поля (regulationsUrl/entryFeeAmount,
  // spec 0037) показывалась под инпутом, но не блокировала отправку, и
  // форма всё равно уходила на сервер с заведомо невалидными данными.
  it("an invalid regulations URL blocks saving with an inline error and no request (spec 0037, FR-20)", () => {
    render(<TournamentScreen tournament={tournament()} />);

    fireEvent.change(screen.getByLabelText("Ссылка на регламент"), {
      target: { value: "not-a-url" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(
      screen.getByText("Укажите полную ссылку (http:// или https://)"),
    ).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("a negative entry fee blocks saving with an inline error and no request (spec 0037, FR-21)", () => {
    render(<TournamentScreen tournament={tournament()} />);

    // type="number" в jsdom (как и в реальных браузерах) отбрасывает
    // нечисловой ввод молча — "-100" реалистично достижимо через это поле
    // (min=0 не мешает набрать отрицательное число, это лишь constraint-
    // validation hint), в отличие от произвольного текста.
    fireEvent.change(screen.getByLabelText("Сумма взноса"), {
      target: { value: "-100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(
      screen.getByText("Сумма взноса не может быть отрицательной"),
    ).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("an end date before the start date blocks saving with an inline error (AC-8)", () => {
    // Исходно start=1 дек, end=3 дек (валидно). Двигаем start на 20 дек —
    // end остаётся раньше начала.
    render(<TournamentScreen tournament={tournament()} />);

    fireEvent.click(screen.getByRole("button", { name: "Дата и время начала" }));
    fireEvent.click(screen.getByRole("button", { name: "20" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("a server rejection shows an error toast without retry and keeps entered values (AC-9)", () => {
    updateResult = { ok: false, error: "Проверьте название и даты" };

    render(<TournamentScreen tournament={tournament()} />);

    fireEvent.change(screen.getByLabelText("Название *"), {
      target: { value: "Новое название" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(toastError).toHaveBeenCalledTimes(1);
    const [message, options] = toastError.mock.calls[0] as [string, { retry?: () => void } | undefined];
    expect(message).toBe("Проверьте название и даты");
    expect(options?.retry).toBeUndefined();
    expect(screen.getByLabelText("Название *")).toHaveValue("Новое название");
  });

  // spec 0037 (T17, FR-22): UpdateActiveTournament заменяет профиль целиком.
  // Регрессия, которую боится плейбук задачи: сохранение НЕсвязанного поля
  // (описания) не должно обнулять уже заполненные новые поля профиля.
  it("saving an unrelated field does not null out already-set new profile fields (spec 0037, FR-22)", () => {
    render(
      <TournamentScreen
        tournament={tournament({
          chiefJudge: "Иванов И.И.",
          regulationsUrl: "https://cdn.example.com/rules.pdf",
          venueName: "Дворец спорта",
          venueAddress: "г. Москва, ул. Спортивная, 1",
          entryFeeMinor: 150000,
          entryFeeCurrency: "RUB",
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Описание"), {
      target: { value: "Новое описание" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const input = updateMutate.mock.calls[0][0] as Record<string, unknown>;
    expect(input.chiefJudge).toBe("Иванов И.И.");
    expect(input.regulationsUrl).toBe("https://cdn.example.com/rules.pdf");
    expect(input.venueName).toBe("Дворец спорта");
    expect(input.venueAddress).toBe("г. Москва, ул. Спортивная, 1");
    expect(input.entryFeeMinor).toBe(150000);
    expect(input.entryFeeCurrency).toBe("RUB");
  });

  // spec 0039, T20 (FR-13, FR-15, AC-9/AC-10): экран копит несохранённый
  // ввод до явного «Сохранить» — guard должен знать об этом.
  it("marks the unsaved-guard store dirty once a field is edited (spec 0039, AC-9)", () => {
    render(<TournamentScreen tournament={tournament()} />);
    expect(useUnsavedGuardStore.getState().dirtyReason).toBeNull();

    fireEvent.change(screen.getByLabelText("Название *"), {
      target: { value: "Новое название" },
    });

    expect(useUnsavedGuardStore.getState().dirtyReason).toBe("профиль турнира");
  });

  it("clears the unsaved-guard flag after a successful save (spec 0039, AC-10)", () => {
    render(<TournamentScreen tournament={tournament()} />);

    fireEvent.change(screen.getByLabelText("Название *"), {
      target: { value: "Новое название" },
    });
    expect(useUnsavedGuardStore.getState().dirtyReason).toBe("профиль турнира");

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(useUnsavedGuardStore.getState().dirtyReason).toBeNull();
  });

  it("clears the unsaved-guard flag when changes are reset", () => {
    render(<TournamentScreen tournament={tournament()} />);

    fireEvent.change(screen.getByLabelText("Название *"), {
      target: { value: "Новое название" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отменить правки" }));

    expect(useUnsavedGuardStore.getState().dirtyReason).toBeNull();
  });
});
