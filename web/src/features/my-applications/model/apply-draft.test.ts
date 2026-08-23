// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDraft, hasAnyDraft, loadDraft, saveDraft } from "./apply-draft";

type DraftData = { club: string; needsEquipment: boolean };

const DRAFT: DraftData = { club: "Стальной град", needsEquipment: true };

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("features/my-applications/model apply-draft", () => {
  it("saveDraft + loadDraft round-trips equivalent data (FR-19)", () => {
    saveDraft("n1", DRAFT);

    expect(loadDraft<DraftData>("n1")).toEqual(DRAFT);
  });

  it("keeps drafts of different nominations isolated (FR-21)", () => {
    saveDraft("n1", DRAFT);
    saveDraft("n2", { club: "Другой клуб", needsEquipment: false });

    expect(loadDraft<DraftData>("n1")).toEqual(DRAFT);
    expect(loadDraft<DraftData>("n2")).toEqual({ club: "Другой клуб", needsEquipment: false });
  });

  it("clearDraft removes only its own key, leaving other nominations intact (FR-21)", () => {
    saveDraft("n1", DRAFT);
    saveDraft("n2", { club: "Другой клуб", needsEquipment: false });

    clearDraft("n1");

    expect(loadDraft<DraftData>("n1")).toBeNull();
    expect(loadDraft<DraftData>("n2")).toEqual({ club: "Другой клуб", needsEquipment: false });
  });

  it("loadDraft returns null for a missing key", () => {
    expect(loadDraft<DraftData>("absent")).toBeNull();
  });

  it("loadDraft returns null (not a throw) for corrupted JSON", () => {
    window.localStorage.setItem("hema:apply-draft:n1", "{not valid json");

    expect(loadDraft<DraftData>("n1")).toBeNull();
  });

  it("hasAnyDraft is false with nothing saved and true once a draft exists", () => {
    expect(hasAnyDraft()).toBe(false);

    saveDraft("n1", DRAFT);

    expect(hasAnyDraft()).toBe(true);
  });

  it("hasAnyDraft becomes false again after the only draft is cleared", () => {
    saveDraft("n1", DRAFT);
    clearDraft("n1");

    expect(hasAnyDraft()).toBe(false);
  });

  describe("when localStorage is unavailable", () => {
    it("saveDraft/loadDraft/clearDraft/hasAnyDraft never throw, and read as empty", () => {
      const getter = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
        throw new Error("localStorage disabled (private mode)");
      });

      expect(() => saveDraft("n1", DRAFT)).not.toThrow();
      expect(() => loadDraft<DraftData>("n1")).not.toThrow();
      expect(loadDraft<DraftData>("n1")).toBeNull();
      expect(() => clearDraft("n1")).not.toThrow();
      expect(() => hasAnyDraft()).not.toThrow();
      expect(hasAnyDraft()).toBe(false);

      getter.mockRestore();
    });
  });
});
