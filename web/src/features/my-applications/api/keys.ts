/**
 * myApplicationsKeys — query keys для фичи my-applications (см. ADR 0006).
 * Иерархия: ['my-applications', <scope>, ...params].
 */
export const myApplicationsKeys = {
  list: () => ["my-applications", "list"] as const,
};
