/**
 * adminKeys — query/mutation keys для admin-фичи.
 * Иерархия: ['admin', <scope>, ...params] (см. ADR 0006).
 */
export const adminKeys = {
  admins: ["admin", "admins"] as const,
  users: ["admin", "users"] as const,
};
