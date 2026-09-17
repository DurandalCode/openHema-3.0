import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  SESSION_EXPIRED_COOKIE,
} from "@/shared/config/session-cookies";

/**
 * Тестов на middleware в проекте не было: спека 0038 сознательно покрыла
 * только чистые функции (`session-refresh.ts`), оставив сетевую часть без
 * тестов. После того как matcher расширили на `/api/*`, так оставлять
 * нельзя — самая дорогая ошибка здесь (рекурсивный вызов `/api/auth/refresh`
 * самим middleware) не ловится вообще ничем другим.
 */
function makeReq(path: string, cookie = ""): NextRequest {
  return new NextRequest(new URL(path, "http://localhost"), {
    headers: cookie ? { cookie } : {},
  });
}

function refreshResponse(setCookies: string[]): Response {
  const headers = new Headers();
  setCookies.forEach((c) => headers.append("set-cookie", c));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

const FRESH_COOKIES = [
  `${ACCESS_COOKIE}=new-access; Path=/; HttpOnly`,
  `${REFRESH_COOKIE}=new-refresh; Path=/; HttpOnly`,
];

describe("middleware — автопродление сессии", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => refreshResponse(FRESH_COOKIES)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not call /api/auth/refresh on the refresh route itself (recursion guard)", async () => {
    await middleware(makeReq("/api/auth/refresh", `${REFRESH_COOKIE}=r`));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("leaves the cookie-mutating auth routes alone", async () => {
    for (const path of ["/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/auth/password"]) {
      await middleware(makeReq(path, `${REFRESH_COOKIE}=r`));
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("skips the internal call while the access cookie is still alive", async () => {
    await middleware(makeReq("/dashboard", `${ACCESS_COOKIE}=a; ${REFRESH_COOKIE}=r`));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does nothing for a guest", async () => {
    const res = await middleware(makeReq("/"));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  // Ядро фикса: консоль арены висит на одном URL часами и не делает ни одной
  // навигации — продлевать сессию можно только на её запросах к BFF.
  it("refreshes on a BFF API request and forwards the fresh cookies to the browser", async () => {
    const res = await middleware(makeReq("/api/arenas/a1/timer-frame", `${REFRESH_COOKIE}=r`));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(url)).toBe("http://localhost/api/auth/refresh");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ cookie: `${REFRESH_COOKIE}=r` });

    const setCookies = res.headers.getSetCookie().join("\n");
    expect(setCookies).toContain(`${ACCESS_COOKIE}=new-access`);
    expect(setCookies).toContain(`${REFRESH_COOKIE}=new-refresh`);
  });

  it("refreshes on an SSE relay too, so the reconnect carries a live cookie", async () => {
    await middleware(makeReq("/api/arenas/a1/live", `${REFRESH_COOKIE}=r`));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("kills the session when the refresh endpoint answers 401 (the token is really dead)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));

    const res = await middleware(makeReq("/api/arenas/a1/timer-frame", `${REFRESH_COOKIE}=r`));

    const setCookies = res.headers.getSetCookie().join("\n");
    expect(setCookies).toContain(REFRESH_COOKIE);
    expect(setCookies).toContain(`${SESSION_EXPIRED_COOKIE}=1`);
  });

  // Раньше ЛЮБОЙ не-ok гасил сессию. На частоте «раз в навигацию» это было
  // терпимо; на 5 запросах в секунду один блип Go-сервера по-настоящему
  // разлогинивал бы секретаря посреди турнира.
  it("keeps the session intact when the refresh endpoint fails transiently (500)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));

    const res = await middleware(makeReq("/api/arenas/a1/timer-frame", `${REFRESH_COOKIE}=r`));

    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("keeps the session intact when the internal fetch throws (network blip)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const res = await middleware(makeReq("/api/arenas/a1/timer-frame", `${REFRESH_COOKIE}=r`));

    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});
