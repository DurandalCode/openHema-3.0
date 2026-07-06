/**
 * authKeys — query/mutation keys для auth-фичи.
 * Иерархия: ['auth', <scope>, ...params] (см. ADR 0006).
 *
 * `me` — будущий client-side хук текущего пользователя (пока не используется,
 * server-side getCurrentUser покрывает потребность). Резервируем ключ.
 */
export const authKeys = {
  me: ["auth", "me"] as const,
};
