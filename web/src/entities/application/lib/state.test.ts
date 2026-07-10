import { describe, expect, it } from "vitest";
import {
  allowedApplicantActions,
  allowedSecretaryActions,
  stateLabel,
} from "@/entities/application/lib/state";
import type { ApplicationState } from "@/entities/application/lib/types";

describe("allowedApplicantActions", () => {
  it("allows declarePayment and withdraw from Submitted", () => {
    expect(allowedApplicantActions("APPLICATION_STATE_SUBMITTED")).toEqual([
      "declarePayment",
      "withdraw",
    ]);
  });

  it("allows only withdraw while awaiting payment confirmation", () => {
    expect(
      allowedApplicantActions("APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION"),
    ).toEqual(["withdraw"]);
  });

  it("allows only withdraw from Paid (AC-5)", () => {
    expect(allowedApplicantActions("APPLICATION_STATE_PAID")).toEqual(["withdraw"]);
  });

  it("allows nothing from terminal states", () => {
    const terminal: ApplicationState[] = [
      "APPLICATION_STATE_REGISTERED",
      "APPLICATION_STATE_WITHDRAWN",
    ];
    for (const state of terminal) {
      expect(allowedApplicantActions(state)).toEqual([]);
    }
  });
});

describe("allowedSecretaryActions", () => {
  it("allows confirmPayment only while awaiting confirmation", () => {
    expect(
      allowedSecretaryActions("APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION"),
    ).toEqual(["confirmPayment"]);
  });

  it("allows register only from Paid", () => {
    expect(allowedSecretaryActions("APPLICATION_STATE_PAID")).toEqual(["register"]);
  });

  it("allows nothing from Submitted or terminal states", () => {
    const states: ApplicationState[] = [
      "APPLICATION_STATE_SUBMITTED",
      "APPLICATION_STATE_REGISTERED",
      "APPLICATION_STATE_WITHDRAWN",
    ];
    for (const state of states) {
      expect(allowedSecretaryActions(state)).toEqual([]);
    }
  });
});

describe("stateLabel", () => {
  it("returns a Russian label for every known state", () => {
    expect(stateLabel("APPLICATION_STATE_SUBMITTED")).toBe("Подана");
    expect(stateLabel("APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION")).toBe(
      "Ожидает подтверждения оплаты",
    );
    expect(stateLabel("APPLICATION_STATE_PAID")).toBe("Оплачена");
    expect(stateLabel("APPLICATION_STATE_REGISTERED")).toBe("Зарегистрирована");
    expect(stateLabel("APPLICATION_STATE_WITHDRAWN")).toBe("Отозвана");
  });

  it("falls back to a dash for unspecified", () => {
    expect(stateLabel("APPLICATION_STATE_UNSPECIFIED")).toBe("—");
  });
});
