import type { Application } from "@/entities/application/lib/types";

export type ApplicationResult =
  | { ok: true; application: Application }
  | { ok: false; error: string };

export type ApplicationListResult =
  | { ok: true; applications: Application[] }
  | { ok: false; error: string };

/** listMyApplicationsRequest — GET /api/applications («мои заявки»). */
export async function listMyApplicationsRequest(): Promise<ApplicationListResult> {
  try {
    const res = await fetch("/api/applications", { method: "GET" });
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
  try {
    const res = await fetch(url, {
      method: "POST",
      ...(body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
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
