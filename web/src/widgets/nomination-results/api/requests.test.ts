import { describe, expect, it } from "vitest";
import { nominationResultsExportUrl } from "./requests";

describe("widgets/nomination-results api/requests nominationResultsExportUrl", () => {
  it("builds the export route URL for a nomination id", () => {
    expect(nominationResultsExportUrl("n1")).toBe("/api/nominations/n1/results/export");
  });

  it("encodes special characters in the nomination id", () => {
    expect(nominationResultsExportUrl("n 1/x")).toBe("/api/nominations/n%201%2Fx/results/export");
  });
});
