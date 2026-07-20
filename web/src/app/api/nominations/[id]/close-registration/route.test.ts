import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  nominationAdminClient: { closeRegistration: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  nominationToJson: vi.fn((n) => n),
}));

import { nominationAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { nominationToJson } from "@/lib/grpc/serialize";
import { POST } from "./route";

describe("app/api/nominations/[id]/close-registration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const req = new NextRequest("http://localhost/api/nominations/n1/close-registration", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
    expect(nominationAdminClient.closeRegistration).not.toHaveBeenCalled();
  });

  it("closes registration and returns JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(nominationAdminClient.closeRegistration).mockResolvedValue({
      nomination: { id: "n1", status: "NOMINATION_STATUS_CLOSED" },
    } as never);
    vi.mocked(nominationToJson).mockReturnValue({
      id: "n1",
      status: "NOMINATION_STATUS_CLOSED",
    } as never);

    const req = new NextRequest("http://localhost/api/nominations/n1/close-registration", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ nomination: { id: "n1", status: "NOMINATION_STATUS_CLOSED" } });
    expect(nominationAdminClient.closeRegistration).toHaveBeenCalledWith(
      { id: "n1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(nominationAdminClient.closeRegistration).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const req = new NextRequest("http://localhost/api/nominations/n1/close-registration", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(404);
  });

  it("maps ConnectError PermissionDenied → 403", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(nominationAdminClient.closeRegistration).mockRejectedValue(
      new ConnectError("forbidden", Code.PermissionDenied),
    );
    const req = new NextRequest("http://localhost/api/nominations/n1/close-registration", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(403);
  });
});
