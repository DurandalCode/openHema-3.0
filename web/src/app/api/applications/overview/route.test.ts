import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationState } from "@/gen/hema/v1/application_pb";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  applicationAdminClient: { listApplications: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  applicationsToJson: vi.fn((apps) => apps),
}));

import { applicationAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function req(query: string) {
  return new NextRequest(`http://localhost/api/applications/overview${query}`);
}

describe("app/api/applications/overview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await GET(req("?tournamentId=t1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 without tournamentId", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");

    const res = await GET(req(""));
    expect(res.status).toBe(400);
    expect(applicationAdminClient.listApplications).not.toHaveBeenCalled();
  });

  it("lists with default filters/paging (empty statuses/nominationIds, no search, default limit/offset)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationAdminClient.listApplications).mockResolvedValue({
      applications: [{ id: "a1" }, { id: "a2" }],
      totalCount: 2,
      statusCounts: [],
    } as never);

    const res = await GET(req("?tournamentId=t1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(applicationAdminClient.listApplications).toHaveBeenCalledWith(
      {
        tournamentId: "t1",
        statuses: [],
        nominationIds: [],
        needsEquipment: undefined,
        search: undefined,
        limit: 100,
        offset: 0,
      },
      { headers: { Authorization: "Bearer tok" } },
    );
    expect(body).toEqual({
      applications: [{ id: "a1" }, { id: "a2" }],
      totalCount: 2,
      statusCounts: [],
    });
  });

  it("passes repeated statuses/nominationIds, needsEquipment, search and limit/offset through", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationAdminClient.listApplications).mockResolvedValue({
      applications: [],
      totalCount: 0,
      statusCounts: [],
    } as never);

    const res = await GET(
      req(
        "?tournamentId=t1&statuses=APPLICATION_STATE_PAID&statuses=APPLICATION_STATE_SUBMITTED" +
          "&nominationIds=n1&nominationIds=n2&needsEquipment=true&search=Ivan&limit=50&offset=50",
      ),
    );

    expect(res.status).toBe(200);
    expect(applicationAdminClient.listApplications).toHaveBeenCalledWith(
      {
        tournamentId: "t1",
        statuses: [ApplicationState.PAID, ApplicationState.SUBMITTED],
        nominationIds: ["n1", "n2"],
        needsEquipment: true,
        search: "Ivan",
        limit: 50,
        offset: 50,
      },
      { headers: { Authorization: "Bearer tok" } },
    );
  });

  it("trims search and omits it entirely when blank", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationAdminClient.listApplications).mockResolvedValue({
      applications: [],
      totalCount: 0,
      statusCounts: [],
    } as never);

    await GET(req("?tournamentId=t1&search=%20%20"));

    expect(applicationAdminClient.listApplications).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined }),
      expect.anything(),
    );
  });

  it("returns 400 for an unknown status name and does not call the RPC", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");

    const res = await GET(req("?tournamentId=t1&statuses=NOT_A_STATE"));
    expect(res.status).toBe(400);
    expect(applicationAdminClient.listApplications).not.toHaveBeenCalled();
  });

  it("maps status_counts from numeric enum to the DTO string literal, independent of the filter", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationAdminClient.listApplications).mockResolvedValue({
      applications: [],
      totalCount: 0,
      statusCounts: [
        { status: ApplicationState.SUBMITTED, count: 31 },
        { status: ApplicationState.AWAITING_PAYMENT_CONFIRMATION, count: 6 },
        { status: ApplicationState.PAID, count: 1 },
        { status: ApplicationState.REGISTERED, count: 124 },
        { status: ApplicationState.WITHDRAWN, count: 2 },
      ],
    } as never);

    const res = await GET(req("?tournamentId=t1"));
    const body = await res.json();

    expect(body.statusCounts).toEqual([
      { status: "APPLICATION_STATE_SUBMITTED", count: 31 },
      { status: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION", count: 6 },
      { status: "APPLICATION_STATE_PAID", count: 1 },
      { status: "APPLICATION_STATE_REGISTERED", count: 124 },
      { status: "APPLICATION_STATE_WITHDRAWN", count: 2 },
    ]);
  });

  it("defaults totalCount to 0 when the RPC omits it", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationAdminClient.listApplications).mockResolvedValue({
      applications: [],
    } as never);

    const res = await GET(req("?tournamentId=t1"));
    const body = await res.json();

    expect(body.totalCount).toBe(0);
    expect(body.statusCounts).toEqual([]);
  });
});
