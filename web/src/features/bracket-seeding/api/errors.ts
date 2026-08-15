/**
 * bracketErrorMessage — переводит отказ сервера при посеве сетки (спека
 * 0032, FR-21) в русский текст по HTTP-статусу, а не по содержимому строки
 * (тот же приём, что `poolsErrorMessage`, 0030): текст ошибки от модуля
 * `bracket`/`pool` — Go-домен, волатилен и не наш код. Санкционированный
 * дубль тонкого модуля соседней фичи (`nomination-pools/api/errors.ts`) —
 * FSD запрещает фичам импортировать друг друга (правило 6 `web/AGENTS.md`).
 *
 * 409 покрывает оба локальных отказа посева одним сообщением: занятый слот
 * при посадке бойца (`ErrSlotOccupied`) и попытку изменить уже
 * зафиксированный состав сетки — различить их надёжно без нового
 * proto-поля нельзя, как и у пулов. 404 — этап/сетка не найдены.
 */

const LOCKED_MESSAGE = "Действие недоступно: слот занят либо посев сетки уже зафиксирован";
const NOT_FOUND_MESSAGE = "Этап не найден";
const INVALID_MESSAGE = "Некорректный запрос";
const FORBIDDEN_MESSAGE = "Недостаточно прав";
const GENERIC_MESSAGE = "Не удалось выполнить действие, попробуйте ещё раз";

export function bracketErrorMessage(_error: string, status?: number): string {
  switch (status) {
    case 409:
      return LOCKED_MESSAGE;
    case 404:
      return NOT_FOUND_MESSAGE;
    case 400:
      return INVALID_MESSAGE;
    case 401:
    case 403:
      return FORBIDDEN_MESSAGE;
    default:
      return GENERIC_MESSAGE;
  }
}
