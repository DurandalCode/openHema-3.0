import type { Bracket, BracketRound, BracketSlot } from "@/entities/bracket/lib/types";
import type { FighterRef } from "@/entities/pool/lib/types";

const EMPTY_FIGHTER: FighterRef = { fighterId: "", name: "", club: "" };

function emptySlot(slot: BracketSlot): BracketSlot {
  return { ...slot, state: "BRACKET_SLOT_STATE_EMPTY", fighter: EMPTY_FIGHTER, sourceLabel: "" };
}

function filledSlot(slot: BracketSlot, fighter: FighterRef): BracketSlot {
  return { ...slot, state: "BRACKET_SLOT_STATE_FILLED", fighter, sourceLabel: "" };
}

/** removeFighter — убирает бойца с fighterId из нераспределённых/первого круга, оставляя пустой слот на его месте. */
function removeFighter(
  bracket: Bracket,
  fighterId: string,
): { unassigned: FighterRef[]; rounds: BracketRound[]; fighter: FighterRef | undefined } {
  let fighter: FighterRef | undefined;

  const unassigned = bracket.unassigned.filter((f) => {
    if (f.fighterId === fighterId) {
      fighter = f;
      return false;
    }
    return true;
  });

  const rounds: BracketRound[] = bracket.rounds.map((round, ri) => {
    if (ri !== 0) return round;
    return {
      ...round,
      halves: round.halves.map((half) => ({
        ...half,
        pairs: half.pairs.map((pair) => {
          let slotA = pair.slotA;
          let slotB = pair.slotB;
          if (slotA.fighter.fighterId === fighterId) {
            fighter = slotA.fighter;
            slotA = emptySlot(slotA);
          }
          if (slotB.fighter.fighterId === fighterId) {
            fighter = slotB.fighter;
            slotB = emptySlot(slotB);
          }
          return { ...pair, slotA, slotB };
        }),
      })),
    };
  });

  return { unassigned, rounds, fighter };
}

function placeInSlot(rounds: BracketRound[], slot: number, fighter: FighterRef): BracketRound[] {
  return rounds.map((round, ri) => {
    if (ri !== 0) return round;
    return {
      ...round,
      halves: round.halves.map((half) => ({
        ...half,
        pairs: half.pairs.map((pair) => {
          let slotA = pair.slotA;
          let slotB = pair.slotB;
          if (slotA.slot === slot) slotA = filledSlot(slotA, fighter);
          if (slotB.slot === slot) slotB = filledSlot(slotB, fighter);
          return { ...pair, slotA, slotB };
        }),
      })),
    };
  });
}

function findSlot(rounds: BracketRound[], slot: number): BracketSlot | undefined {
  for (const pair of rounds[0]?.halves.flatMap((h) => h.pairs) ?? []) {
    if (pair.slotA.slot === slot) return pair.slotA;
    if (pair.slotB.slot === slot) return pair.slotB;
  }
  return undefined;
}

/**
 * seedFighterInBracket — optimistic-обновление первого круга сетки при
 * DnD-посеве (спека 0018, FR-7): переносит бойца в целевой слот. Правит
 * только первый круг — только он посевной вручную (FR-6), дальнейшие круги
 * вычисляются сервером. Не мутирует исходный bracket.
 *
 * Целевой слот, уже занятый другим бойцом, оптимистично не трогаем: обмен
 * (FR-8) или отказ решает сервер, здесь дожидаемся настоящего ответа, чтобы
 * не рисовать состояние, которое сервер может не подтвердить.
 */
export function seedFighterInBracket(bracket: Bracket, fighterId: string, slot: number): Bracket {
  const target = findSlot(bracket.rounds, slot);
  if (!target || target.state === "BRACKET_SLOT_STATE_FILLED") return bracket;

  const { unassigned, rounds, fighter } = removeFighter(bracket, fighterId);
  if (fighter === undefined) return bracket; // боец не найден — no-op

  return { ...bracket, unassigned, rounds: placeInSlot(rounds, slot, fighter) };
}

/**
 * clearSlotInBracket — optimistic-обновление: освобождает слот первого
 * круга, возвращает его бойца в нераспределённые (FR-8). Не мутирует
 * исходный bracket.
 */
export function clearSlotInBracket(bracket: Bracket, slot: number): Bracket {
  const target = findSlot(bracket.rounds, slot);
  if (!target || target.state !== "BRACKET_SLOT_STATE_FILLED") return bracket;

  const { unassigned, rounds, fighter } = removeFighter(bracket, target.fighter.fighterId);
  if (fighter === undefined) return bracket;

  return { ...bracket, unassigned: [...unassigned, fighter], rounds };
}
