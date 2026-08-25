import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/serialize", () => ({
  fighterToJson: vi.fn(),
}));

import { fighterToJson } from "@/lib/grpc/serialize";
import { toFighterDto } from "./to-fighter-dto";

describe("toFighterDto", () => {
  it("returns null when fighterToJson returns null (spec 0040)", () => {
    vi.mocked(fighterToJson).mockReturnValue(null);
    expect(toFighterDto(undefined)).toBeNull();
  });

  it("adds linkedAccountId/linkedAccountDisplayName/mergedIntoId read directly off the proto message (FR-8/FR-10)", () => {
    vi.mocked(fighterToJson).mockReturnValue({ id: "f1", name: "Ivan" } as never);
    const result = toFighterDto({
      linkedAccountId: "user-1",
      linkedAccountDisplayName: "Ivan Petrov",
      mergedIntoId: "",
    } as never);
    expect(result).toEqual({
      id: "f1",
      name: "Ivan",
      linkedAccountId: "user-1",
      linkedAccountDisplayName: "Ivan Petrov",
      mergedIntoId: "",
    });
  });

  it("defaults new fields to empty string when absent on the proto message", () => {
    vi.mocked(fighterToJson).mockReturnValue({ id: "f2" } as never);
    const result = toFighterDto({} as never);
    expect(result).toEqual({
      id: "f2",
      linkedAccountId: "",
      linkedAccountDisplayName: "",
      mergedIntoId: "",
    });
  });
});
