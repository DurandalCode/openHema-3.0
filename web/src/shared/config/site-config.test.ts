import { describe, expect, it } from "vitest";
import { siteConfig } from "./site-config";

/**
 * Якоря секций, реально существующих на главной (src/app/page.tsx), и роуты,
 * реально существующие в src/app/**. Список — единственное место, которое надо
 * обновить при добавлении/удалении секции/страницы; тест ловит рассинхрон
 * между навигацией и реальными целями (FR-5/AC-7 из 0004-ui-flow).
 *
 * Якорные пункты — абсолютный путь с якорем (`/#id`), а не голый `#id`
 * (иначе переход с другой страницы ищет якорь на текущей странице, а не на
 * главной). Роут перед `#` и id секции после `#` проверяются раздельно.
 */
const KNOWN_PAGE_ANCHORS = new Set(["tournament", "nominations"]);
const KNOWN_ROUTES = new Set(["/", "/about"]);

function splitHref(href: string): { route: string; anchor: string | null } {
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) return { route: href, anchor: null };
  return { route: href.slice(0, hashIndex), anchor: href.slice(hashIndex + 1) };
}

describe("siteConfig.navItems", () => {
  it("is not empty", () => {
    expect(siteConfig.navItems.length).toBeGreaterThan(0);
  });

  it("has no items pointing to non-existent in-page anchors", () => {
    for (const item of siteConfig.navItems) {
      const { anchor } = splitHref(item.href);
      if (anchor !== null) {
        expect(KNOWN_PAGE_ANCHORS.has(anchor)).toBe(true);
      }
    }
  });

  it("has no items pointing to non-existent routes", () => {
    for (const item of siteConfig.navItems) {
      const { route } = splitHref(item.href);
      if (route.startsWith("/")) {
        expect(KNOWN_ROUTES.has(route)).toBe(true);
      }
    }
  });
});
