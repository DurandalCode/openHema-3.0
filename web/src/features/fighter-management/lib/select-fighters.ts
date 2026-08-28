import type { Fighter } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";

/**
 * sortFighters — детерминированный порядок ростера (spec FR-6/AC-1): сначала
 * активные, затем выбывшие; внутри группы — по имени. Не мутирует вход.
 */
export function sortFighters(fighters: Fighter[]): Fighter[] {
  return [...fighters].sort((a, b) => {
    const aWithdrawn = a.status === "FIGHTER_STATUS_WITHDRAWN";
    const bWithdrawn = b.status === "FIGHTER_STATUS_WITHDRAWN";
    if (aWithdrawn !== bWithdrawn) return aWithdrawn ? 1 : -1;
    return a.name.localeCompare(b.name, "ru");
  });
}

/**
 * StatusCounts — счётчики по ВСЕМУ ростеру турнира (spec FR-7/AC-2), не
 * зависят от активного фильтра/поиска. С спеки 0041 (T20) считаются на
 * сервере (`ListRoster.status_counts`, FR-4) — здесь остаётся только тип,
 * которым пользуется UI (`fighters-filters.tsx`).
 */
export type StatusCounts = { active: number; withdrawn: number };

export type ClubOptions = { clubs: string[]; hasNoClub: boolean };

/**
 * clubOptions — отсортированный список клубов ростера (spec FR-9): клуб —
 * свободный текст в карточке бойца, справочника клубов в системе нет.
 * Группировка — по значению после `trim` (нормализацию регистра не вводим,
 * plan «Риски»). `hasNoClub` — есть ли бойцы без клуба, для пункта
 * «Без клуба».
 */
export function clubOptions(fighters: Fighter[]): ClubOptions {
  const set = new Set<string>();
  let hasNoClub = false;
  for (const f of fighters) {
    const club = f.club.trim();
    if (club === "") {
      hasNoClub = true;
      continue;
    }
    set.add(club);
  }
  return { clubs: [...set].sort((a, b) => a.localeCompare(b, "ru")), hasNoClub };
}

/**
 * addableNominations — номинации, где у бойца ещё нет АКТИВНОГО участия
 * (spec FR-15/AC-9). Используется и «Добавить», и «Перевести».
 */
export function addableNominations(fighter: Fighter, nominations: Nomination[]): Nomination[] {
  const activeIds = new Set(
    fighter.participations
      .filter((p) => p.status === "PARTICIPATION_STATUS_ACTIVE")
      .map((p) => p.nominationId),
  );
  return nominations.filter((n) => !activeIds.has(n.id));
}
