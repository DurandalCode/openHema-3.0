import { describe, expect, it } from "vitest";
import { bracketErrorMessage } from "./errors";

describe("features/bracket-seeding/api/errors bracketErrorMessage", () => {
  it("translates 409 (slot occupied) to a locked message", () => {
    expect(bracketErrorMessage("bracket: slot occupied", 409)).toBe(
      "Действие недоступно: слот занят либо посев сетки уже зафиксирован",
    );
  });

  it("translates 409 (composition already fixed) to the same locked message", () => {
    expect(bracketErrorMessage("bracket: layout is ready, cannot modify", 409)).toBe(
      "Действие недоступно: слот занят либо посев сетки уже зафиксирован",
    );
  });

  it("translates 404 to a stage-not-found message", () => {
    expect(bracketErrorMessage("stage not found", 404)).toBe("Этап не найден");
  });

  it("translates 400 to a generic invalid request message", () => {
    expect(bracketErrorMessage("invalid input", 400)).toBe("Некорректный запрос");
  });

  it("translates 401 and 403 to an insufficient permissions message", () => {
    expect(bracketErrorMessage("unauthenticated", 401)).toBe("Недостаточно прав");
    expect(bracketErrorMessage("forbidden", 403)).toBe("Недостаточно прав");
  });

  it("falls back to a generic message for a network failure (no status)", () => {
    expect(bracketErrorMessage("Сеть недоступна", undefined)).toBe(
      "Не удалось выполнить действие, попробуйте ещё раз",
    );
  });

  it("falls back to a generic message for other/missing statuses", () => {
    expect(bracketErrorMessage("internal", 500)).toBe(
      "Не удалось выполнить действие, попробуйте ещё раз",
    );
  });

  it("never leaks the raw server string into the translated message", () => {
    const message = bracketErrorMessage("bracket: slot 3 is already occupied by f2", 409);
    expect(message).not.toContain("bracket:");
    expect(message).not.toContain("f2");
  });
});
