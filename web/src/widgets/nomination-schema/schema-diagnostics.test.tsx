// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SchemaDiagnostics } from "./schema-diagnostics";
import type { SchemaIssue } from "@/entities/stage/lib/types";

afterEach(() => {
  cleanup();
});

describe("SchemaDiagnostics (спека 0031, FR-6, AC-4)", () => {
  it("shows 'Схема корректна' when there are no issues", () => {
    render(<SchemaDiagnostics issues={[]} />);
    expect(screen.getByText("Схема корректна")).toBeInTheDocument();
  });

  it("shows counters for the encountered severity classes only (AC-4)", () => {
    const issues: SchemaIssue[] = [
      {
        severity: "SCHEMA_ISSUE_SEVERITY_ERROR",
        code: "SCHEMA_ISSUE_CODE_SOURCE_CYCLE",
        stageIds: ["s1"],
        message: "Цикл",
      },
      {
        severity: "SCHEMA_ISSUE_SEVERITY_ERROR",
        code: "SCHEMA_ISSUE_CODE_BAD_SOURCE",
        stageIds: ["s2"],
        message: "Плохой источник",
      },
      {
        severity: "SCHEMA_ISSUE_SEVERITY_WARNING",
        code: "SCHEMA_ISSUE_CODE_COVERAGE_GAP",
        stageIds: ["s1", "s2"],
        message: "Разрыв покрытия",
      },
    ];
    render(<SchemaDiagnostics issues={issues} />);

    expect(screen.getByText("Ошибки · 2")).toBeInTheDocument();
    expect(screen.getByText("Предупреждения · 1")).toBeInTheDocument();
    expect(screen.queryByText(/Информация/)).not.toBeInTheDocument();
    expect(screen.queryByText("Схема корректна")).not.toBeInTheDocument();
  });

  it("shows an info counter when only info-level issues are present", () => {
    const issues: SchemaIssue[] = [
      {
        severity: "SCHEMA_ISSUE_SEVERITY_INFO",
        code: "SCHEMA_ISSUE_CODE_TAIL_UNCOVERED",
        stageIds: ["s1"],
        message: "Хвост не покрыт",
      },
    ];
    render(<SchemaDiagnostics issues={issues} />);
    expect(screen.getByText("Информация · 1")).toBeInTheDocument();
  });
});
