import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ImportFightersResponseSchema,
  ImportRowError,
  ImportRowOutcome,
  type ImportFightersRequest,
} from "@/gen/hema/v1/fighter_pb";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  fighterAdminClient: {
    importFighters: vi.fn(),
  },
}));

import { fighterAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

/**
 * BFF-роут импорта ростера (спека 0049, T9). Тест e2e-стиля (ADR 0010):
 * `toImportReportDto` НЕ мокается — отчёт проходит настоящий `toJson` по
 * настоящему proto-ответу, поэтому proto3-omitted поля (`rows_read: 0`,
 * `outcome: UNSPECIFIED`) и enum'ы ловятся здесь, а не в браузере.
 */
function req(opts: {
  file?: File | null;
  dryRun?: string;
  nominationIds?: string[];
}): NextRequest {
  const formData = new FormData();
  if (opts.file) formData.set("file", opts.file);
  if (opts.dryRun !== undefined) formData.set("dryRun", opts.dryRun);
  for (const id of opts.nominationIds ?? []) formData.append("nominationIds", id);
  return new NextRequest("http://localhost/api/fighters/import", {
    method: "POST",
    body: formData,
  });
}

function csvFile(name = "roster.csv", type = "text/csv"): File {
  return new File(["имя;клуб;номинации\nИванов Иван;Сталь;Лонгсворд\n"], name, { type });
}

function importCall(): [ImportFightersRequest, { headers: Record<string, string> }] {
  return vi.mocked(fighterAdminClient.importFighters).mock.calls[0] as never;
}

function okResponse() {
  return create(ImportFightersResponseSchema, {
    dryRun: true,
    summary: { rowsRead: 2, created: 1, updated: 0, skipped: 0, rejected: 1 },
    rows: [
      {
        line: 2,
        name: "Иванов Иван",
        club: "Сталь",
        outcome: ImportRowOutcome.CREATED,
        nominationTitles: ["Лонгсворд"],
        addedNominationIds: ["n1"],
      },
      {
        line: 3,
        name: "",
        club: "",
        outcome: ImportRowOutcome.REJECTED,
        error: ImportRowError.EMPTY_NAME,
      },
    ],
  });
}

describe("app/api/fighters/import route (spec 0049, T9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without an access token and never calls the RPC client (FR-12)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await POST(req({ file: csvFile() }));

    expect(res.status).toBe(401);
    expect(fighterAdminClient.importFighters).not.toHaveBeenCalled();
  });

  it("returns 400 when the file field is missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");

    const res = await POST(req({}));

    expect(res.status).toBe(400);
    expect(fighterAdminClient.importFighters).not.toHaveBeenCalled();
  });

  it("rejects a file that is neither .csv nor .xlsx, before the RPC call (NFR-2)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");

    const res = await POST(
      req({ file: new File(["%PDF"], "roster.pdf", { type: "application/pdf" }) }),
    );

    expect(res.status).toBe(400);
    expect(fighterAdminClient.importFighters).not.toHaveBeenCalled();
  });

  it("accepts a .csv whose MIME Excel/the browser lied about", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(fighterAdminClient.importFighters).mockResolvedValue(okResponse());

    const res = await POST(req({ file: csvFile("Ростер.CSV", "application/vnd.ms-excel") }));

    expect(res.status).toBe(200);
    expect(fighterAdminClient.importFighters).toHaveBeenCalledTimes(1);
  });

  it("accepts an .xlsx with an empty MIME type", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(fighterAdminClient.importFighters).mockResolvedValue(okResponse());

    const res = await POST(req({ file: new File(["PK"], "roster.xlsx", { type: "" }) }));

    expect(res.status).toBe(200);
    expect(importCall()[0].fileName).toBe("roster.xlsx");
  });

  it("accepts a spreadsheet MIME even with an unhelpful file name", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(fighterAdminClient.importFighters).mockResolvedValue(okResponse());

    const res = await POST(
      req({
        file: new File(["PK"], "upload", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      }),
    );

    expect(res.status).toBe(200);
  });

  it("rejects a file over 2 MiB before the RPC call (NFR-1)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    const big = new Uint8Array(2 * 1024 * 1024 + 1);

    const res = await POST(req({ file: new File([big], "roster.csv", { type: "text/csv" }) }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.stringContaining("2097152") });
    expect(fighterAdminClient.importFighters).not.toHaveBeenCalled();
  });

  it("sends content/fileName/dryRun/defaultNominationIds and the bearer token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(fighterAdminClient.importFighters).mockResolvedValue(okResponse());

    const res = await POST(req({ file: csvFile(), dryRun: "false", nominationIds: ["n1", "n2"] }));

    expect(res.status).toBe(200);
    const [request, options] = importCall();
    expect(request.fileName).toBe("roster.csv");
    expect(request.content).toBeInstanceOf(Uint8Array);
    expect(request.content.byteLength).toBeGreaterThan(0);
    expect(request.dryRun).toBe(false);
    expect(request.defaultNominationIds).toEqual(["n1", "n2"]);
    expect(options).toEqual({ headers: { Authorization: "Bearer tok-xyz" } });
  });

  it("treats dryRun='true' as a preview and a missing dryRun field as a preview too (FR-2)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(fighterAdminClient.importFighters).mockResolvedValue(okResponse());

    await POST(req({ file: csvFile(), dryRun: "true" }));
    expect(importCall()[0].dryRun).toBe(true);

    vi.clearAllMocks();
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(fighterAdminClient.importFighters).mockResolvedValue(okResponse());

    await POST(req({ file: csvFile() }));
    expect(importCall()[0].dryRun).toBe(true);
  });

  it("sends no defaultNominationIds when the field is absent", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(fighterAdminClient.importFighters).mockResolvedValue(okResponse());

    await POST(req({ file: csvFile() }));

    expect(importCall()[0].defaultNominationIds).toEqual([]);
  });

  it("returns the report as a DTO: summary, per-row outcome/error as string literals (FR-3/FR-4)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(fighterAdminClient.importFighters).mockResolvedValue(okResponse());

    const res = await POST(req({ file: csvFile() }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      report: {
        dryRun: true,
        summary: { rowsRead: 2, created: 1, updated: 0, skipped: 0, rejected: 1 },
        rows: [
          {
            line: 2,
            name: "Иванов Иван",
            club: "Сталь",
            outcome: "IMPORT_ROW_OUTCOME_CREATED",
            nominationTitles: ["Лонгсворд"],
            addedNominationIds: ["n1"],
            fighterId: "",
            error: "IMPORT_ROW_ERROR_UNSPECIFIED",
            errorDetail: "",
          },
          {
            line: 3,
            name: "",
            club: "",
            outcome: "IMPORT_ROW_OUTCOME_REJECTED",
            nominationTitles: [],
            addedNominationIds: [],
            fighterId: "",
            error: "IMPORT_ROW_ERROR_EMPTY_NAME",
            errorDetail: "",
          },
        ],
      },
    });
  });

  it("defaults a proto3-omitted summary to zeros instead of exploding", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(fighterAdminClient.importFighters).mockResolvedValue(
      create(ImportFightersResponseSchema, { dryRun: false }),
    );

    const res = await POST(req({ file: csvFile(), dryRun: "false" }));

    expect(await res.json()).toEqual({
      report: {
        dryRun: false,
        summary: { rowsRead: 0, created: 0, updated: 0, skipped: 0, rejected: 0 },
        rows: [],
      },
    });
  });

  it("maps a ConnectError from the RPC client through errorResponse (file-level errors to 400)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(fighterAdminClient.importFighters).mockRejectedValue(
      new ConnectError("fighter: too many rows", Code.InvalidArgument),
    );

    const res = await POST(req({ file: csvFile() }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "fighter: too many rows" });
  });

  it("maps a PermissionDenied from the RPC client to 403 (AC-9)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(fighterAdminClient.importFighters).mockRejectedValue(
      new ConnectError("admin only", Code.PermissionDenied),
    );

    const res = await POST(req({ file: csvFile() }));

    expect(res.status).toBe(403);
  });
});
