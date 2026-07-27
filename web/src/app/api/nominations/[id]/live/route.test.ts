import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  poolPublicClient: { watchNominationLive: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  nominationLiveToJson: vi.fn((s) => s ?? null),
}));

import { poolPublicClient } from "@/lib/grpc/client";
import { GET } from "./route";

function getReq(signal?: AbortSignal) {
  return new NextRequest("http://localhost/api/nominations/n1/live", { signal });
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value, done } = await reader.read();
  return { done, text: value ? new TextDecoder().decode(value) : "" };
}

describe("app/api/nominations/[id]/live route (SSE)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets SSE headers", async () => {
    async function* fake() {
      await new Promise(() => {});
    }
    vi.mocked(poolPublicClient.watchNominationLive).mockReturnValue(fake() as never);

    const controller = new AbortController();
    const res = await GET(getReq(controller.signal), { params: Promise.resolve({ id: "n1" }) });

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("Connection")).toBe("keep-alive");

    controller.abort();
  });

  it("frames each snapshot from the connect async iterable as data: ...\\n\\n", async () => {
    async function* fake() {
      yield { snapshot: { nominationId: "n1", pools: [] } };
      yield {
        snapshot: {
          nominationId: "n1",
          pools: [{ pool: { id: "p1" }, bouts: [], currentBoutId: "" }],
        },
      };
      await new Promise(() => {});
    }
    vi.mocked(poolPublicClient.watchNominationLive).mockReturnValue(fake() as never);

    const controller = new AbortController();
    const req = getReq(controller.signal);
    const res = await GET(req, { params: Promise.resolve({ id: "n1" }) });
    const reader = res.body!.getReader();

    const chunk1 = await readChunk(reader);
    expect(chunk1.done).toBe(false);
    expect(chunk1.text).toBe(`data: ${JSON.stringify({ nominationId: "n1", pools: [] })}\n\n`);

    const chunk2 = await readChunk(reader);
    expect(chunk2.text.startsWith("data: ")).toBe(true);
    expect(chunk2.text.endsWith("\n\n")).toBe(true);
    expect(chunk2.text).toContain('"currentBoutId":""');

    const call = vi.mocked(poolPublicClient.watchNominationLive).mock.calls[0];
    expect(call[0]).toEqual({ nominationId: "n1" });
    expect(call[1]?.signal).toBe(req.signal);

    controller.abort();
  });

  it("sends a heartbeat ping every ~20s while idle", async () => {
    vi.useFakeTimers();
    async function* fake() {
      await new Promise(() => {});
    }
    vi.mocked(poolPublicClient.watchNominationLive).mockReturnValue(fake() as never);

    const controller = new AbortController();
    const res = await GET(getReq(controller.signal), { params: Promise.resolve({ id: "n1" }) });
    const reader = res.body!.getReader();

    const readPromise = readChunk(reader);
    await vi.advanceTimersByTimeAsync(20000);
    const { text } = await readPromise;
    expect(text).toBe(": ping\n\n");

    controller.abort();
  });

  it("cleans up (closes the stream) when the client disconnects via req.signal", async () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    async function* fake(_req: unknown, opts?: { signal?: AbortSignal }) {
      yield { snapshot: { nominationId: "n1", pools: [] } };
      await new Promise<never>((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }
    vi.mocked(poolPublicClient.watchNominationLive).mockImplementation(
      ((req: unknown, opts?: { signal?: AbortSignal }) => fake(req, opts)) as never,
    );

    const controller = new AbortController();
    const res = await GET(getReq(controller.signal), { params: Promise.resolve({ id: "n1" }) });
    const reader = res.body!.getReader();

    const first = await readChunk(reader);
    expect(first.done).toBe(false);

    controller.abort();

    const next = await readChunk(reader);
    expect(next.done).toBe(true);
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
