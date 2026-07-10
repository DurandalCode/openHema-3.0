import type { Application } from "@/entities/application/lib/types";

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

  try {
    const res = await fetch(`/api/applications/overview?${params.toString()}`, {
      method: "GET",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { applications?: Application[] };
    return { ok: true, applications: data.applications ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/** confirmPaymentRequest — POST /api/applications/[id]/confirm-payment (admin). */
export async function confirmPaymentRequest(applicationId: string): Promise<ApplicationResult> {
  try {
    const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/confirm-payment`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { application?: Application };
    return { ok: true, application: data.application as Application };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/**
 * registerFighterRequest — POST /api/applications/[id]/register (admin).
 * Терминальный шаг флоу; capacityExceeded — мягкое предупреждение о
 * переполнении номинации (soft cap), не блокирует регистрацию.
 */
export async function registerFighterRequest(applicationId: string): Promise<RegisterFighterResult> {
  try {
    const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/register`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as {
      application?: Application;
      capacityExceeded?: boolean;
    };
    return {
      ok: true,
      application: data.application as Application,
      capacityExceeded: data.capacityExceeded ?? false,
    };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}
