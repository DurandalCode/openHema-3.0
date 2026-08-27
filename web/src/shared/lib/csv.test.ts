import { describe, expect, it } from "vitest";
import { CSV_BOM, csvEscape, csvRow, toCsv } from "./csv";

describe("csv (spec 0041, FR-15)", () => {
  describe("csvEscape", () => {
    it("leaves a plain value unchanged", () => {
      expect(csvEscape("Иванов")).toBe("Иванов");
    });

    it("leaves an empty value unchanged", () => {
      expect(csvEscape("")).toBe("");
    });

    it("quotes a value containing a comma", () => {
      expect(csvEscape("Иванов, Пётр")).toBe('"Иванов, Пётр"');
    });

    it("quotes and doubles an embedded quote", () => {
      expect(csvEscape('клуб "Ганза"')).toBe('"клуб ""Ганза"""');
    });

    it("quotes a value containing a newline", () => {
      expect(csvEscape("строка1\nстрока2")).toBe('"строка1\nстрока2"');
    });

    it("quotes a value containing a carriage return", () => {
      expect(csvEscape("строка1\rстрока2")).toBe('"строка1\rстрока2"');
    });
  });

  describe("csvRow", () => {
    it("joins fields with a comma, escaping only fields that need it", () => {
      expect(csvRow(["Иванов", "Ганза, боевые искусства", "3"])).toBe(
        'Иванов,"Ганза, боевые искусства",3',
      );
    });
  });

  describe("toCsv", () => {
    it("joins header and rows with CRLF and ends with a trailing CRLF", () => {
      const csv = toCsv(
        ["Имя", "Клуб"],
        [
          ["Иванов", "Ганза"],
          ["Петров", ""],
        ],
      );
      expect(csv).toBe("Имя,Клуб\r\nИванов,Ганза\r\nПетров,\r\n");
    });

    it("produces only the header line for an empty data set", () => {
      expect(toCsv(["Имя", "Клуб"], [])).toBe("Имя,Клуб\r\n");
    });
  });

  describe("CSV_BOM", () => {
    it("is the UTF-8 byte order mark", () => {
      expect(CSV_BOM).toBe("\uFEFF");
    });
  });
});
