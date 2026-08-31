import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertPreprodAccess } from "@/lib/grpc/preprod-guard";

const getCurrentUserMock = vi.fn();
vi.mock("@/entities/user/model/get-current-user", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const isPreprodModeEnabledMock = vi.fn();
vi.mock("@/shared/config/preprod", () => ({
  isPreprodModeEnabled: () => isPreprodModeEnabledMock(),
}));

describe("assertPreprodAccess", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    isPreprodModeEnabledMock.mockReset();
  });

  it("returns null and does not call getCurrentUser when preprod mode is off", async () => {
    isPreprodModeEnabledMock.mockReturnValue(false);

    const res = await assertPreprodAccess();

    expect(res).toBeNull();
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });

  it("returns a 401 response when preprod mode is on and there is no user", async () => {
    isPreprodModeEnabledMock.mockReturnValue(true);
    getCurrentUserMock.mockResolvedValue(null);

    const res = await assertPreprodAccess();

    expect(res).not.toBeNull();
    expect(res?.status).toBe(401);
  });

  it("returns null when preprod mode is on and a user exists", async () => {
    isPreprodModeEnabledMock.mockReturnValue(true);
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "a@b.c" });

    const res = await assertPreprodAccess();

    expect(res).toBeNull();
  });
});
