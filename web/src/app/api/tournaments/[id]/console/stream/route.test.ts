import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { watchTournamentConsole: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  consoleSnapshotToJson: vi.fn((s) => s ?? null),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function getReq(signal?: AbortSignal) {
  return new NextRequest("http://localhost/api/tournaments/t1/console/stream", { signal });
}

function ctx() {
  return { params: Promise.resolve({ id: "t1" }) };
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value, done } = await reader.read();
  return { done, text: value ? new TextDecoder().decode(value) : "" };
}

describe("app/api/tournaments/[id]/console/stream route (SSE)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 without opening a stream when there is no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(401);
    expect(stageAdminClient.watchTournamentConsole).not.toHaveBeenCalled();
    expect(res.headers.get("Content-Type")).not.toBe("text/event-stream");
  });

  it("sets SSE headers", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    async function* fake() {
      await new Promise(() => {});
    }
    vi.mocked(stageAdminClient.watchTournamentConsole).mockReturnValue(fake() as never);

    const controller = new AbortController();
    const res = await GET(getReq(controller.signal), ctx());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("Connection")).toBe("keep-alive");

    controller.abort();
  });

  it("frames each snapshot as data: ...\\n\\n, using the path tournament id and Bearer auth", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    async function* fake() {
      yield { snapshot: { tournamentId: "t1", arenas: [] } };
      await new Promise(() => {});
    }
    vi.mocked(stageAdminClient.watchTournamentConsole).mockReturnValue(fake() as never);

    const controller = new AbortController();
    const req = getReq(controller.signal);
    const res = await GET(req, ctx());
    const reader = res.body!.getReader();

    const chunk1 = await readChunk(reader);
    expect(chunk1.done).toBe(false);
    expect(chunk1.text).toBe(`data: ${JSON.stringify({ tournamentId: "t1", arenas: [] })}\n\n`);

    const call = vi.mocked(stageAdminClient.watchTournamentConsole).mock.calls[0];
    expect(call[0]).toEqual({ tournamentId: "t1" });
    expect(call[1]?.headers).toEqual({ Authorization: "Bearer token" });
    expect(call[1]?.signal).toBe(req.signal);

    controller.abort();
  });

  it("sends a heartbeat ping every ~20s while idle", async () => {
    vi.useFakeTimers();
    vi.mocked(getAccessToken).mockResolvedValue("token");
    async function* fake() {
      await new Promise(() => {});
    }
    vi.mocked(stageAdminClient.watchTournamentConsole).mockReturnValue(fake() as never);

    const controller = new AbortController();
    const res = await GET(getReq(controller.signal), ctx());
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
      await new Promise<void>((resolve) => {
        opts?.signal?.addEventListener("abort", () => resolve());
      });
    }
    vi.mocked(stageAdminClient.watchTournamentConsole).mockImplementation(fake as never);

    const controller = new AbortController();
    const req = getReq(controller.signal);
    const res = await GET(req, ctx());
    const reader = res.body!.getReader();

    controller.abort();
    const { done } = await reader.read();
    expect(done).toBe(true);
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
