import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getRefreshToken: vi.fn(),
  setSessionCookies: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  authClient: { refresh: vi.fn() },
}));

import { authClient } from "@/lib/grpc/client";
import { getRefreshToken, setSessionCookies } from "@/lib/session/cookies";
import { POST } from "./route";

describe("app/api/auth/refresh route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401s when there is no refresh cookie", async () => {
    vi.mocked(getRefreshToken).mockResolvedValue(undefined);

    const res = await POST();

    expect(res.status).toBe(401);
    expect(setSessionCookies).not.toHaveBeenCalled();
  });

  it("sets the fresh pair and answers ok", async () => {
    vi.mocked(getRefreshToken).mockResolvedValue("r");
    vi.mocked(authClient.refresh).mockResolvedValue({
      tokens: { accessToken: "a2", refreshToken: "r2" },
    } as Awaited<ReturnType<typeof authClient.refresh>>);

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setSessionCookies).toHaveBeenCalledWith("a2", "r2");
  });

  /**
   * Ловушка, из-за которой протухшая сессия выглядела продлённой: при пустом
   * `tokens` роут отдавал 200 `{ok:true}`, не обновив куки, и вызывающий
   * (middleware, `attemptSilentRefresh`) считал это успехом.
   *
   * Отвечаем 502, а НЕ 401: по контракту `Service.Refresh` успех всегда
   * несёт пару токенов, значит пустой `tokens` — сломанный апстрим, а не
   * мёртвая сессия. Разница существенна: на 401 middleware гасит живую
   * refresh-куку.
   */
  it("answers 502 and leaves cookies alone when the server returns no tokens", async () => {
    vi.mocked(getRefreshToken).mockResolvedValue("r");
    vi.mocked(authClient.refresh).mockResolvedValue({} as Awaited<
      ReturnType<typeof authClient.refresh>
    >);

    const res = await POST();

    expect(res.status).toBe(502);
    expect(setSessionCookies).not.toHaveBeenCalled();
  });

  it("maps an RPC failure through errorResponse instead of answering ok", async () => {
    vi.mocked(getRefreshToken).mockResolvedValue("r");
    vi.mocked(authClient.refresh).mockRejectedValue(new Error("boom"));

    const res = await POST();

    expect(res.status).not.toBe(200);
    expect(setSessionCookies).not.toHaveBeenCalled();
  });
});
