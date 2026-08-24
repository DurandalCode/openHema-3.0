import type { Application, ApplicationEvent, ApplicationState } from "@/entities/application/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";

export type ApplicationListResult =
  | { ok: true; applications: Application[] }
  | { ok: false; error: string };

export type ApplicationResult =
  | { ok: true; application: Application }
  | { ok: false; error: string };

export type RegisterFighterResult =
  | { ok: true; application: Application; capacityExceeded: boolean }
  | { ok: false; error: string };

export type OverviewFilters = {
  status?: number;
  nominationId?: string;
};

/**
 * listApplicationsOverviewRequest — GET /api/applications/overview (admin).
 * Сводный экран заявок турнира с опциональными фильтрами по статусу и/или
 * номинации (FR-14).
 */
export async function listApplicationsOverviewRequest(
  tournamentId: string,
  filters: OverviewFilters,
): Promise<ApplicationListResult> {
  const params = new URLSearchParams({ tournamentId });
  if (filters.status !== undefined) params.set("status", String(filters.status));
  if (filters.nominationId) params.set("nominationId", filters.nominationId);

  const res = await apiFetch<{ applications?: Application[] }>(
    `/api/applications/overview?${params.toString()}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, applications: res.data.applications ?? [] };
}

/** confirmPaymentRequest — POST /api/applications/[id]/confirm-payment (admin). */
export async function confirmPaymentRequest(applicationId: string): Promise<ApplicationResult> {
  const res = await apiFetch<{ application?: Application }>(
    `/api/applications/${encodeURIComponent(applicationId)}/confirm-payment`,
    { method: "POST" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, application: res.data.application as Application };
}

/**
 * registerFighterRequest — POST /api/applications/[id]/register (admin).
 * Терминальный шаг флоу; capacityExceeded — мягкое предупреждение о
 * переполнении номинации (soft cap), не блокирует регистрацию.
 */
export async function registerFighterRequest(applicationId: string): Promise<RegisterFighterResult> {
  const res = await apiFetch<{ application?: Application; capacityExceeded?: boolean }>(
    `/api/applications/${encodeURIComponent(applicationId)}/register`,
    { method: "POST" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    application: res.data.application as Application,
    capacityExceeded: res.data.capacityExceeded ?? false,
  };
}

export type EditApplicationInput = {
  club?: string;
  needsEquipment?: boolean;
  applicantNameOverride?: string;
  nominationId?: string;
  state?: ApplicationState;
};

/**
 * editApplicationRequest — POST /api/applications/[id]/edit (admin). Правка
 * заявки: клуб, признак экипировки, переопределение имени, перенос номинации
 * и/или ручная смена статуса (спека 0006, FR-3..FR-9). Допустимо над заявкой
 * в любом состоянии.
 */
export async function editApplicationRequest(
  applicationId: string,
  input: EditApplicationInput,
): Promise<ApplicationResult> {
  const res = await apiFetch<{ application?: Application }>(
    `/api/applications/${encodeURIComponent(applicationId)}/edit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, application: res.data.application as Application };
}

export type ApplicationDetailResult =
  | { ok: true; application: Application; history: ApplicationEvent[] }
  | { ok: false; error: string };

/**
 * getApplicationRequest — GET /api/applications/[id] (owner заявки либо
 * admin, проверяется сервером). Заявка с историей событий — отдельно от
 * сводного списка (spec FR-16/FR-20): запрашивается только при открытии
 * карточки.
 */
export async function getApplicationRequest(applicationId: string): Promise<ApplicationDetailResult> {
  const res = await apiFetch<{ application?: Application; history?: ApplicationEvent[] }>(
    `/api/applications/${encodeURIComponent(applicationId)}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    application: res.data.application as Application,
    history: res.data.history ?? [],
  };
}
