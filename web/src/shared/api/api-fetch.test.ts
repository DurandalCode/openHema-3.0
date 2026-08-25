import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api-fetch";
import { UnauthorizedError } from "./unauthorized";

describe("apiFetch", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws UnauthorizedError on a 401 response (spec 0039, T5) — outside the network try/catch", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) });

    await expect(apiFetch("/api/x")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError on a 401 even when the response body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    });

    await expect(apiFetch("/api/x")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns ok:false when the network request itself fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await apiFetch("/api/x");

    expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
  });

  it("resolves ok:true with the parsed JSON body on a successful response", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ value: 42 }) });

    const result = await apiFetch<{ value: number }>("/api/x");

    expect(result).toEqual({ ok: true, data: { value: 42 } });
  });

  it("returns ok:false with the server's error text on a non-401 4xx/5xx response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Имя занято" }),
    });

    const result = await apiFetch("/api/x");

    expect(result).toEqual({ ok: false, error: "Имя занято", status: 409 });
  });

  it("falls back to a generic error message when the error body has no error field", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const result = await apiFetch("/api/x");

    expect(result).toEqual({ ok: false, error: "Ошибка запроса", status: 500 });
  });

  it("passes input/init through to fetch unchanged", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await apiFetch("/api/x", { method: "POST", body: "{}" });

    expect(fetchMock).toHaveBeenCalledWith("/api/x", { method: "POST", body: "{}" });
  });
});
