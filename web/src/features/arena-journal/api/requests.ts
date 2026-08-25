import type { JournalEntryDto } from "@/entities/arena-live/lib/journal";
import { apiFetch } from "@/shared/api/api-fetch";

export type JournalResult =
  | { ok: true; entries: JournalEntryDto[] }
  | { ok: false; error: string };

/**
 * getArenaJournalRequest — GET /api/arenas/[id]/journal (только admin, спека
 * 0033, FR-33): журнал боёв пула, стоящего на площадке, новыми записями
 * вперёд. Пустой массив, если на арене никто не стоит — не ошибка (AC-20).
 */
export async function getArenaJournalRequest(arenaId: string): Promise<JournalResult> {
  const res = await apiFetch<{ entries?: JournalEntryDto[] }>(
    `/api/arenas/${encodeURIComponent(arenaId)}/journal`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, entries: res.data.entries ?? [] };
}
