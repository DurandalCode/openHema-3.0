import { describe, expect, it } from "vitest";
import type { NominationStatus } from "@/entities/nomination/lib/types";
import {
  canClose,
  canReopen,
  registrationErrorMessage,
  reopenBlockedReason,
} from "./registration-gate";

const ALL_STATUSES: NominationStatus[] = [
  "NOMINATION_STATUS_UNSPECIFIED",
  "NOMINATION_STATUS_OPEN",
  "NOMINATION_STATUS_CLOSED",
  "NOMINATION_STATUS_ACTIVE",
  "NOMINATION_STATUS_FINISHED",
];

describe("canClose", () => {
  // Спека 0012, FR-9/AC-12: «Закрыть приём» доступна только при OPEN.
  it.each(ALL_STATUSES)("status=%s", (status) => {
    expect(canClose(status)).toBe(status === "NOMINATION_STATUS_OPEN");
  });
});

describe("canReopen", () => {
  // Спека 0028, FR-13: «Открыть приём» доступна только при CLOSED — гейт на
  // клиенте больше не смотрит на распределённых бойцов (мёртвая ручка
  // pool-status удалена, T3), окончательное решение — за сервером (409).
  it.each(ALL_STATUSES)("status=%s", (status) => {
    expect(canReopen(status)).toBe(status === "NOMINATION_STATUS_CLOSED");
  });
});

describe("reopenBlockedReason", () => {
  // Спека 0028, FR-13/AC-10: в фазе боёв «Открыть приём» недоступно с
  // объяснением причины.
  it.each(["NOMINATION_STATUS_ACTIVE", "NOMINATION_STATUS_FINISHED"] as NominationStatus[])(
    "status=%s → объяснение",
    (status) => {
      expect(reopenBlockedReason(status)).toBe("Бои уже начались — открыть приём нельзя");
    },
  );

  it.each([
    "NOMINATION_STATUS_UNSPECIFIED",
    "NOMINATION_STATUS_OPEN",
    "NOMINATION_STATUS_CLOSED",
  ] as NominationStatus[])("status=%s → null", (status) => {
    expect(reopenBlockedReason(status)).toBeNull();
  });
});

describe("registrationErrorMessage", () => {
  // Спека 0028, FR-14/AC-11: 409 (FailedPrecondition сервера) → фиксированный
  // русский текст вместо технической строки сервера.
  it("status=409 → фиксированная русская формулировка", () => {
    expect(registrationErrorMessage("nomination: registration cannot be reopened", 409)).toBe(
      "Открыть приём нельзя: приём закрылся автоматически при посеве либо в номинации уже есть распределённые бойцы — сначала расформируйте состав этапа",
    );
  });

  it("status=500 → исходная строка без изменений", () => {
    expect(registrationErrorMessage("Ошибка запроса", 500)).toBe("Ошибка запроса");
  });

  it("status=undefined → исходная строка без изменений", () => {
    expect(registrationErrorMessage("Сеть недоступна", undefined)).toBe("Сеть недоступна");
  });
});
