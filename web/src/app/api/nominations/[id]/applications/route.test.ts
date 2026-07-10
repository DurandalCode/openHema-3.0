import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  applicationAdminClient: { listNominationApplications: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  applicationsToJson: vi.fn((apps) => apps),
}));

import { applicationAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("app/api/nominations/[id]/applications route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await GET(new NextRequest("http://localhost"), ctx("n1"));
    expect(res.status).toBe(401);
    expect(applicationAdminClient.listNominationApplications).not.toHaveBeenCalled();
  });

  it("returns applications for nomination", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("admin-tok");
    vi.mocked(applicationAdminClient.listNominationApplications).mockResolvedValue({
      applications: [{ id: "a1" }],
    } as never);

    const res = await GET(new NextRequest("http://localhost"), ctx("n1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.applications).toEqual([{ id: "a1" }]);
    expect(applicationAdminClient.listNominationApplications).toHaveBeenCalledWith(
      { nominationId: "n1" },
      { headers: { Authorization: "Bearer admin-tok" } },
    );
  });
});
