/**
 * ApplicationRequestError — ошибка мутации заявителя (подать/оплатить/
 * отозвать), несущая HTTP-статус ответа BFF рядом с текстом (спека 0036,
 * FR-6). TanStack Query отдаёт из `useMutation` только `error: Error` —
 * обычный `Error(res.error)` терял бы `status`, а без него
 * `applicationErrorMessage` не может выбрать текст (409 — прокинуть как
 * есть, 401/403/404 — перевести, остальное — общий текст).
 */
export class ApplicationRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApplicationRequestError";
    this.status = status;
  }
}
