import { describe, it, expect } from "vitest";
import { fromJson } from "@bufbuild/protobuf";
import { UserSchema } from "@/gen/hema/v1/common_pb";
import { userToJson } from "@/lib/grpc/serialize";

type UserJson = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
};

describe("userToJson", () => {
  it("converts a protobuf User to plain JSON", () => {
    const user = fromJson(UserSchema, {
      id: "user-123",
      email: "knight@hema.test",
      displayName: "Sir Test",
      createdAt: "2026-01-01T00:00:00Z",
    });

    const json = userToJson(user) as UserJson;

    expect(json).not.toBeNull();
    expect(json.id).toBe("user-123");
    expect(json.email).toBe("knight@hema.test");
    expect(json.displayName).toBe("Sir Test");
    expect(json.createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("returns null for undefined", () => {
    expect(userToJson(undefined)).toBeNull();
  });
});
