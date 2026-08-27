/**
 * requests.ts — ссылка на BFF-роут экспорта итогового протокола номинации
 * (спека 0041, T34). Скачивание файла — обычная навигация браузера
 * (`<a href={...}>`), не `fetch`+blob (план, «Риски»: BFF Route Handler сам
 * отдаёт `Content-Disposition: attachment`) — здесь только чистая функция,
 * строящая URL, без клиентского запроса.
 */

/** nominationResultsExportUrl — GET-ссылка на CSV итогового протокола номинации. */
export function nominationResultsExportUrl(nominationId: string): string {
  return `/api/nominations/${encodeURIComponent(nominationId)}/results/export`;
}
