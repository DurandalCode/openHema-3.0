import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  applicationClient: { listMyApplications: vi.fn(), submitApplication: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  applicationsToJson: vi.fn((apps) => apps),
  applicationToJson: vi.fn((a) => a),
}));

import { applicationClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET, POST } from "./route";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/applications route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 without access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);

      const res = await GET();
      expect(res.status).toBe(401);
      expect(applicationClient.listMyApplications).not.toHaveBeenCalled();
    });

    it("returns applications for authenticated user", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(applicationClient.listMyApplications).mockResolvedValue({
        applications: [{ id: "a1" }],
      } as never);

      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.applications).toEqual([{ id: "a1" }]);
      expect(applicationClient.listMyApplications).toHaveBeenCalledWith(
        {},
        { headers: { Authorization: "Bearer tok" } },
      );
    });
  });

  describe("POST", () => {
    it("returns 401 without access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);

      const res = await POST(postReq({ nominationId: "n1" }));
      expect(res.status).toBe(401);
      expect(applicationClient.submitApplication).not.toHaveBeenCalled();
    });

    it("returns 400 when nominationId is missing", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");

      const res = await POST(postReq({}));
      expect(res.status).toBe(400);
      expect(applicationClient.submitApplication).not.toHaveBeenCalled();
    });

    it("submits application and returns it", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(applicationClient.submitApplication).mockResolvedValue({
        application: { id: "a1", nominationId: "n1" },
      } as never);

      const res = await POST(postReq({ nominationId: "n1" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.application).toEqual({ id: "a1", nominationId: "n1" });
      expect(applicationClient.submitApplication).toHaveBeenCalledWith(
        { nominationId: "n1" },
        { headers: { Authorization: "Bearer tok" } },
      );
    });

    it("maps CodeAlreadyExists (duplicate active) to 409", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(applicationClient.submitApplication).mockRejectedValue(
        new ConnectError("duplicate", Code.AlreadyExists),
      );

      const res = await POST(postReq({ nominationId: "n1" }));
      expect(res.status).toBe(409);
    });

    it("maps CodeNotFound (nomination not found) to 404", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(applicationClient.submitApplication).mockRejectedValue(
        new ConnectError("no nomination", Code.NotFound),
      );

      const res = await POST(postReq({ nominationId: "missing" }));
      expect(res.status).toBe(404);
    });
  });
});
