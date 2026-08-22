import { describe, expect, it } from "vitest";
import { applicationErrorMessage } from "./errors";

describe("features/my-applications/api/errors applicationErrorMessage", () => {
  it("passes through the BFF's own Russian text on 409 (duplicate or closed registration)", () => {
    expect(
      applicationErrorMessage("Вы уже подали заявку в эту номинацию", 409),
    ).toBe("Вы уже подали заявку в эту номинацию");
    expect(
      applicationErrorMessage("Приём заявок в эту номинацию завершён", 409),
    ).toBe("Приём заявок в эту номинацию завершён");
  });

  it("translates 401/403 to a sign-in prompt", () => {
    expect(applicationErrorMessage("unauthenticated", 401)).toBe(
      "Войдите, чтобы продолжить",
    );
    expect(applicationErrorMessage("forbidden", 403)).toBe(
      "Войдите, чтобы продолжить",
    );
  });

  it("translates 404 to a not-found message", () => {
    expect(applicationErrorMessage("not found", 404)).toBe(
      "Номинация не найдена",
    );
  });

  it("falls back to a generic message for other/missing statuses (network error)", () => {
    expect(applicationErrorMessage("internal", 500)).toBe(
      "Не удалось выполнить действие, попробуйте ещё раз",
    );
    expect(applicationErrorMessage("Сеть недоступна", undefined)).toBe(
      "Не удалось выполнить действие, попробуйте ещё раз",
    );
  });
});
