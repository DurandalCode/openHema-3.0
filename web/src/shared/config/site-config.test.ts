import { describe, expect, it } from "vitest";
import { siteConfig } from "./site-config";

/**
 * Якоря секций, реально существующих на главной (src/app/page.tsx).
 * Список — единственное место, которое надо обновить при добавлении/удалении
 * секции; тест ловит рассинхрон между навигацией и реальными секциями (FR-3).
 */
const KNOWN_PAGE_ANCHORS = new Set(["tournament"]);

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
});
