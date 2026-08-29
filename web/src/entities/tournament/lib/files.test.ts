import { describe, expect, it } from "vitest";
import { emblemSrc, formatFileSize, regulationsHref, resolveFileOrLink } from "./files";
import type { Tournament } from "./types";

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    title: "Кубок Севера",
    description: "",
    eventStartAt: "",
    eventEndAt: "",
    emblemUrl: "",
    isActive: true,
    contacts: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    chiefJudge: "",
    regulationsUrl: "",
    venueName: "",
    venueAddress: "",
    entryFeeMinor: null,
    entryFeeCurrency: "",
    program: [],
    regulationsFile: { url: "", name: "", size: 0 },
    emblemFile: { url: "", name: "", size: 0 },
    notifications: { applicationState: false, poolSeated: false },
    ...overrides,
  };
}

describe("entities/tournament/lib/files resolveFileOrLink (spec 0042, FR-34)", () => {
  it("prefers the file when set, rewriting the server path to the BFF proxy", () => {
    expect(resolveFileOrLink({ url: "/files/abc123", name: "rules.pdf", size: 10 }, "https://x.test/rules.pdf")).toBe(
      "/api/files/abc123",
    );
  });

  it("falls back to the link when no file is set", () => {
    expect(resolveFileOrLink({ url: "", name: "", size: 0 }, "https://x.test/rules.pdf")).toBe(
      "https://x.test/rules.pdf",
    );
  });

  it("passes a file url through unchanged when it does not look like a local storage path", () => {
    // Будущий адаптер (S3 и подобные, ADR 0019 «Альтернативы») мог бы отдавать
    // уже полный публичный адрес — переписывать его не нужно.
    expect(
      resolveFileOrLink({ url: "https://cdn.example.com/o/abc", name: "x", size: 1 }, ""),
    ).toBe("https://cdn.example.com/o/abc");
  });
});

describe("entities/tournament/lib/files regulationsHref/emblemSrc (spec 0042, FR-30/FR-31/FR-34)", () => {
  it("regulationsHref prefers the uploaded file over the link", () => {
    const t = tournament({
      regulationsUrl: "https://cdn.example.com/rules.pdf",
      regulationsFile: { url: "/files/reg1", name: "rules.pdf", size: 12345 },
    });
    expect(regulationsHref(t)).toBe("/api/files/reg1");
  });

  it("regulationsHref falls back to the link when the file is empty", () => {
    const t = tournament({ regulationsUrl: "https://cdn.example.com/rules.pdf" });
    expect(regulationsHref(t)).toBe("https://cdn.example.com/rules.pdf");
  });

  it("emblemSrc prefers the uploaded file over the link", () => {
    const t = tournament({
      emblemUrl: "https://cdn.example.com/logo.png",
      emblemFile: { url: "/files/emb1", name: "logo.png", size: 555 },
    });
    expect(emblemSrc(t)).toBe("/api/files/emb1");
  });

  it("emblemSrc falls back to the link when the file is empty", () => {
    const t = tournament({ emblemUrl: "https://cdn.example.com/logo.png" });
    expect(emblemSrc(t)).toBe("https://cdn.example.com/logo.png");
  });
});

describe("entities/tournament/lib/files formatFileSize", () => {
  it("formats bytes below 1024 as whole bytes", () => {
    expect(formatFileSize(512)).toBe("512 Б");
  });

  it("formats zero as 0 Б", () => {
    expect(formatFileSize(0)).toBe("0 Б");
  });

  it("formats kilobytes as whole numbers", () => {
    expect(formatFileSize(2048)).toBe("2 КБ");
  });

  it("formats megabytes with one decimal (comma separator)", () => {
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe("2,4 МБ");
  });

  it("formats gigabytes with one decimal", () => {
    expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe("1,5 ГБ");
  });
});
