/**
 * csv.ts — сериализация табличных данных в CSV (RFC 4180), спека 0041
 * (FR-15): значения с запятой/кавычкой/переносом строки экранируются
 * кавычками, строки разделяются CRLF. Используется BFF-роутами экспорта
 * ростера и итогового протокола номинации.
 */

const NEEDS_QUOTING = /[",\r\n]/;

/** csvEscape — экранирует одно значение по RFC 4180. */
export function csvEscape(value: string): string {
  if (!NEEDS_QUOTING.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** csvRow — одна строка CSV из значений (без завершающего переноса строки). */
export function csvRow(fields: string[]): string {
  return fields.map(csvEscape).join(",");
}

/**
 * toCsv — заголовок + строки данных в CSV-документ: CRLF между строками
 * (RFC 4180), с завершающим переносом в конце файла.
 */
export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map(csvRow).join("\r\n") + "\r\n";
}

/**
 * CSV_BOM — UTF-8 BOM. Не требуется RFC 4180, но без него Excel по
 * умолчанию не распознаёт кодировку non-ASCII CSV (кириллица) и показывает
 * кракозябры — добавляется в начало файла BFF-роутами экспорта.
 */
export const CSV_BOM = "\uFEFF";
