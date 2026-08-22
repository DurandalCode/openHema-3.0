/**
 * applicationErrorMessage — переводит отказ действия заявителя (подача,
 * отзыв, отметка оплаты) в русский текст по HTTP-статусу (спека 0036, FR-6).
 * 409 (дубль заявки / приём закрыт) — текст уже на русском, его отдаёт сам
 * BFF (`app/api/applications/route.ts`), не Go-домен: прокидывается как
 * есть, а не переводится заново по статусу, как в `poolsErrorMessage`
 * (0030) — там за одним статусом стоит несколько разных доменных причин без
 * различающего proto-поля, здесь BFF уже различил их сам.
 */

const AUTH_MESSAGE = "Войдите, чтобы продолжить";
const NOT_FOUND_MESSAGE = "Номинация не найдена";
const GENERIC_MESSAGE = "Не удалось выполнить действие, попробуйте ещё раз";

export function applicationErrorMessage(error: string, status?: number): string {
  switch (status) {
    case 409:
      return error;
    case 401:
    case 403:
      return AUTH_MESSAGE;
    case 404:
      return NOT_FOUND_MESSAGE;
    default:
      return GENERIC_MESSAGE;
  }
}
