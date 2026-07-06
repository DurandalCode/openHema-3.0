import { create } from "@bufbuild/protobuf";
import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  authClient: { me: vi.fn() },
}));

import { MeResponseSchema } from "@/gen/hema/v1/auth_pb";
import { Role, UserSchema } from "@/gen/hema/v1/common_pb";
import { authClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { getCurrentUser } from "./get-current-user";

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    expect(await getCurrentUser()).toBeNull();
    expect(authClient.me).not.toHaveBeenCalled();
  });

  it("returns CurrentUser on valid token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token-abc");
    vi.mocked(authClient.me).mockResolvedValue(
      create(MeResponseSchema, {
        user: create(UserSchema, {
          id: "u1",
          email: "ivan@example.com",
          displayName: "Иван",
          role: Role.USER,
          createdAt: create(TimestampSchema, {
            seconds: 1_700_000_000n,
            nanos: 0,
          }),
        }),
      }),
    );

    expect(await getCurrentUser()).toEqual({
      id: "u1",
      email: "ivan@example.com",
      displayName: "Иван",
      role: "ROLE_USER",
      createdAt: "2023-11-14T22:13:20.000Z",
    });
  });

  it("passes Bearer token in Authorization header", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token-xyz");
    vi.mocked(authClient.me).mockResolvedValue(create(MeResponseSchema, {}));

    await getCurrentUser();

    expect(authClient.me).toHaveBeenCalledWith(
      {},
      { headers: { Authorization: "Bearer token-xyz" } },
    );
  });

  it("returns null when gRPC throws", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token-abc");
    vi.mocked(authClient.me).mockRejectedValue(new Error("unauthenticated"));

    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when user is undefined", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token-abc");
    vi.mocked(authClient.me).mockResolvedValue(create(MeResponseSchema, {}));

    expect(await getCurrentUser()).toBeNull();
  });

  it("handles missing createdAt timestamp", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token-abc");
    vi.mocked(authClient.me).mockResolvedValue(
      create(MeResponseSchema, {
        user: create(UserSchema, {
          id: "u1",
          email: "ivan@example.com",
          displayName: "Иван",
          role: Role.USER,
        }),
      }),
    );

    const user = await getCurrentUser();
    expect(user?.createdAt).toBe("");
  });

  it("preserves ROLE_ADMIN for admin user", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token-abc");
    vi.mocked(authClient.me).mockResolvedValue(
      create(MeResponseSchema, {
        user: create(UserSchema, {
          id: "a1",
          email: "admin@hema.test",
          displayName: "Admin",
          role: Role.ADMIN,
          createdAt: create(TimestampSchema, { seconds: 0n, nanos: 0 }),
        }),
      }),
    );

    expect(await getCurrentUser()).toEqual({
      id: "a1",
      email: "admin@hema.test",
      displayName: "Admin",
      role: "ROLE_ADMIN",
      createdAt: "1970-01-01T00:00:00.000Z",
    });
  });

  it("normalizes unknown role to ROLE_UNSPECIFIED", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token-abc");
    vi.mocked(authClient.me).mockResolvedValue(
      create(MeResponseSchema, {
        user: create(UserSchema, {
          id: "u1",
          email: "ivan@example.com",
          displayName: "Иван",
          role: undefined,
        }),
      }),
    );

    const user = await getCurrentUser();
    expect(user?.role).toBe("ROLE_UNSPECIFIED");
  });
});
