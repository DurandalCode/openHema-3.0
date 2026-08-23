import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  authClient: { updateProfile: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  userToJson: vi.fn((u) => u),
}));

import { authClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { userToJson } from "@/lib/grpc/serialize";
import { PATCH } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/auth/profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no access token cookie", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await PATCH(req({ displayName: "Иван Кравцов", club: "Северный клинок" }));

    expect(res.status).toBe(401);
    expect(authClient.updateProfile).not.toHaveBeenCalled();
  });

  it("calls UpdateProfile with the Bearer token and returns {user} (AC-12)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.updateProfile).mockResolvedValue({
      user: { id: "u1", displayName: "Иван Кравцов", club: "Северный клинок" },
    } as never);
    vi.mocked(userToJson).mockReturnValue({
      id: "u1",
      displayName: "Иван Кравцов",
      club: "Северный клинок",
    } as never);

    const res = await PATCH(req({ displayName: "Иван Кравцов", club: "Северный клинок" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: "u1", displayName: "Иван Кравцов", club: "Северный клинок" },
    });
    expect(authClient.updateProfile).toHaveBeenCalledWith(
      { displayName: "Иван Кравцов", club: "Северный клинок" },
      { headers: { Authorization: "Bearer tok-xyz" } },
    );
  });

  it("accepts an empty club (clearing it is legal, FR-15)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.updateProfile).mockResolvedValue({
      user: { id: "u1", displayName: "Иван", club: "" },
    } as never);
    vi.mocked(userToJson).mockReturnValue({ id: "u1", displayName: "Иван", club: "" } as never);

    const res = await PATCH(req({ displayName: "Иван", club: "" }));

    expect(res.status).toBe(200);
    expect(authClient.updateProfile).toHaveBeenCalledWith(
      { displayName: "Иван", club: "" },
      { headers: { Authorization: "Bearer tok-xyz" } },
    );
  });

  it("rejects an empty display name with 400 without calling the RPC (FR-14, AC-13)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");

    const res = await PATCH(req({ displayName: "   ", club: "" }));

    expect(res.status).toBe(400);
    expect(authClient.updateProfile).not.toHaveBeenCalled();
  });

  // Зеркалит server/modules/auth/service/profile_policy.go (MaxProfileFieldLen):
  // и displayName, и club пишутся в unbounded TEXT-колонку — без пре-проверки
  // здесь ошибка дошла бы до пользователя как сырой текст Go-домена
  // ("auth: invalid profile") через generic errorResponse-фолбэк.
  it("rejects an oversized display name with 400 without calling the RPC", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");

    const res = await PATCH(req({ displayName: "a".repeat(101), club: "" }));

    expect(res.status).toBe(400);
    expect(authClient.updateProfile).not.toHaveBeenCalled();
  });

  it("rejects an oversized club with 400 without calling the RPC", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");

    const res = await PATCH(req({ displayName: "Иван", club: "a".repeat(101) }));

    expect(res.status).toBe(400);
    expect(authClient.updateProfile).not.toHaveBeenCalled();
  });

  it("accepts a display name at exactly the length limit (100 chars)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.updateProfile).mockResolvedValue({ user: {} } as never);

    const res = await PATCH(req({ displayName: "a".repeat(100), club: "" }));

    expect(res.status).toBe(200);
    expect(authClient.updateProfile).toHaveBeenCalled();
  });

  it("maps a ConnectError from the RPC (e.g. InvalidArgument) to 400 as a safety net", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.updateProfile).mockRejectedValue(
      new ConnectError("invalid profile", Code.InvalidArgument),
    );

    const res = await PATCH(req({ displayName: "Иван", club: "" }));

    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    const badReq = new NextRequest("http://localhost/api/auth/profile", {
      method: "PATCH",
      body: "not-json",
    });

    const res = await PATCH(badReq);

    expect(res.status).toBe(400);
    expect(authClient.updateProfile).not.toHaveBeenCalled();
  });
});
