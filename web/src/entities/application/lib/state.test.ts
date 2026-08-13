import { describe, expect, it } from "vitest";
import {
  allowedApplicantActions,
  allowedSecretaryActions,
  eventLabel,
  isTerminal,
  nextExpectedStep,
  stateCaption,
  stateLabel,
} from "@/entities/application/lib/state";
import type {
  ApplicationEventType,
  ApplicationState,
} from "@/entities/application/lib/types";

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

describe("stateCaption", () => {
  it("returns a short caption phrase for every concrete state (FR-2)", () => {
    expect(stateCaption("APPLICATION_STATE_SUBMITTED")).toBe("подана");
    expect(
      stateCaption("APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION"),
    ).toBe("оплата заявлена");
    expect(stateCaption("APPLICATION_STATE_PAID")).toBe(
      "оплата подтверждена",
    );
    expect(stateCaption("APPLICATION_STATE_REGISTERED")).toBe(
      "зарегистрирован",
    );
    expect(stateCaption("APPLICATION_STATE_WITHDRAWN")).toBe("отозвана");
  });

  it("falls back to a dash for unspecified", () => {
    expect(stateCaption("APPLICATION_STATE_UNSPECIFIED")).toBe("—");
  });
});

describe("eventLabel", () => {
  it("returns a Russian label for every known history event type (FR-17)", () => {
    expect(eventLabel("APPLICATION_EVENT_TYPE_SUBMITTED")).toBe(
      "Заявка подана",
    );
    expect(eventLabel("APPLICATION_EVENT_TYPE_PAYMENT_DECLARED")).toBe(
      "Оплата заявлена",
    );
    expect(eventLabel("APPLICATION_EVENT_TYPE_PAYMENT_CONFIRMED")).toBe(
      "Оплата подтверждена",
    );
    expect(eventLabel("APPLICATION_EVENT_TYPE_FIGHTER_REGISTERED")).toBe(
      "Боец зарегистрирован",
    );
    expect(eventLabel("APPLICATION_EVENT_TYPE_WITHDRAWN")).toBe(
      "Заявка отозвана",
    );
    expect(eventLabel("APPLICATION_EVENT_TYPE_AMENDED")).toBe(
      "Заявка изменена",
    );
  });

  it("falls back to a dash for unspecified", () => {
    expect(eventLabel("APPLICATION_EVENT_TYPE_UNSPECIFIED")).toBe("—");
  });
});

describe("nextExpectedStep", () => {
  it("describes the next step and who it waits on for every non-terminal state (FR-18)", () => {
    expect(nextExpectedStep("APPLICATION_STATE_SUBMITTED")).toEqual({
      label: expect.stringMatching(/оплат/i),
      waitingOn: expect.stringMatching(/боец/i),
    });
    expect(
      nextExpectedStep("APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION"),
    ).toEqual({
      label: expect.any(String),
      waitingOn: expect.stringMatching(/секретар|организатор/i),
    });
    expect(nextExpectedStep("APPLICATION_STATE_PAID")).toEqual({
      label: expect.stringMatching(/регистр/i),
      waitingOn: expect.stringMatching(/секретар|организатор/i),
    });
  });

  it("returns null for terminal states (REGISTERED, WITHDRAWN)", () => {
    expect(nextExpectedStep("APPLICATION_STATE_REGISTERED")).toBeNull();
    expect(nextExpectedStep("APPLICATION_STATE_WITHDRAWN")).toBeNull();
  });

  it("returns null for unspecified", () => {
    expect(nextExpectedStep("APPLICATION_STATE_UNSPECIFIED")).toBeNull();
  });
});

describe("isTerminal", () => {
  it("is true for REGISTERED and WITHDRAWN", () => {
    expect(isTerminal("APPLICATION_STATE_REGISTERED")).toBe(true);
    expect(isTerminal("APPLICATION_STATE_WITHDRAWN")).toBe(true);
  });

  it("is false for non-terminal states", () => {
    const nonTerminal: ApplicationState[] = [
      "APPLICATION_STATE_UNSPECIFIED",
      "APPLICATION_STATE_SUBMITTED",
      "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION",
      "APPLICATION_STATE_PAID",
    ];
    for (const state of nonTerminal) {
      expect(isTerminal(state)).toBe(false);
    }
  });
});

describe("eventLabel exhaustiveness (all concrete ApplicationEventType values)", () => {
  it("covers all six concrete event types with a non-dash label", () => {
    const types: ApplicationEventType[] = [
      "APPLICATION_EVENT_TYPE_SUBMITTED",
      "APPLICATION_EVENT_TYPE_PAYMENT_DECLARED",
      "APPLICATION_EVENT_TYPE_PAYMENT_CONFIRMED",
      "APPLICATION_EVENT_TYPE_FIGHTER_REGISTERED",
      "APPLICATION_EVENT_TYPE_WITHDRAWN",
      "APPLICATION_EVENT_TYPE_AMENDED",
    ];
    for (const type of types) {
      expect(eventLabel(type)).not.toBe("—");
    }
  });
});
