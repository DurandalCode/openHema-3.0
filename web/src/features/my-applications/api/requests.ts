import type { Application } from "@/entities/application/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";

export type ApplicationResult =
  | { ok: true; application: Application }
  | { ok: false; error: string; status?: number };

export type ApplicationListResult =
  | { ok: true; applications: Application[] }
  | { ok: false; error: string; status?: number };

/** listMyApplicationsRequest — GET /api/applications («мои заявки»). */
export async function listMyApplicationsRequest(): Promise<ApplicationListResult> {
  const res = await apiFetch<{ applications?: Application[] }>("/api/applications", {
    method: "GET",
  });
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true, applications: res.data.applications ?? [] };
}

export type SubmitApplicationDetails = {
  club?: string;
  needsEquipment?: boolean;
};

/**
 * submitApplicationRequest — POST /api/applications (подать заявку).
 * club/needsEquipment — доп. поля заявки, указываемые бойцом при подаче
 * (спека 0006, FR-1).
 */
export async function submitApplicationRequest(
  nominationId: string,
  details: SubmitApplicationDetails = {},
): Promise<ApplicationResult> {
  return post("/api/applications", {
    nominationId,
    club: details.club ?? "",
    needsEquipment: details.needsEquipment ?? false,
  });
}

/** declarePaymentRequest — POST /api/applications/[id]/declare-payment. */
export async function declarePaymentRequest(applicationId: string): Promise<ApplicationResult> {
  return post(`/api/applications/${encodeURIComponent(applicationId)}/declare-payment`);
}

/** withdrawApplicationRequest — POST /api/applications/[id]/withdraw. */
export async function withdrawApplicationRequest(applicationId: string): Promise<ApplicationResult> {
  return post(`/api/applications/${encodeURIComponent(applicationId)}/withdraw`);
}

async function post(url: string, body?: unknown): Promise<ApplicationResult> {
  const res = await apiFetch<{ application?: Application }>(url, {
    method: "POST",
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true, application: res.data.application as Application };
}
