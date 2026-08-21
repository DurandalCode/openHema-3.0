import type { JournalEntryDto } from "@/entities/arena-live/lib/journal";

export type JournalResult =
  | { ok: true; entries: JournalEntryDto[] }
  | { ok: false; error: string };

/**
 * getArenaJournalRequest — GET /api/arenas/[id]/journal (только admin, спека
 * 0033, FR-33): журнал боёв пула, стоящего на площадке, новыми записями
 * вперёд. Пустой массив, если на арене никто не стоит — не ошибка (AC-20).
 */
export async function getArenaJournalRequest(arenaId: string): Promise<JournalResult> {
  try {
    const res = await fetch(`/api/arenas/${encodeURIComponent(arenaId)}/journal`, {
      method: "GET",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { entries?: JournalEntryDto[] };
    return { ok: true, entries: data.entries ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}
