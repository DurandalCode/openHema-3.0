import { describe, expect, it } from "vitest";
import { resolveSchemaDrop } from "./schema-drag";

describe("entities/stage/lib/schema-drag resolveSchemaDrop (spec 0031, FR-13..FR-16)", () => {
  it("palette 'groups' on empty canvas zone creates a stage without a source (AC-7)", () => {
    const result = resolveSchemaDrop({ kind: "palette", item: "groups" }, null);
    expect(result).toEqual({ kind: "create-stage", type: "groups" });
  });

  it("palette 'bracket' on empty canvas zone creates a stage without a source", () => {
    const result = resolveSchemaDrop({ kind: "palette", item: "bracket" }, null);
    expect(result).toEqual({ kind: "create-stage", type: "bracket" });
  });

  it("palette 'bracket' on a stage card creates a stage sourced from that card (AC-8)", () => {
    const result = resolveSchemaDrop({ kind: "palette", item: "bracket" }, "groups-stage");
    expect(result).toEqual({ kind: "create-stage", type: "bracket", sourceStageId: "groups-stage" });
  });

  it("palette 'groups' on a stage card creates a stage sourced from that card", () => {
    const result = resolveSchemaDrop({ kind: "palette", item: "groups" }, "other-stage");
    expect(result).toEqual({ kind: "create-stage", type: "groups", sourceStageId: "other-stage" });
  });

  it("palette 'roster' on a stage card sets the roster as its rule source (AC-9)", () => {
    const result = resolveSchemaDrop({ kind: "palette", item: "roster" }, "stage-1");
    expect(result).toEqual({ kind: "set-roster-source", stageId: "stage-1" });
  });

  it("palette 'roster' on the empty canvas zone resolves to no intent", () => {
    const result = resolveSchemaDrop({ kind: "palette", item: "roster" }, null);
    expect(result).toEqual({ kind: "none" });
  });

  it("dragging one stage card onto another sets the source relationship (AC-10)", () => {
    const result = resolveSchemaDrop({ kind: "stage", stageId: "groups-stage" }, "bracket-stage");
    expect(result).toEqual({ kind: "set-stage-source", stageId: "bracket-stage", sourceStageId: "groups-stage" });
  });

  it("dragging a stage card onto itself resolves to no intent", () => {
    const result = resolveSchemaDrop({ kind: "stage", stageId: "stage-1" }, "stage-1");
    expect(result).toEqual({ kind: "none" });
  });

  it("dragging a stage card onto the empty canvas zone resolves to no intent", () => {
    const result = resolveSchemaDrop({ kind: "stage", stageId: "stage-1" }, null);
    expect(result).toEqual({ kind: "none" });
  });
});
