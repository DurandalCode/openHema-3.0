/**
 * Сводка приёма заявок по турниру целиком (спека 0034, FR-5, AC-3/AC-4).
 */

import type { NominationParticipants } from "./types";

export type ApplicationsSummary = {
  applied: number;
  confirmed: number;
  // capacity — сумма fighterCapacity по номинациям, где она задана; null,
  // если ни у одной номинации вместимость не задана (FR-5: блок сводки не
  // показывается вовсе, если совсем нечего просуммировать — это решает
  // компонент по этому полю, не эта функция).
  capacity: number | null;
};

/**
 * applicationsSummary суммирует заявки/подтверждения/вместимость по всем
 * номинациям турнира. `capacity` складывается только из номинаций, где
 * `fighterCapacity` задан — если ни у одной не задан, `capacity` остаётся
 * `null` (а не `0`), чтобы отличить «вместимость нигде не задана» от
 * «вместимость задана и равна нулю».
 *
 * Решение по «нечего показывать» (FR-5): эта функция не возвращает
 * отдельный флаг вроде `hasAnything` — компонент решает сам, проверяя, что
 * `applied === 0 && confirmed === 0 && capacity === null`. Отдельного поля
 * не заведено, потому что этот же результат уже полностью описывает
 * состояние «нечего суммировать» без дублирования логики в двух местах.
 */
export function applicationsSummary(
  byNomination: Record<string, NominationParticipants>,
): ApplicationsSummary {
  let applied = 0;
  let confirmed = 0;
  let capacity: number | null = null;

  for (const participants of Object.values(byNomination)) {
    applied += participants.appliedCount;
    confirmed += participants.confirmedCount;
    if (participants.fighterCapacity !== null) {
      capacity = (capacity ?? 0) + participants.fighterCapacity;
    }
  }

  return { applied, confirmed, capacity };
}
