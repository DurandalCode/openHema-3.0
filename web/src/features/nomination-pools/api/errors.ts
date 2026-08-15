/**
 * poolsErrorMessage — переводит отказ сервера при работе с раскладкой пулов
 * (спека 0030, FR-3..FR-9) в русский текст по HTTP-статусу, а не по
 * содержимому строки (тот же приём, что `presetErrorMessage`, 0029): текст
 * ошибки от модуля `pool` — Go-домен, волатилен и не наш код (в отличие от
 * BFF-строк, которые можно переписать прямо в ручке, как в 0027). Большинство
 * мутаций этого экрана — `FailedPrecondition` (→ 409) по разным причинам
 * (раскладка зафиксирована, нет пулов для автораспределения, нет истории для
 * undo, есть проведённые бои при возврате в черновик, 0013) — без нового
 * proto-поля различить их надёжно нельзя, поэтому один общий текст.
 */

const LOCKED_MESSAGE = "Действие недоступно: раскладка зафиксирована либо изменять уже нечего";
const INVALID_MESSAGE = "Некорректный запрос";
const FORBIDDEN_MESSAGE = "Недостаточно прав";
const GENERIC_MESSAGE = "Не удалось выполнить действие, попробуйте ещё раз";

export function poolsErrorMessage(_error: string, status?: number): string {
  switch (status) {
    case 409:
      return LOCKED_MESSAGE;
    case 400:
      return INVALID_MESSAGE;
    case 401:
    case 403:
      return FORBIDDEN_MESSAGE;
    default:
      return GENERIC_MESSAGE;
  }
}
