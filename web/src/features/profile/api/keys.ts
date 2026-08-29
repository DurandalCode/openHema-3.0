/**
 * profileKeys — query/mutation keys для фичи profile (см. ADR 0006).
 * Иерархия: ['profile', <scope>, ...params].
 *
 * `sessions` — реестр refresh-сессий текущего пользователя (спека 0042,
 * FR-11). Инвалидируется мутациями `revokeSession`/`revokeOtherSessions`,
 * чтобы список в кабинете сразу отражал отзыв.
 */
export const profileKeys = {
  sessions: ["profile", "sessions"] as const,
};
