import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  tournamentClient: { getActiveTournament: vi.fn() },
  stagePublicClient: { watchTournamentLive: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  tournamentLiveToJson: vi.fn((s) => s ?? null),
}));

import { tournamentClient, stagePublicClient } from "@/lib/grpc/client";
import { GET } from "./route";

function getReq(signal?: AbortSignal) {
  return new NextRequest("http://localhost/api/tournament/live", { signal });
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value, done } = await reader.read();
  return { done, text: value ? new TextDecoder().decode(value) : "" };
}

describe("app/api/tournament/live route (SSE)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves the active tournament first, and returns 404 without opening a stream when there is none", async () => {
    vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
      tournament: undefined,
    } as never);

    const res = await GET(getReq());
    expect(res.status).toBe(404);
    expect(stagePublicClient.watchTournamentLive).not.toHaveBeenCalled();
    expect(res.headers.get("Content-Type")).not.toBe("text/event-stream");
  });

  it("sets SSE headers", async () => {
    vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
      tournament: { id: "t1" },
    } as never);
    async function* fake() {
      await new Promise(() => {});
    }
    vi.mocked(stagePublicClient.watchTournamentLive).mockReturnValue(fake() as never);

    const controller = new AbortController();
    const res = await GET(getReq(controller.signal));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("Connection")).toBe("keep-alive");

    controller.abort();
  });

  it("frames each snapshot from the connect async iterable as data: ...\\n\\n, using the resolved tournament id", async () => {
    vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
      tournament: { id: "t1" },
    } as never);
    async function* fake() {
      yield { snapshot: { tournamentId: "t1", arenas: [], bouts: [], nominations: [] } };
      await new Promise(() => {});
    }
    vi.mocked(stagePublicClient.watchTournamentLive).mockReturnValue(fake() as never);

    const controller = new AbortController();
    const req = getReq(controller.signal);
    const res = await GET(req);
    const reader = res.body!.getReader();

    const chunk1 = await readChunk(reader);
    expect(chunk1.done).toBe(false);
    expect(chunk1.text).toBe(
      `data: ${JSON.stringify({ tournamentId: "t1", arenas: [], bouts: [], nominations: [] })}\n\n`,
    );

    const call = vi.mocked(stagePublicClient.watchTournamentLive).mock.calls[0];
    expect(call[0]).toEqual({ tournamentId: "t1" });
    expect(call[1]?.signal).toBe(req.signal);

    controller.abort();
  });

  it("sends a heartbeat ping every ~20s while idle", async () => {
    vi.useFakeTimers();
    vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
      tournament: { id: "t1" },
    } as never);
    async function* fake() {
      await new Promise(() => {});
    }
    vi.mocked(stagePublicClient.watchTournamentLive).mockReturnValue(fake() as never);

    const controller = new AbortController();
    const res = await GET(getReq(controller.signal));
    const reader = res.body!.getReader();

    const readPromise = readChunk(reader);
    await vi.advanceTimersByTimeAsync(20000);
    const { text } = await readPromise;
    expect(text).toBe(": ping\n\n");

    controller.abort();
  });

  it("cleans up (closes the stream) when the client disconnects via req.signal", async () => {
    vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
      tournament: { id: "t1" },
    } as never);
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    async function* fake(_req: unknown, opts?: { signal?: AbortSignal }) {
      yield { snapshot: { tournamentId: "t1", arenas: [], bouts: [], nominations: [] } };
      await new Promise<never>((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }
    vi.mocked(stagePublicClient.watchTournamentLive).mockImplementation(
      ((req: unknown, opts?: { signal?: AbortSignal }) => fake(req, opts)) as never,
    );

    const controller = new AbortController();
    const res = await GET(getReq(controller.signal));
    const reader = res.body!.getReader();

    const first = await readChunk(reader);
    expect(first.done).toBe(false);

    controller.abort();

    const next = await readChunk(reader);
    expect(next.done).toBe(true);
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
