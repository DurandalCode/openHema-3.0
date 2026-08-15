import { describe, expect, it } from "vitest";
import { schemaIssueCounts } from "./issues";
import type { SchemaIssue } from "./types";

function issue(overrides: Partial<SchemaIssue>): SchemaIssue {
  return {
    severity: "SCHEMA_ISSUE_SEVERITY_ERROR",
    code: "SCHEMA_ISSUE_CODE_BAD_SOURCE",
    stageIds: [],
    message: "—",
    ...overrides,
  };
}

describe("entities/stage/lib/issues schemaIssueCounts (spec 0031, FR-6)", () => {
  it("returns zeros for an empty issues array", () => {
    expect(schemaIssueCounts([])).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it("counts a mix of severities", () => {
    const issues = [
      issue({ severity: "SCHEMA_ISSUE_SEVERITY_ERROR" }),
      issue({ severity: "SCHEMA_ISSUE_SEVERITY_ERROR" }),
      issue({ severity: "SCHEMA_ISSUE_SEVERITY_WARNING" }),
      issue({ severity: "SCHEMA_ISSUE_SEVERITY_INFO" }),
    ];
    expect(schemaIssueCounts(issues)).toEqual({ error: 2, warning: 1, info: 1 });
  });

  it("ignores an unspecified severity in all three counters", () => {
    const issues = [issue({ severity: "SCHEMA_ISSUE_SEVERITY_UNSPECIFIED" })];
    expect(schemaIssueCounts(issues)).toEqual({ error: 0, warning: 0, info: 0 });
  });
});
