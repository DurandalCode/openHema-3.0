/**
 * adminKeys — query/mutation keys для admin-фичи.
 * Иерархия: ['admin', <scope>, ...params] (см. ADR 0006).
 *
 * `admins` (список только-админов) удалён вместе с `listAdminsRequest`
 * (спека 0024, план §«Обзор» п.1): `ListUsers` уже возвращает всех, второй
 * запрос экрану не нужен — разбивка по ролям считается из того же массива.
 */
export const adminKeys = {
  users: ["admin", "users"] as const,
};
