import { describe, expect, it } from "vitest";
import { siteConfig } from "./site-config";
import { publicNavItems } from "@/shared/lib/public-nav-items";
import type { TournamentPhase } from "@/entities/tournament-live/lib/phase";

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

/**
 * publicNavItems по фазам (спека 0039, T14, AC-4) — расширение прецедента
 * выше на все три фазы турнира, а не только «до старта». Для каждой фазы
 * своё множество якорей, потому что `widgets/home/home-screen.tsx`
 * рендерит разные секции в разных фазах (0034): `running`/`finished` не
 * несут `#tournament`/`#nominations`, `before` не несёт `#arenas-now`/
 * `#nominations-rail`/`#bout-feed`. Роуты, добавляемые вошедшему
 * (`/applications`, `/dashboard`), — тоже реально существующие страницы
 * (`src/app/applications`, `src/app/dashboard`).
 */
const KNOWN_PAGE_ANCHORS_BY_PHASE: Record<TournamentPhase, Set<string>> = {
  before: new Set(["tournament", "nominations"]),
  running: new Set(["arenas-now", "nominations-rail"]),
  finished: new Set(["bout-feed", "nominations-rail"]),
};
const KNOWN_ROUTES_WITH_AUTH = new Set(["/", "/about", "/applications", "/dashboard"]);

describe("publicNavItems (spec 0039)", () => {
  const phases: TournamentPhase[] = ["before", "running", "finished"];

  for (const phase of phases) {
    for (const isAuthenticated of [false, true]) {
      it(`${phase}/isAuthenticated=${isAuthenticated}: only points at anchors that exist on the page in this phase`, () => {
        const items = publicNavItems({ phase, isAuthenticated });
        for (const item of items) {
          const { anchor } = splitHref(item.href);
          if (anchor !== null) {
            expect(KNOWN_PAGE_ANCHORS_BY_PHASE[phase].has(anchor)).toBe(true);
          }
        }
      });

      it(`${phase}/isAuthenticated=${isAuthenticated}: only points at routes that exist`, () => {
        const items = publicNavItems({ phase, isAuthenticated });
        for (const item of items) {
          const { route } = splitHref(item.href);
          if (route.startsWith("/")) {
            expect(KNOWN_ROUTES_WITH_AUTH.has(route)).toBe(true);
          }
        }
      });
    }
  }
});
