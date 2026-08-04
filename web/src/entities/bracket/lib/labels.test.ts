import { describe, expect, it } from "vitest";
import { slotDisplayName, slotStateLabel } from "./labels";
import type { BracketSlot } from "./types";

const emptyFighter = { fighterId: "", name: "", club: "" };

function slot(overrides: Partial<BracketSlot>): BracketSlot {
  return {
    slot: 1,
    state: "BRACKET_SLOT_STATE_EMPTY",
    fighter: emptyFighter,
    sourceLabel: "",
    ...overrides,
  };
}

describe("entities/bracket/lib/labels slotStateLabel", () => {
  it("labels a filled slot", () => {
    expect(slotStateLabel("BRACKET_SLOT_STATE_FILLED")).toBe("занят");
  });

  it("labels an empty slot", () => {
    expect(slotStateLabel("BRACKET_SLOT_STATE_EMPTY")).toBe("пусто");
  });

  it("labels a pending slot", () => {
    expect(slotStateLabel("BRACKET_SLOT_STATE_PENDING")).toBe("ожидание");
  });

  it("falls back to a dash for unspecified state", () => {
    expect(slotStateLabel("BRACKET_SLOT_STATE_UNSPECIFIED")).toBe("—");
  });
});

describe("entities/bracket/lib/labels slotDisplayName", () => {
  it("shows the fighter's name for a filled slot", () => {
    const s = slot({
      state: "BRACKET_SLOT_STATE_FILLED",
      fighter: { fighterId: "f1", name: "Иван Иванов", club: "Сокол" },
    });
    expect(slotDisplayName(s, false)).toBe("Иван Иванов");
  });

  // FR-13: незаполненный слот подписан парой-источником, строку формирует
  // сервер (`sourceLabel`) — клиент её не собирает из чисел.
  it("shows the server-provided source label for a pending slot", () => {
    const s = slot({
      state: "BRACKET_SLOT_STATE_PENDING",
      sourceLabel: "Победитель пары 3, 1/4 финала",
    });
    expect(slotDisplayName(s, false)).toBe("Победитель пары 3, 1/4 финала");
  });

  it("falls back to a generic waiting label when a pending slot has no source label", () => {
    const s = slot({ state: "BRACKET_SLOT_STATE_PENDING", sourceLabel: "" });
    expect(slotDisplayName(s, false)).toBe("Ожидание соперника");
  });

  // FR-9: пустой слот уже разрешённой пары — бай, соперник проходит дальше
  // без боя.
  it("labels an empty slot of a resolved pair as a bye", () => {
    const s = slot({ state: "BRACKET_SLOT_STATE_EMPTY" });
    expect(slotDisplayName(s, true)).toBe("Бай");
  });

  it("shows a dash for an empty slot of an unresolved pair (not yet seeded)", () => {
    const s = slot({ state: "BRACKET_SLOT_STATE_EMPTY" });
    expect(slotDisplayName(s, false)).toBe("—");
  });
});
