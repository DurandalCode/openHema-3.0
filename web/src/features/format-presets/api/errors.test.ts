import { describe, expect, it } from "vitest";
import { presetErrorMessage } from "./errors";

describe("features/format-presets/api/errors", () => {
  it("translates 409 (name taken) into a Russian explanation", () => {
    expect(presetErrorMessage("preset name is already taken", 409)).toBe(
      "Пресет с таким именем уже есть — выберите другое",
    );
  });

  it("falls back to a generic message for other statuses", () => {
    expect(presetErrorMessage("internal error", 500)).toBe(
      "Не удалось выполнить действие. Попробуйте ещё раз.",
    );
    expect(presetErrorMessage("forbidden", 403)).toBe("Не удалось выполнить действие. Попробуйте ещё раз.");
  });

  it("falls back to a generic message when status is missing (network error)", () => {
    expect(presetErrorMessage("Сеть недоступна", undefined)).toBe(
      "Не удалось выполнить действие. Попробуйте ещё раз.",
    );
  });

  it("never leaks the raw server error string", () => {
    expect(presetErrorMessage("uq_presets_name violates constraint", 409)).not.toContain("uq_presets_name");
    expect(presetErrorMessage("some internal go error", 500)).not.toBe("some internal go error");
  });

  it("translates 409 in the 'apply' context (schema already touched, spec 0031 AC-16) differently from name conflict", () => {
    const message = presetErrorMessage("schema is not empty: reset stages first", 409, "apply");
    expect(message).toMatch(/схем/i);
    expect(message).not.toBe("Пресет с таким именем уже есть — выберите другое");
  });

  it("falls back to the generic message for non-409 statuses in the 'apply' context", () => {
    expect(presetErrorMessage("internal error", 500, "apply")).toBe(
      "Не удалось выполнить действие. Попробуйте ещё раз.",
    );
  });

  it("defaults to the name-conflict context when omitted (existing rename/delete callers)", () => {
    expect(presetErrorMessage("preset name is already taken", 409)).toBe(
      "Пресет с таким именем уже есть — выберите другое",
    );
  });
});
