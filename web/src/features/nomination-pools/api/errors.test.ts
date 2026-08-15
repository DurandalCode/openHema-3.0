import { describe, expect, it } from "vitest";
import { poolsErrorMessage } from "./errors";

describe("features/nomination-pools/api/errors poolsErrorMessage", () => {
  it("translates 409 to a locked/nothing-to-change message", () => {
    expect(poolsErrorMessage("ready: cannot modify", 409)).toBe(
      "Действие недоступно: раскладка зафиксирована либо изменять уже нечего",
    );
  });

  it("translates 400 to a generic invalid request message", () => {
    expect(poolsErrorMessage("invalid input", 400)).toBe("Некорректный запрос");
  });

  it("translates 401 and 403 to an insufficient permissions message", () => {
    expect(poolsErrorMessage("unauthenticated", 401)).toBe("Недостаточно прав");
    expect(poolsErrorMessage("forbidden", 403)).toBe("Недостаточно прав");
  });

  it("falls back to a generic message for other/missing statuses", () => {
    expect(poolsErrorMessage("internal", 500)).toBe(
      "Не удалось выполнить действие, попробуйте ещё раз",
    );
    expect(poolsErrorMessage("network", undefined)).toBe(
      "Не удалось выполнить действие, попробуйте ещё раз",
    );
  });

  it("never leaks the raw server string into the translated message", () => {
    const message = poolsErrorMessage("pool: layout is ready, cannot modify", 409);
    expect(message).not.toContain("pool:");
  });
});
