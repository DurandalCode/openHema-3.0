/**
 * applicationErrorMessage — переводит отказ действия заявителя (подача,
 * отзыв, отметка оплаты) в русский текст по HTTP-статусу (спека 0036, FR-6).
 * 409 — текст уже на русском, его отдаёт сам BFF, не Go-домен: каждая из
 * трёх мутирующих ручек (`app/api/applications/route.ts` для подачи,
 * `app/api/applications/[id]/{withdraw,declare-payment}/route.ts` через
 * общий `action-error.ts`) сама различает `connect.Code` и подставляет свой
 * текст — здесь текст прокидывается как есть, а не переводится заново по
 * статусу, как в `poolsErrorMessage` (0030). Важно: если на 409 когда-нибудь
 * заведётся ручка без такого перевода, сюда попадёт сырой текст Go-домена
 * (см. историю — до этой правки так и было для withdraw/declare-payment).
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
