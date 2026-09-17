// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attemptSilentRefresh,
  recoverSessionOrNotify,
  resetSilentRefreshStateForTests,
} from "./silent-refresh";
import { useSessionExpiredStore } from "./session-expired-store";

const T0 = 1_700_000_000_000;

describe("attemptSilentRefresh", () => {
  beforeEach(() => {
    resetSilentRefreshStateForTests();
    useSessionExpiredStore.getState().close();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("POSTs /api/auth/refresh and reports success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));

    await expect(attemptSilentRefresh()).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith("/api/auth/refresh", { method: "POST" });
  });

  it("reports failure on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await expect(attemptSilentRefresh()).resolves.toBe(false);
  });

  it("reports failure when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(attemptSilentRefresh()).resolves.toBe(false);
  });

  it("shares a single in-flight POST across concurrent callers", async () => {
    let release: (v: { ok: boolean }) => void = () => {};
    const pending = new Promise<{ ok: boolean }>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => pending));

    const all = Promise.all([attemptSilentRefresh(), attemptSilentRefresh(), attemptSilentRefresh()]);
    release({ ok: true });

    expect(await all).toEqual([true, true, true]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("starts a new POST after the previous one settled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));

    await attemptSilentRefresh();
    await attemptSilentRefresh();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("recoverSessionOrNotify", () => {
  let now = T0;

  beforeEach(() => {
    now = T0;
    resetSilentRefreshStateForTests();
    useSessionExpiredStore.getState().close();
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns true and leaves the dialog closed when the refresh succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));

    await expect(recoverSessionOrNotify()).resolves.toBe(true);
    expect(useSessionExpiredStore.getState().isOpen).toBe(false);
  });

  it("opens the session-expired dialog when the refresh fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

    await expect(recoverSessionOrNotify()).resolves.toBe(false);
    expect(useSessionExpiredStore.getState().isOpen).toBe(true);
    expect(useSessionExpiredStore.getState().reason).toBe("query");
  });

  // Главная защита от бури: консоль арены шлёт кадр каждые ~200мс, и без
  // cooldown это 5 обречённых POST в секунду навсегда.
  it("does not hit /api/auth/refresh again during the cooldown after a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

    for (let i = 0; i < 10; i += 1) {
      now += 200;
      await expect(recoverSessionOrNotify()).resolves.toBe(false);
    }

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("tries again once the cooldown has elapsed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

    await recoverSessionOrNotify();
    now += 30_001;
    await recoverSessionOrNotify();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("recovers silently when a later attempt succeeds (another tab re-logged in)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false }));
    vi.stubGlobal("fetch", fetchMock);
    await recoverSessionOrNotify();
    useSessionExpiredStore.getState().close();

    fetchMock.mockResolvedValue({ ok: true });
    now += 30_001;

    await expect(recoverSessionOrNotify()).resolves.toBe(true);
    expect(useSessionExpiredStore.getState().isOpen).toBe(false);
  });

  it("does not re-open the dialog on every suppressed call", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await recoverSessionOrNotify();
    useSessionExpiredStore.getState().close();

    now += 1000;
    await recoverSessionOrNotify();

    expect(useSessionExpiredStore.getState().isOpen).toBe(false);
  });
});
