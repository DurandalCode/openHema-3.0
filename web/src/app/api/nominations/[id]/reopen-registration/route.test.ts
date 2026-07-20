import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  nominationAdminClient: { reopenRegistration: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  nominationToJson: vi.fn((n) => n),
}));

import { nominationAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { nominationToJson } from "@/lib/grpc/serialize";
import { POST } from "./route";

describe("app/api/nominations/[id]/reopen-registration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const req = new NextRequest("http://localhost/api/nominations/n1/reopen-registration", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
    expect(nominationAdminClient.reopenRegistration).not.toHaveBeenCalled();
  });

  it("reopens registration and returns JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(nominationAdminClient.reopenRegistration).mockResolvedValue({
      nomination: { id: "n1", status: "NOMINATION_STATUS_OPEN" },
    } as never);
    vi.mocked(nominationToJson).mockReturnValue({
      id: "n1",
      status: "NOMINATION_STATUS_OPEN",
    } as never);

    const req = new NextRequest("http://localhost/api/nominations/n1/reopen-registration", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ nomination: { id: "n1", status: "NOMINATION_STATUS_OPEN" } });
    expect(nominationAdminClient.reopenRegistration).toHaveBeenCalledWith(
      { id: "n1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  // Спека 0012, AC-9/AC-16: сервер отклоняет Reopen, когда раскладка активна
  // (от раскладки или ручное закрытие + раскладка всё же началась) —
  // FailedPrecondition → 409 (как везде, см. lib/grpc/errors.ts).
  it("maps ConnectError FailedPrecondition → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(nominationAdminClient.reopenRegistration).mockRejectedValue(
      new ConnectError("cannot reopen", Code.FailedPrecondition),
    );
    const req = new NextRequest("http://localhost/api/nominations/n1/reopen-registration", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(409);
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(nominationAdminClient.reopenRegistration).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const req = new NextRequest("http://localhost/api/nominations/n1/reopen-registration", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(404);
  });

  it("maps ConnectError PermissionDenied → 403", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(nominationAdminClient.reopenRegistration).mockRejectedValue(
      new ConnectError("forbidden", Code.PermissionDenied),
    );
    const req = new NextRequest("http://localhost/api/nominations/n1/reopen-registration", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(403);
  });
});
