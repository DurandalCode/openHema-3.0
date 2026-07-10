import { describe, expect, it } from "vitest";
import { siteConfig } from "./site-config";

/**
 * Якоря секций, реально существующих на главной (src/app/page.tsx), и роуты,
 * реально существующие в src/app/**. Список — единственное место, которое надо
 * обновить при добавлении/удалении секции/страницы; тест ловит рассинхрон
 * между навигацией и реальными целями (FR-5/AC-7 из 0004-ui-flow).
 */
const KNOWN_PAGE_ANCHORS = new Set(["tournament", "nominations"]);
const KNOWN_ROUTES = new Set(["/about"]);

describe("siteConfig.navItems", () => {
  it("is not empty", () => {
    expect(siteConfig.navItems.length).toBeGreaterThan(0);
  });

  it("has no items pointing to non-existent in-page anchors", () => {
    for (const item of siteConfig.navItems) {
      if (item.href.startsWith("#")) {
        const id = item.href.slice(1);
        expect(KNOWN_PAGE_ANCHORS.has(id)).toBe(true);
      }
    }
  });

  it("has no items pointing to non-existent routes", () => {
    for (const item of siteConfig.navItems) {
      if (item.href.startsWith("/")) {
        expect(KNOWN_ROUTES.has(item.href)).toBe(true);
      }
    }
  });
});
