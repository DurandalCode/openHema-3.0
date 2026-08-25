import { describe, expect, it } from "vitest";
import { publicNavItems } from "./public-nav-items";

describe("publicNavItems", () => {
  describe("before", () => {
    it("gives a guest the pre-start set (spec 0039, FR-6)", () => {
      expect(publicNavItems({ phase: "before", isAuthenticated: false })).toEqual([
        { title: "Турнир", href: "/#tournament" },
        { title: "Номинации", href: "/#nominations" },
        { title: "О турнире", href: "/about" },
      ]);
    });

    it("adds 'Мои заявки' for a signed-in user (FR-6)", () => {
      expect(publicNavItems({ phase: "before", isAuthenticated: true })).toEqual([
        { title: "Турнир", href: "/#tournament" },
        { title: "Номинации", href: "/#nominations" },
        { title: "О турнире", href: "/about" },
        { title: "Мои заявки", href: "/applications" },
      ]);
    });
  });

  describe("running", () => {
    it("gives a guest the live set (FR-8)", () => {
      expect(publicNavItems({ phase: "running", isAuthenticated: false })).toEqual([
        { title: "Сейчас", href: "/#arenas-now" },
        { title: "Номинации", href: "/#nominations-rail" },
        { title: "О турнире", href: "/about" },
      ]);
    });

    it("adds 'Кабинет' for a signed-in user (FR-9)", () => {
      expect(publicNavItems({ phase: "running", isAuthenticated: true })).toEqual([
        { title: "Сейчас", href: "/#arenas-now" },
        { title: "Номинации", href: "/#nominations-rail" },
        { title: "О турнире", href: "/about" },
        { title: "Кабинет", href: "/dashboard" },
      ]);
    });

    it("has no items pointing at #tournament or #nominations — those sections don't exist in this phase (AC-4)", () => {
      for (const isAuthenticated of [false, true]) {
        const items = publicNavItems({ phase: "running", isAuthenticated });
        const hrefs = items.map((i) => i.href);
        expect(hrefs).not.toContain("/#tournament");
        expect(hrefs).not.toContain("/#nominations");
      }
    });
  });

  describe("finished", () => {
    it("gives a guest the results set", () => {
      expect(publicNavItems({ phase: "finished", isAuthenticated: false })).toEqual([
        { title: "Итоги", href: "/#bout-feed" },
        { title: "Номинации", href: "/#nominations-rail" },
        { title: "О турнире", href: "/about" },
      ]);
    });

    it("adds 'Мои заявки' for a signed-in user", () => {
      expect(publicNavItems({ phase: "finished", isAuthenticated: true })).toEqual([
        { title: "Итоги", href: "/#bout-feed" },
        { title: "Номинации", href: "/#nominations-rail" },
        { title: "О турнире", href: "/about" },
        { title: "Мои заявки", href: "/applications" },
      ]);
    });
  });
});
