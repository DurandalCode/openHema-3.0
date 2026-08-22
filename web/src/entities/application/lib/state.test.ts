import { describe, expect, it } from "vitest";
import {
  allowedApplicantActions,
  allowedSecretaryActions,
  applicationFunnel,
  eventLabel,
  findActiveApplication,
  isTerminal,
  nextExpectedStep,
  stateCaption,
  stateLabel,
  stateTone,
} from "@/entities/application/lib/state";
import type {
  Application,
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

describe("stateTone", () => {
  it("maps every concrete state to the design system's badge tone (FR-16)", () => {
    expect(stateTone("APPLICATION_STATE_SUBMITTED")).toBe("neutral");
    expect(stateTone("APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION")).toBe("warn");
    expect(stateTone("APPLICATION_STATE_PAID")).toBe("info");
    expect(stateTone("APPLICATION_STATE_REGISTERED")).toBe("success");
    expect(stateTone("APPLICATION_STATE_WITHDRAWN")).toBe("neutral");
  });

  it("falls back to neutral for unspecified", () => {
    expect(stateTone("APPLICATION_STATE_UNSPECIFIED")).toBe("neutral");
  });
});

describe("applicationFunnel", () => {
  it("lists the four states in submission order, sharing labels with stateLabel (FR-4)", () => {
    const funnel = applicationFunnel();
    expect(funnel.map((s) => s.label)).toEqual([
      stateLabel("APPLICATION_STATE_SUBMITTED"),
      stateLabel("APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION"),
      stateLabel("APPLICATION_STATE_PAID"),
      stateLabel("APPLICATION_STATE_REGISTERED"),
    ]);
  });

  it("does not include the withdrawn state — it is not a step on the happy path", () => {
    const funnel = applicationFunnel();
    expect(funnel.some((s) => s.label === stateLabel("APPLICATION_STATE_WITHDRAWN"))).toBe(
      false,
    );
  });
});

function fixtureApplication(overrides: Partial<Application>): Application {
  return {
    id: "a1",
    nominationId: "n1",
    tournamentId: "t1",
    applicantUserId: "u1",
    applicantDisplayName: "Тест",
    state: "APPLICATION_STATE_SUBMITTED",
    club: "",
    needsEquipment: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("findActiveApplication", () => {
  it("finds the applicant's non-terminal application in the given nomination", () => {
    const target = fixtureApplication({
      id: "target",
      nominationId: "n1",
      state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION",
    });
    const other = fixtureApplication({ id: "other", nominationId: "n2" });

    expect(findActiveApplication([other, target], "n1")).toBe(target);
  });

  it("ignores terminal applications in the same nomination (registered or withdrawn)", () => {
    const registered = fixtureApplication({
      id: "registered",
      nominationId: "n1",
      state: "APPLICATION_STATE_REGISTERED",
    });
    const withdrawn = fixtureApplication({
      id: "withdrawn",
      nominationId: "n1",
      state: "APPLICATION_STATE_WITHDRAWN",
    });

    expect(findActiveApplication([registered, withdrawn], "n1")).toBeUndefined();
  });

  it("returns undefined when there is no application in the nomination at all", () => {
    const elsewhere = fixtureApplication({ id: "elsewhere", nominationId: "n2" });

    expect(findActiveApplication([elsewhere], "n1")).toBeUndefined();
  });

  it("returns undefined for an empty applications list", () => {
    expect(findActiveApplication([], "n1")).toBeUndefined();
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
