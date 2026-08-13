import type { Fighter, FighterStatus } from "@/entities/fighter/lib/types";
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

export type FighterFilters = {
  statuses?: Set<FighterStatus>;
  /** Боец подходит, если у него есть АКТИВНОЕ участие хотя бы в одной (spec AC-4). */
  nominationIds?: Set<string>;
  /** "" представляет пункт «Без клуба» (spec FR-9). */
  clubs?: Set<string>;
  query?: string;
};

/**
 * filterFighters — статусы/номинации/клубы: пустой набор = без фильтра,
 * иначе множественный выбор внутри измерения (ИЛИ); измерения объединяются
 * логическим И (spec FR-8..FR-10).
 */
export function filterFighters(
  fighters: Fighter[],
  { statuses, nominationIds, clubs, query }: FighterFilters,
): Fighter[] {
  const q = (query ?? "").trim().toLowerCase();
  return fighters.filter((f) => {
    if (statuses && statuses.size > 0 && !statuses.has(f.status)) return false;
    if (nominationIds && nominationIds.size > 0) {
      const hasActiveIn = f.participations.some(
        (p) => p.status === "PARTICIPATION_STATUS_ACTIVE" && nominationIds.has(p.nominationId),
      );
      if (!hasActiveIn) return false;
    }
    if (clubs && clubs.size > 0 && !clubs.has(f.club.trim())) return false;
    if (q !== "" && !f.name.toLowerCase().includes(q) && !f.club.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}

export type StatusCounts = { active: number; withdrawn: number };

/**
 * statusCounts — счётчики по ВСЕМУ ростеру (spec FR-7/AC-2): вызывающая
 * сторона обязана передавать полный, не отфильтрованный по поиску/фильтрам
 * список.
 */
export function statusCounts(fighters: Fighter[]): StatusCounts {
  let active = 0;
  let withdrawn = 0;
  for (const f of fighters) {
    if (f.status === "FIGHTER_STATUS_ACTIVE") active += 1;
    else if (f.status === "FIGHTER_STATUS_WITHDRAWN") withdrawn += 1;
  }
  return { active, withdrawn };
}

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
