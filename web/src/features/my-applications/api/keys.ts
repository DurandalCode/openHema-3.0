/**
 * myApplicationsKeys — query keys для фичи my-applications (см. ADR 0006).
 * Иерархия: ['my-applications', <scope>, ...params].
 */
export const myApplicationsKeys = {
  list: () => ["my-applications", "list"] as const,
  /** detail — заявка с историей событий, запрашивается при открытии диалога деталей заявки (спека 0040, FR-12). */
  detail: (applicationId: string) => ["my-applications", "detail", applicationId] as const,
};
