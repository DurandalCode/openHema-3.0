import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { watchArenaBoard: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  arenaLiveToJson: vi.fn((s) => s ?? null),
  timerCommandToJson: vi.fn((c) => c ?? null),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { ScoreboardRole } from "@/gen/hema/v1/pool_pb";
import { GET } from "./route";

function getReq(url: string, signal?: AbortSignal) {
  return new NextRequest(url, { signal });
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value, done } = await reader.read();
  return { done, text: value ? new TextDecoder().decode(value) : "" };
}

describe("app/api/arenas/[id]/live route (SSE, admin-only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await GET(getReq("http://localhost/api/arenas/a1/live"), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(res.status).toBe(401);
    expect(poolAdminClient.watchArenaBoard).not.toHaveBeenCalled();
  });

  it("sets SSE headers", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    async function* fake() {
      await new Promise(() => {});
    }
    vi.mocked(poolAdminClient.watchArenaBoard).mockReturnValue(fake() as never);

    const controller = new AbortController();
    const res = await GET(getReq("http://localhost/api/arenas/a1/live", controller.signal), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("Connection")).toBe("keep-alive");

    controller.abort();
  });

  it("frames snapshot and command oneof events with a type discriminant", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    async function* fake() {
      yield { event: { case: "snapshot" as const, value: { board: null } } };
      yield {
        event: { case: "command" as const, value: { kind: "TIMER_COMMAND_KIND_START", amountSeconds: 0 } },
      };
      await new Promise(() => {});
    }
    vi.mocked(poolAdminClient.watchArenaBoard).mockReturnValue(fake() as never);

    const controller = new AbortController();
    const req = getReq("http://localhost/api/arenas/a1/live?role=scoreboard", controller.signal);
    const res = await GET(req, { params: Promise.resolve({ id: "a1" }) });
    const reader = res.body!.getReader();

    const chunk1 = await readChunk(reader);
    expect(chunk1.done).toBe(false);
    expect(chunk1.text).toBe(`data: ${JSON.stringify({ type: "snapshot", snapshot: { board: null } })}\n\n`);

    const chunk2 = await readChunk(reader);
    expect(chunk2.text).toBe(
      `data: ${JSON.stringify({
        type: "command",
        command: { kind: "TIMER_COMMAND_KIND_START", amountSeconds: 0 },
      })}\n\n`,
    );

    const call = vi.mocked(poolAdminClient.watchArenaBoard).mock.calls[0];
    expect(call[0]).toEqual({ arenaId: "a1", role: ScoreboardRole.SCOREBOARD });
    expect(call[1]?.signal).toBe(req.signal);
    expect(call[1]?.headers).toEqual({ Authorization: "Bearer token" });

    controller.abort();
  });

  it("maps ?role=panel and an unknown/missing role to ScoreboardRole.PANEL", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    async function* fake() {
      await new Promise(() => {});
    }
    vi.mocked(poolAdminClient.watchArenaBoard).mockReturnValue(fake() as never);

    const controller1 = new AbortController();
    await GET(getReq("http://localhost/api/arenas/a1/live?role=panel", controller1.signal), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(vi.mocked(poolAdminClient.watchArenaBoard).mock.calls[0][0]).toEqual({
      arenaId: "a1",
      role: ScoreboardRole.PANEL,
    });
    controller1.abort();

    vi.mocked(poolAdminClient.watchArenaBoard).mockClear();
    vi.mocked(poolAdminClient.watchArenaBoard).mockReturnValue(fake() as never);
    const controller2 = new AbortController();
    await GET(getReq("http://localhost/api/arenas/a1/live", controller2.signal), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(vi.mocked(poolAdminClient.watchArenaBoard).mock.calls[0][0]).toEqual({
      arenaId: "a1",
      role: ScoreboardRole.PANEL,
    });
    controller2.abort();
  });

  it("sends a heartbeat ping every ~20s while idle", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.useFakeTimers();
    async function* fake() {
      await new Promise(() => {});
    }
    vi.mocked(poolAdminClient.watchArenaBoard).mockReturnValue(fake() as never);

    const controller = new AbortController();
    const res = await GET(getReq("http://localhost/api/arenas/a1/live", controller.signal), {
      params: Promise.resolve({ id: "a1" }),
    });
    const reader = res.body!.getReader();

    const readPromise = readChunk(reader);
    await vi.advanceTimersByTimeAsync(20000);
    const { text } = await readPromise;
    expect(text).toBe(": ping\n\n");

    controller.abort();
  });

  it("cleans up (closes the stream) when the client disconnects via req.signal", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    async function* fake(_req: unknown, opts?: { signal?: AbortSignal }) {
      yield { event: { case: "snapshot" as const, value: { board: null } } };
      await new Promise<never>((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }
    vi.mocked(poolAdminClient.watchArenaBoard).mockImplementation(
      ((req: unknown, opts?: { signal?: AbortSignal }) => fake(req, opts)) as never,
    );

    const controller = new AbortController();
    const req = getReq("http://localhost/api/arenas/a1/live", controller.signal);
    const res = await GET(req, { params: Promise.resolve({ id: "a1" }) });
    const reader = res.body!.getReader();

    const first = await readChunk(reader);
    expect(first.done).toBe(false);

    controller.abort();

    const next = await readChunk(reader);
    expect(next.done).toBe(true);
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
