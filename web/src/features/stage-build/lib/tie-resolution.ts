import type { StageBuildTie, TieResolution } from "@/entities/stage/lib/types";

/**
 * tie-resolution — чистая логика сбора ответов организатора на дележи мест
 * (0019, FR-22): диалог формирования (`ui/build-stage-dialog.tsx`) держит
 * `TieResolution[]` в локальном состоянии и обновляет его этими функциями
 * по мере того, как организатор кликает претендентов дележа в порядке
 * прохода — первые `slotsLeft` кликов проходят (FR-22, порядок важен).
 *
 * Цикл использования: превью без `ties` в теле → сервер вернул
 * `preview.ties` непустым → организатор разрешает каждый через
 * `toggleTieContender`/`setTieResolution` → как только `resolutionsComplete`
 * — повторный вызов превью с накопленными `ties` в теле → сервер вернул
 * `preview.ties: []` (дележей больше нет, сервер подтвердил разрешение) →
 * можно формировать (`use-build-stage`). Расформирование и повторное
 * формирование не переиспользуют старые ответы — FR-24, диалог просто не
 * хранит их между открытиями (единственный источник truth — state компонента,
 * не персистится).
 */

/** tieKey — идентификатор дележа: пул источника + место (пусто в `sourcePoolId` — дележ сводного порядка, FR-5). */
export function tieKey(tie: Pick<StageBuildTie, "sourcePoolId" | "place">): string {
  return `${tie.sourcePoolId}::${tie.place}`;
}

/** findTieResolution — уже накопленный ответ на конкретный дележ, если есть. */
export function findTieResolution(
  resolutions: TieResolution[],
  tie: Pick<StageBuildTie, "sourcePoolId" | "place">,
): TieResolution | undefined {
  return resolutions.find((r) => tieKey(r) === tieKey(tie));
}

/**
 * setTieResolution — заменяет (или добавляет) ответ на дележ целиком.
 * Используется, когда порядок собирается извне (например, сброс дележа).
 */
export function setTieResolution(
  resolutions: TieResolution[],
  resolution: TieResolution,
): TieResolution[] {
  const filtered = resolutions.filter((r) => tieKey(r) !== tieKey(resolution));
  return [...filtered, resolution];
}

/** clearTieResolution — убирает ответ на дележ (например, «начать заново»). */
export function clearTieResolution(
  resolutions: TieResolution[],
  tie: Pick<StageBuildTie, "sourcePoolId" | "place">,
): TieResolution[] {
  return resolutions.filter((r) => tieKey(r) !== tieKey(tie));
}

/**
 * toggleTieContender — клик по претенденту дележа (FR-22): ещё не выбран и
 * лимит `tie.slotsLeft` не исчерпан → добавляется последним (порядок клика =
 * порядок прохода); уже выбран → убирается; лимит исчерпан и претендент не
 * выбран → клик не действует (сначала снять лишнего).
 */
export function toggleTieContender(
  resolutions: TieResolution[],
  tie: StageBuildTie,
  fighterId: string,
): TieResolution[] {
  const current = findTieResolution(resolutions, tie);
  const order = current?.fighterIds ?? [];

  if (order.includes(fighterId)) {
    const next = order.filter((id) => id !== fighterId);
    return next.length === 0
      ? clearTieResolution(resolutions, tie)
      : setTieResolution(resolutions, {
          sourcePoolId: tie.sourcePoolId,
          place: tie.place,
          fighterIds: next,
        });
  }

  if (order.length >= tie.slotsLeft) return resolutions;

  return setTieResolution(resolutions, {
    sourcePoolId: tie.sourcePoolId,
    place: tie.place,
    fighterIds: [...order, fighterId],
  });
}

/** isTieResolved — на дележ выбрано ровно `slotsLeft` претендентов, в порядке прохода. */
export function isTieResolved(resolutions: TieResolution[], tie: StageBuildTie): boolean {
  const resolution = findTieResolution(resolutions, tie);
  return (resolution?.fighterIds.length ?? 0) === tie.slotsLeft;
}

/** allTiesResolved — все дележи превью разрешены (гейт кнопки «Сформировать», FR-22). */
export function allTiesResolved(ties: StageBuildTie[], resolutions: TieResolution[]): boolean {
  return ties.every((tie) => isTieResolved(resolutions, tie));
}
