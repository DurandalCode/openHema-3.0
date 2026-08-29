import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(): NextRequest {
  return new NextRequest("http://localhost/api/files/abc123", { method: "GET" });
}

describe("app/api/files/[id] route (spec 0042, T37)", () => {
  const originalEnv = process.env.SERVER_GRPC_URL;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.SERVER_GRPC_URL = originalEnv;
  });

  it("proxies the file, preserving Content-Type/nosniff/Content-Disposition", async () => {
    process.env.SERVER_GRPC_URL = "http://go-server:8080";
    const upstreamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("%PDF-1.4 fake content"));
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(upstreamBody, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline",
        },
      }),
    );

    const res = await GET(req(), ctx("abc123"));

    expect(fetch).toHaveBeenCalledWith("http://go-server:8080/files/abc123");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Disposition")).toBe("inline");
    const text = await res.text();
    expect(text).toBe("%PDF-1.4 fake content");
  });

  it("defaults to http://localhost:8080 when SERVER_GRPC_URL is unset", async () => {
    delete process.env.SERVER_GRPC_URL;
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await GET(req(), ctx("xyz"));

    expect(fetch).toHaveBeenCalledWith("http://localhost:8080/files/xyz");
  });

  it("propagates a 404 from the upstream server", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("404 page not found\n", { status: 404 }),
    );

    const res = await GET(req(), ctx("missing"));

    expect(res.status).toBe(404);
  });
});
