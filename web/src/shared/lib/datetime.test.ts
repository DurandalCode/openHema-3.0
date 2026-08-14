import { describe, expect, it } from "vitest";
import {
  dateToIso,
  formatDateTime,
  formatRelativeDay,
  formatRelativeTime,
  fromLocalInputValue,
  parseIsoToDate,
  toLocalInputValue,
} from "./datetime";

describe("datetime (FR-12)", () => {
  describe("toLocalInputValue / fromLocalInputValue round-trip", () => {
    it("round-trips an ISO instant with whole minutes through the field value", () => {
      const iso = "2026-08-12T14:30:00.000Z";
      const local = toLocalInputValue(iso);
      const back = fromLocalInputValue(local);

      expect(back).not.toBeNull();
      expect(new Date(back as string).getTime()).toBe(new Date(iso).getTime());
    });

    it("round-trips a field value back into the same field value via ISO", () => {
      const local = "2026-08-12T09:15";
      const iso = fromLocalInputValue(local);
      expect(iso).not.toBeNull();
      expect(toLocalInputValue(iso)).toBe(local);
    });
  });

  describe("empty input", () => {
    it("toLocalInputValue returns an empty string for null/undefined/empty ISO", () => {
      expect(toLocalInputValue(null)).toBe("");
      expect(toLocalInputValue(undefined)).toBe("");
      expect(toLocalInputValue("")).toBe("");
    });

    it("fromLocalInputValue returns null for an empty field value", () => {
      expect(fromLocalInputValue("")).toBeNull();
    });
  });

  describe("invalid input", () => {
    it("toLocalInputValue returns an empty string for an invalid ISO string", () => {
      expect(toLocalInputValue("not-a-date")).toBe("");
    });

    it("fromLocalInputValue returns null for an invalid field value", () => {
      expect(fromLocalInputValue("not-a-date")).toBeNull();
    });
  });

  describe("parseIsoToDate / dateToIso", () => {
    it("parses a valid ISO string into a Date", () => {
      const date = parseIsoToDate("2026-08-12T14:30:00.000Z");
      expect(date).not.toBeNull();
      expect((date as Date).getTime()).toBe(
        new Date("2026-08-12T14:30:00.000Z").getTime(),
      );
    });

    it("returns null for empty or invalid input", () => {
      expect(parseIsoToDate(null)).toBeNull();
      expect(parseIsoToDate(undefined)).toBeNull();
      expect(parseIsoToDate("")).toBeNull();
      expect(parseIsoToDate("not-a-date")).toBeNull();
    });

    it("dateToIso round-trips a Date through parseIsoToDate", () => {
      const date = new Date("2026-08-12T14:30:00.000Z");
      const iso = dateToIso(date);
      expect(parseIsoToDate(iso)?.getTime()).toBe(date.getTime());
    });
  });
});

// FR-2 (спека 0024): колонка «Регистрация» — относительная дата с полной
// датой+временем в подсказке. `now` передаётся явно, чтобы тесты не зависели
// от системных часов; ISO-строки — без "Z" (local date-time form), так и
// `iso`, и `now` разбираются в один и тот же локальный календарный день
// независимо от таймзоны машины, на которой запущен тест.
describe("formatRelativeDay (FR-2)", () => {
  const now = new Date(2026, 7, 13, 12, 0, 0);

  it('returns "сегодня" for a timestamp earlier the same day', () => {
    expect(formatRelativeDay("2026-08-13T08:00:00", now)).toBe("сегодня");
  });

  it('returns "вчера" for a timestamp the previous calendar day', () => {
    expect(formatRelativeDay("2026-08-12T20:00:00", now)).toBe("вчера");
  });

  it('returns "N дней назад" for a small number of days ago', () => {
    expect(formatRelativeDay("2026-08-10T08:00:00", now)).toBe("3 дня назад");
    expect(formatRelativeDay("2026-08-08T08:00:00", now)).toBe(
      "5 дней назад",
    );
  });

  it('returns "day month" without a year for dates further back this calendar year', () => {
    expect(formatRelativeDay("2026-03-18T08:00:00", now)).toBe("18 мар");
  });

  it('returns "day month year" for dates in a previous year', () => {
    expect(formatRelativeDay("2025-03-18T08:00:00", now)).toBe("18 мар 2025");
  });

  it("returns an empty string for empty/invalid input", () => {
    expect(formatRelativeDay("", now)).toBe("");
    expect(formatRelativeDay("not-a-date", now)).toBe("");
  });
});

// spec 0029, FR-1: признак «Изменено …» в шапке экрана «Турнир» — минуты и
// часы со своими склонениями, начиная с суток делегирует `formatRelativeDay`
// (0024) вместо повторения её логики с нуля.
describe("formatRelativeTime (spec 0029, FR-1)", () => {
  const now = new Date(2026, 7, 13, 12, 0, 0);

  it('returns "только что" for less than a minute ago', () => {
    expect(formatRelativeTime("2026-08-13T11:59:31", now)).toBe("только что");
  });

  it('returns "только что" for the exact same instant', () => {
    expect(formatRelativeTime("2026-08-13T12:00:00", now)).toBe("только что");
  });

  it("declines minutes correctly", () => {
    expect(formatRelativeTime("2026-08-13T11:59:00", now)).toBe("1 минуту назад");
    expect(formatRelativeTime("2026-08-13T11:58:00", now)).toBe("2 минуты назад");
    expect(formatRelativeTime("2026-08-13T11:55:00", now)).toBe("5 минут назад");
    expect(formatRelativeTime("2026-08-13T11:49:00", now)).toBe("11 минут назад");
  });

  it("declines hours correctly", () => {
    expect(formatRelativeTime("2026-08-13T11:00:00", now)).toBe("1 час назад");
    expect(formatRelativeTime("2026-08-13T10:00:00", now)).toBe("2 часа назад");
    expect(formatRelativeTime("2026-08-13T07:00:00", now)).toBe("5 часов назад");
  });

  it("delegates to formatRelativeDay starting at a full day", () => {
    const iso = "2026-08-10T08:00:00";
    expect(formatRelativeTime(iso, now)).toBe(formatRelativeDay(iso, now));
  });

  it("returns an empty string for empty/invalid input", () => {
    expect(formatRelativeTime("", now)).toBe("");
    expect(formatRelativeTime(null, now)).toBe("");
    expect(formatRelativeTime("not-a-date", now)).toBe("");
  });
});

describe("formatDateTime (FR-2)", () => {
  it("formats a full date and time for a tooltip", () => {
    expect(formatDateTime("2026-08-12T14:30:00")).toBe(
      "12 августа 2026, 14:30",
    );
  });

  it("pads single-digit hours and minutes", () => {
    expect(formatDateTime("2026-01-05T09:05:00")).toBe(
      "5 января 2026, 09:05",
    );
  });

  it("returns an empty string for empty/invalid input", () => {
    expect(formatDateTime("")).toBe("");
    expect(formatDateTime("not-a-date")).toBe("");
  });
});
