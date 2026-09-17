import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * no-direct-fetch guard (спека 0039, T9, NFR-5) — страж, не прецедент.
 *
 * Правило FR-17 («любой клиентский запрос, получивший 401, приводит к
 * диалогу «Сессия истекла») держится на том, что каждый fetcher вызывает
 * `apiFetch` (`shared/api/api-fetch.ts`), а не голый `fetch(...)`: только
 * `apiFetch` бросает `UnauthorizedError` вне сетевого `try/catch`. Без
 * этого теста правило держится на памяти автора следующей фичи — ровно тот
 * технический долг, который спека 0039 закрывает (NFR-5: «новый запрос
 * получает его по умолчанию, а не если автор не забыл»).
 *
 * Проверка — по фиксированному списку каталогов `features/<f>/api/`, не
 * рекурсивным `glob`: в репозитории нет прецедента тестов, читающих
 * исходники (см. риски `plan.md`), и фиксированный список надёжнее на CI,
 * чем обход файловой системы. Список ниже — все директории `features/*`
 * репозитория на момент написания теста (совпадает с выводом
 * `ls src/features`); если появится новая фича с `api/`, её нужно добавить
 * сюда явно — тот же принцип «по умолчанию», применённый к самому стражу.
 *
 * Внутри каждого `api/` каталог плоский (без вложенных папок) — все
 * фетчеры и хуки лежат непосредственно в нём.
 */

const FEATURES_DIR = join(__dirname, "..", "..", "features");

const FEATURE_NAMES = [
  "admin",
  "application-review",
  "arena-journal",
  "arena-live",
  "arena-management",
  "arena-timer",
  "auth",
  "bout-board",
  "bracket-seeding",
  "fighter-management",
  "format-presets",
  "my-applications",
  "nomination-live",
  "nomination-management",
  "nomination-pools",
  "pool-seating",
  "profile",
  "stage-build",
  "stage-management",
  "tournament-live",
  "tournament-settings",
];

/**
 * ALLOWLIST — ровно 4 файла, которым разрешён прямой `fetch(...)`:
 * - `auth/api/requests.ts` (FR-19): 401 там значит «неверные учётные
 *   данные», а не «сессия истекла» — это не баг, а другая семантика.
 * - три публичных живых хука (FR-20): без сессии, `apiFetch`'ное
 *   поведение на 401 им не нужно и не подходит.
 *
 * Было пять: `nomination-live/api/use-live-snapshot.ts` удалён спекой 0051 —
 * после перевода экрана этапа на живой канал у него не осталось ни одного
 * потребителя.
 */
const ALLOWLIST = new Set([
  "auth/api/requests.ts",
  "arena-live/api/use-arena-live.ts",
  "tournament-live/api/use-tournament-live.ts",
  "nomination-live/api/use-nomination-live.ts",
]);

/** DIRECT_FETCH_RE — `fetch(` как отдельное слово: не матчит `apiFetch(`/`refetch(`. */
const DIRECT_FETCH_RE = /\bfetch\(/;

function listApiFiles(feature: string): string[] {
  const apiDir = join(FEATURES_DIR, feature, "api");
  let entries: string[];
  try {
    entries = readdirSync(apiDir);
  } catch {
    return [];
  }
  return entries.filter(
    (name) =>
      (name.endsWith(".ts") || name.endsWith(".tsx")) &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".test.tsx"),
  );
}

describe("features/*/api — no direct fetch(...) outside the allowlist (spec 0039, NFR-5)", () => {
  for (const feature of FEATURE_NAMES) {
    for (const file of listApiFiles(feature)) {
      const relPath = `${feature}/api/${file}`;
      const isAllowed = ALLOWLIST.has(relPath);

      it(`${relPath}${isAllowed ? " (allowlisted)" : ""}`, () => {
        const content = readFileSync(join(FEATURES_DIR, feature, "api", file), "utf8");
        const callsFetchDirectly = DIRECT_FETCH_RE.test(content);

        if (isAllowed) {
          expect(callsFetchDirectly).toBe(true);
        } else {
          expect(callsFetchDirectly).toBe(false);
        }
      });
    }
  }

  it("the allowlist names exactly 4 files, all of which exist under features/*/api", () => {
    expect(ALLOWLIST.size).toBe(4);
    for (const relPath of ALLOWLIST) {
      const [feature, , file] = relPath.split("/");
      expect(listApiFiles(feature)).toContain(file);
    }
  });
});
