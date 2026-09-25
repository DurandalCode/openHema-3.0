import { describe, expect, it } from "vitest";
import {
  draftToTournament,
  entryFeeAmountToMinor,
  entryFeeMinorToAmount,
  tournamentDraftChanges,
  validateTournamentDraft,
  type TournamentDraft,
} from "./draft";
import type { Tournament } from "./types";

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    title: "Клинок Севера 2026",
    description: "Ежегодный турнир",
    eventStartAt: "2026-12-01T10:00:00.000Z",
    eventEndAt: "2026-12-03T18:00:00.000Z",
    emblemUrl: "https://cdn.example.com/logo.png",
    isActive: true,
    contacts: [
      { id: "c1", type: "CONTACT_TYPE_TELEGRAM", value: "@org" },
      { id: "c2", type: "CONTACT_TYPE_VK", value: "org" },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    chiefJudge: "Иванов И.И.",
    regulationsUrl: "https://cdn.example.com/rules.pdf",
    venueName: "Спорткомплекс «Заря»",
    venueAddress: "г. Москва, ул. Спортивная, 1",
    entryFeeMinor: 150000,
    entryFeeCurrency: "RUB",
    program: [],
    regulationsFile: { url: "", name: "", size: 0 },
    emblemFile: { url: "", name: "", size: 0 },
    notifications: { applicationState: false, poolSeated: false },
    ...overrides,
  };
}

function draftFrom(saved: Tournament): TournamentDraft {
  return {
    title: saved.title,
    description: saved.description,
    emblemUrl: saved.emblemUrl,
    eventStartAt: saved.eventStartAt || null,
    eventEndAt: saved.eventEndAt || null,
    contacts: saved.contacts.map((c) => ({ type: c.type, value: c.value })),
    chiefJudge: saved.chiefJudge,
    regulationsUrl: saved.regulationsUrl,
    venueName: saved.venueName,
    venueAddress: saved.venueAddress,
    entryFeeAmount: entryFeeMinorToAmount(saved.entryFeeMinor),
    entryFeeCurrency: saved.entryFeeCurrency,
    program: saved.program.map((d) => ({
      date: d.date,
      items: d.items.map((it) => ({ timeLabel: it.timeLabel, text: it.text })),
    })),
    notifications: { ...saved.notifications },
  };
}

describe("entities/tournament/lib/draft tournamentDraftChanges (spec 0029, FR-7/AC-4/AC-5)", () => {
  it("returns an empty list for an identical draft", () => {
    const saved = tournament();
    expect(tournamentDraftChanges(saved, draftFrom(saved))).toEqual([]);
  });

  it("reports each changed field by name", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.title = "Новое название";
    draft.description = "Новое описание";
    draft.eventStartAt = "2026-12-02T10:00:00.000Z";
    draft.eventEndAt = "2026-12-04T18:00:00.000Z";
    draft.emblemUrl = "https://cdn.example.com/other.png";

    expect(tournamentDraftChanges(saved, draft)).toEqual([
      "название",
      "описание",
      "дата начала",
      "дата окончания",
      "эмблема",
    ]);
  });

  it("declines the changed-contacts label (singular)", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.contacts = [draft.contacts[0], { type: "CONTACT_TYPE_VK", value: "new-handle" }];

    expect(tournamentDraftChanges(saved, draft)).toEqual(["1 контакт"]);
  });

  it("declines the changed-contacts label (plural, 2-4)", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.contacts = [
      { type: "CONTACT_TYPE_TELEGRAM", value: "new-tg" },
      { type: "CONTACT_TYPE_VK", value: "new-vk" },
    ];

    expect(tournamentDraftChanges(saved, draft)).toEqual(["2 контакта"]);
  });

  it("does not count an empty added contact row as a change", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.contacts = [...draft.contacts, { type: "CONTACT_TYPE_TELEGRAM", value: "" }];

    expect(tournamentDraftChanges(saved, draft)).toEqual([]);
  });

  it("combines several field changes and the contact change in one list", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.title = "Новое название";
    draft.eventStartAt = "2026-12-05T10:00:00.000Z";
    draft.contacts[1] = { type: "CONTACT_TYPE_VK", value: "changed" };

    expect(tournamentDraftChanges(saved, draft)).toEqual([
      "название",
      "дата начала",
      "1 контакт",
    ]);
  });
});

describe("entities/tournament/lib/draft validateTournamentDraft (spec 0029, AC-7/AC-8)", () => {
  it("requires a non-empty title", () => {
    const draft = draftFrom(tournament({ title: "" }));
    expect(validateTournamentDraft(draft).title).toBeTruthy();
  });

  it("treats a whitespace-only title as empty", () => {
    const draft = draftFrom(tournament());
    draft.title = "   ";
    expect(validateTournamentDraft(draft).title).toBeTruthy();
  });

  it("rejects an end date earlier than the start date", () => {
    const draft = draftFrom(tournament());
    draft.eventStartAt = "2026-12-03T10:00:00.000Z";
    draft.eventEndAt = "2026-12-01T10:00:00.000Z";
    expect(validateTournamentDraft(draft).eventEndAt).toBeTruthy();
  });

  it("accepts equal dates and clearing the optional end after an invalid range", () => {
    const draft = draftFrom(tournament());
    draft.eventStartAt = "2026-12-03T10:00:00.000Z";
    draft.eventEndAt = "2026-12-01T10:00:00.000Z";
    expect(validateTournamentDraft(draft).eventEndAt).toBeTruthy();

    draft.eventEndAt = draft.eventStartAt;
    expect(validateTournamentDraft(draft).eventEndAt).toBeUndefined();

    draft.eventEndAt = null;
    expect(validateTournamentDraft(draft).eventEndAt).toBeUndefined();
  });

  it("rejects an end date without a start date", () => {
    const draft = draftFrom(tournament());
    draft.eventStartAt = null;
    expect(validateTournamentDraft(draft).eventEndAt).toBeTruthy();
  });

  it("passes a valid draft without errors", () => {
    const draft = draftFrom(tournament());
    expect(validateTournamentDraft(draft)).toEqual({});
  });

  it("passes a draft with no dates at all", () => {
    const draft = draftFrom(tournament());
    draft.eventStartAt = null;
    draft.eventEndAt = null;
    expect(validateTournamentDraft(draft)).toEqual({});
  });

  // spec 0037, FR-20/AC-15: сервер отклоняет regulationsUrl без http/https
  // схемы. Без клиентской пре-проверки такой ввод проходит эти три правила
  // молча, доходит до сервера и там получает generic 400, который
  // `tournamentErrorMessage` раньше списывал на «название и даты».
  it("rejects a regulationsUrl without an http/https scheme", () => {
    const draft = draftFrom(tournament());
    draft.regulationsUrl = "not-a-url";
    expect(validateTournamentDraft(draft).regulationsUrl).toBeTruthy();
  });

  it("rejects a regulationsUrl with a non-http(s) scheme", () => {
    const draft = draftFrom(tournament());
    draft.regulationsUrl = "ftp://example.com/rules.pdf";
    expect(validateTournamentDraft(draft).regulationsUrl).toBeTruthy();
  });

  it("accepts an empty regulationsUrl (not set)", () => {
    const draft = draftFrom(tournament());
    draft.regulationsUrl = "";
    expect(validateTournamentDraft(draft).regulationsUrl).toBeUndefined();
  });

  it("accepts a valid https regulationsUrl", () => {
    const draft = draftFrom(tournament());
    draft.regulationsUrl = "https://cdn.example.com/rules.pdf";
    expect(validateTournamentDraft(draft).regulationsUrl).toBeUndefined();
  });

  // spec 0037, FR-21/AC-16: сервер отклоняет отрицательный взнос; клиент
  // конвертирует форму (entryFeeAmount) в entryFeeMinor через
  // entryFeeAmountToMinor, которая на неоднозначном вводе (несколько
  // разделителей) возвращает null — без пре-проверки это молча
  // отправлялось бы как «взнос не задан», а не как ошибка ввода.
  it("rejects a negative entry fee amount", () => {
    const draft = draftFrom(tournament());
    draft.entryFeeAmount = "-100";
    expect(validateTournamentDraft(draft).entryFeeAmount).toBeTruthy();
  });

  it("rejects an unparseable entry fee amount", () => {
    const draft = draftFrom(tournament());
    draft.entryFeeAmount = "1,234.56";
    expect(validateTournamentDraft(draft).entryFeeAmount).toBeTruthy();
  });

  it("accepts an empty entry fee amount (not set)", () => {
    const draft = draftFrom(tournament());
    draft.entryFeeAmount = "";
    expect(validateTournamentDraft(draft).entryFeeAmount).toBeUndefined();
  });

  it("accepts a valid entry fee amount", () => {
    const draft = draftFrom(tournament());
    draft.entryFeeAmount = "1500.50";
    expect(validateTournamentDraft(draft).entryFeeAmount).toBeUndefined();
  });
});

describe("entities/tournament/lib/draft entryFeeAmountToMinor", () => {
  it("parses a plain integer amount", () => {
    expect(entryFeeAmountToMinor("1500")).toBe(150000);
  });

  it("parses a period-decimal amount", () => {
    expect(entryFeeAmountToMinor("1500.5")).toBe(150050);
  });

  // Единственный легитимный случай запятой — RU-раскладка нумпада
  // (десятичный разделитель), ровно одна запятая, без точки.
  it("parses a single comma as a decimal separator (RU numpad)", () => {
    expect(entryFeeAmountToMinor("1500,5")).toBe(150050);
  });

  // Раньше `.replace(",", ".")` заменял только первую запятую, и
  // "1,234.56"/"1.500,50" превращались в строки с двумя разделителями
  // (Number() → NaN → null) — то есть неоднозначный ввод и правда не
  // парсился, но результат (null = «взнос не задан») без ошибки
  // выглядел как тихий успех. Явная проверка "> 1 разделителя" делает
  // это осознанным отказом, а не побочным эффектом.
  it("refuses input mixing a comma and a period (ambiguous thousands/decimal)", () => {
    expect(entryFeeAmountToMinor("1,234.56")).toBeNull();
    expect(entryFeeAmountToMinor("1.500,50")).toBeNull();
  });

  it("refuses input with more than one comma", () => {
    expect(entryFeeAmountToMinor("1,234,56")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(entryFeeAmountToMinor("")).toBeNull();
  });

  it("returns null for garbage text", () => {
    expect(entryFeeAmountToMinor("not a number")).toBeNull();
  });
});

describe("entities/tournament/lib/draft draftToTournament (spec 0029, FR-3/FR-5/AC-2/AC-3)", () => {
  it("takes field values from the draft", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.title = "Черновик";
    draft.description = "Черновое описание";

    const preview = draftToTournament(saved, draft);
    expect(preview.title).toBe("Черновик");
    expect(preview.description).toBe("Черновое описание");
  });

  it("keeps id/createdAt/updatedAt/isActive from the saved tournament", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.title = "Черновик";

    const preview = draftToTournament(saved, draft);
    expect(preview.id).toBe(saved.id);
    expect(preview.createdAt).toBe(saved.createdAt);
    expect(preview.updatedAt).toBe(saved.updatedAt);
    expect(preview.isActive).toBe(saved.isActive);
  });

  it("drops empty contacts", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.contacts = [...draft.contacts, { type: "CONTACT_TYPE_EMAIL", value: "   " }];

    const preview = draftToTournament(saved, draft);
    expect(preview.contacts).toHaveLength(2);
    expect(preview.contacts.every((c) => c.value.trim() !== "")).toBe(true);
  });

  it("falls back to empty strings for cleared dates", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.eventStartAt = null;
    draft.eventEndAt = null;

    const preview = draftToTournament(saved, draft);
    expect(preview.eventStartAt).toBe("");
    expect(preview.eventEndAt).toBe("");
  });

  // spec 0037 (T17): 6 новых полей должны доехать до превью так же, как
  // остальные — иначе сохранение (полная замена, FR-22) молча обнулило бы их.
  it("carries the 6 new profile fields through to the preview (spec 0037, FR-18/FR-22)", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.chiefJudge = "Петров П.П.";
    draft.regulationsUrl = "https://cdn.example.com/new-rules.pdf";
    draft.venueName = "Дворец спорта";
    draft.venueAddress = "г. Санкт-Петербург, пр. Спортивный, 5";

    const preview = draftToTournament(saved, draft);
    expect(preview.chiefJudge).toBe("Петров П.П.");
    expect(preview.regulationsUrl).toBe("https://cdn.example.com/new-rules.pdf");
    expect(preview.venueName).toBe("Дворец спорта");
    expect(preview.venueAddress).toBe("г. Санкт-Петербург, пр. Спортивный, 5");
  });

  it("converts entryFeeAmount (major units) into entryFeeMinor (minor units)", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.entryFeeAmount = "1500.5";
    draft.entryFeeCurrency = "RUB";

    const preview = draftToTournament(saved, draft);
    expect(preview.entryFeeMinor).toBe(150050);
    expect(preview.entryFeeCurrency).toBe("RUB");
  });

  it("clears the currency when the entry fee amount is unset (FR-21: unset != zero)", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.entryFeeAmount = "";
    draft.entryFeeCurrency = "RUB";

    const preview = draftToTournament(saved, draft);
    expect(preview.entryFeeMinor).toBeNull();
    expect(preview.entryFeeCurrency).toBe("");
  });

  it("keeps an explicit zero entry fee distinct from unset (FR-21)", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.entryFeeAmount = "0";
    draft.entryFeeCurrency = "RUB";

    const preview = draftToTournament(saved, draft);
    expect(preview.entryFeeMinor).toBe(0);
    expect(preview.entryFeeCurrency).toBe("RUB");
  });
});

describe("entities/tournament/lib/draft tournamentDraftChanges — new profile fields (spec 0037)", () => {
  it("reports each new field changed by name", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.chiefJudge = "Новый судья";
    draft.regulationsUrl = "https://cdn.example.com/other-rules.pdf";
    draft.venueName = "Другой зал";
    draft.entryFeeAmount = "2000";

    expect(tournamentDraftChanges(saved, draft)).toEqual([
      "главный судья",
      "регламент",
      "место проведения",
      "взнос",
    ]);
  });

  it("returns no changes when the new fields are untouched", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    expect(tournamentDraftChanges(saved, draft)).toEqual([]);
  });
});

describe("entities/tournament/lib/draft program by days (spec 0040, FR-14/FR-14a)", () => {
  it("carries program days/items through to the preview", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.program = [
      {
        date: "2026-12-01",
        items: [{ timeLabel: "9:00", text: "Сбор участников" }],
      },
    ];

    const preview = draftToTournament(saved, draft);
    expect(preview.program).toEqual([
      {
        date: "2026-12-01",
        items: [{ timeLabel: "9:00", text: "Сбор участников" }],
      },
    ]);
  });

  it("drops items with empty text and days left with no items", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.program = [
      {
        date: "2026-12-01",
        items: [
          { timeLabel: "9:00", text: "Сбор участников" },
          { timeLabel: "", text: "   " },
        ],
      },
      { date: "2026-12-02", items: [{ timeLabel: "10:00", text: "  " }] },
    ];

    const preview = draftToTournament(saved, draft);
    expect(preview.program).toEqual([
      { date: "2026-12-01", items: [{ timeLabel: "9:00", text: "Сбор участников" }] },
    ]);
  });

  it("reports a program change by name", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.program = [
      { date: "2026-12-01", items: [{ timeLabel: "9:00", text: "Сбор участников" }] },
    ];

    expect(tournamentDraftChanges(saved, draft)).toEqual(["программа"]);
  });

  it("does not count an empty added day/item as a change", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.program = [{ date: "2026-12-01", items: [{ timeLabel: "", text: "" }] }];

    expect(tournamentDraftChanges(saved, draft)).toEqual([]);
  });
});

// spec 0042 (T40): переключатели уведомлений — обычное поле черновика
// формы (как chiefJudge), не проброс из saved (в отличие от
// regulationsFile/emblemFile, которые остаются отдельным действием
// загрузки, T39).
describe("entities/tournament/lib/draft notifications (spec 0042, FR-19)", () => {
  it("draftFrom seeds notifications from the saved tournament", () => {
    const saved = tournament({
      notifications: { applicationState: true, poolSeated: false },
    });
    const draft = draftFrom(saved);
    expect(draft.notifications).toEqual({ applicationState: true, poolSeated: false });
  });

  it("draftToTournament takes notifications from the draft, not from saved", () => {
    const saved = tournament({
      notifications: { applicationState: false, poolSeated: false },
    });
    const draft = draftFrom(saved);
    draft.notifications = { applicationState: true, poolSeated: true };

    const preview = draftToTournament(saved, draft);
    expect(preview.notifications).toEqual({ applicationState: true, poolSeated: true });
  });

  it("reports a notifications change by name", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.notifications = { applicationState: true, poolSeated: false };

    expect(tournamentDraftChanges(saved, draft)).toEqual(["уведомления"]);
  });

  it("returns no changes when notifications are untouched", () => {
    const saved = tournament({
      notifications: { applicationState: true, poolSeated: true },
    });
    const draft = draftFrom(saved);
    expect(tournamentDraftChanges(saved, draft)).toEqual([]);
  });
});
