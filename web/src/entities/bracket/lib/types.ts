/**
 * Плейофф-сетка номинации (спека 0018, ADR 0014 §1a/§3/§4): дерево слотов
 * этапа-сетки, вычисленное сервером из посева и завершённых боёв
 * (`ResolveBracket`, `plan.md` §«Server (модули и слои)»). Read-only проекция
 * — клиент ничего не пересчитывает, только отображает готовые круги/пары.
 *
 * Сериализуемая форма (без bigint/Date), формы полей — camelCase-перевод
 * proto-сообщений `Bracket`/`BracketRound`/`BracketHalf`/`BracketPair`/
 * `BracketSlot`/`BracketSlotState`/`BracketConfig` (`plan.md`, «Контракты
 * (proto)»). `FighterRef`/`BoardBout`/`Pool` переиспользуются из
 * `entities/pool` — та же форма, что и у групп (0011/0013), сетка не заводит
 * вторую копию.
 */

import type { BoardBout, FighterRef, Pool } from "@/entities/pool/lib/types";
import type { Stage } from "@/entities/stage/lib/types";

/**
 * BracketConfig — параметры этапа-сетки (FR-1): `size` — число слотов
 * первого круга (степень двойки 4/8/16/32), `thirdPlace` — включён ли бой за
 * 3-е место. Задаётся при создании этапа и не редактируется (FR-4).
 */
export type BracketConfig = {
  size: number;
  thirdPlace: boolean;
};

/**
 * BracketSlotState — состояние слота круга (FR-9/FR-13): занят бойцом,
 * законно пуст (недобор/бай) либо ждёт победителя ещё не сыгранной пары
 * предыдущего круга.
 */
export type BracketSlotState =
  | "BRACKET_SLOT_STATE_UNSPECIFIED"
  | "BRACKET_SLOT_STATE_FILLED"
  | "BRACKET_SLOT_STATE_EMPTY"
  | "BRACKET_SLOT_STATE_PENDING";

/**
 * BracketSlot — один слот круга. `slot` — сквозной номер слота внутри круга
 * (1-based, тем же именем адресуется посев — `plan.md`). `fighter` заполнен
 * только у `FILLED` (иначе — объект с пустыми полями, как `FighterRef` везде
 * в проекте, а не `null` — `entities/pool/lib/types.ts`). `sourceLabel`
 * заполнен только у `PENDING`: «Победитель пары 3, 1/4 финала» (FR-13) —
 * строку формирует сервер, клиент её не собирает.
 */
export type BracketSlot = {
  slot: number;
  state: BracketSlotState;
  fighter: FighterRef;
  sourceLabel: string;
};

/**
 * BracketPair — пара круга: слоты `2i-1` и `2i` (FR-6). `bout` заполнен,
 * только когда пара материализована (обе стороны известны, FR-13) — иначе
 * `null`, как `BoutBoard.pool` для свободной арены (`entities/pool/lib/types.ts`).
 * `resolved` — пара разрешена: бой завершён либо разрешение боя не
 * потребовало (бай, пара из двух пустых слотов) — из этого складывается
 * «половина завершена» (FR-17).
 */
export type BracketPair = {
  index: number;
  slotA: BracketSlot;
  slotB: BracketSlot;
  bout: BoardBout | null;
  resolved: boolean;
};

/**
 * BracketHalf — половина круга: контейнер боёв (FR-12/FR-12a). `half`: 1 —
 * верхняя, 2 — нижняя; у неделимого круга (финал, бой за 3-е место) ровно
 * один элемент с `half = 1` и пустым `title`. `container` — тот же `Pool`,
 * что и у группы: его `name` уже несёт готовую подпись контейнера
 * («1/4 финала, верхняя половина», FR-19a), `status`/`arenaId`/`arenaName` —
 * тот же исполнительный статус, что и у пула (0011/0013).
 */
export type BracketHalf = {
  half: number;
  title: string;
  container: Pool;
  pairs: BracketPair[];
  currentBoutId: string;
};

/**
 * BracketRound — круг сетки. `number`: 1 — первый круг, растёт к финалу;
 * бой за 3-е место — последний круг с `thirdPlace = true`. `halves` — одна
 * или две половины (FR-6a).
 */
export type BracketRound = {
  number: number;
  title: string;
  thirdPlace: boolean;
  halves: BracketHalf[];
};

/**
 * Bracket — сетка целиком: этап + круги. `unassigned` заполнен только на
 * админском пути (кого ещё можно посеять, FR-7); в публичном снапшоте пуст.
 * `champion`/`thirdPlaceWinner` — `null`, пока финал/бой за 3-е место не
 * завершены; это отображение, выведенное из завершённых боёв (FR-20), не
 * доменный факт — итоговый протокол номинации остаётся за планом 0021.
 */
export type Bracket = {
  stage: Stage;
  rounds: BracketRound[];
  unassigned: FighterRef[];
  canUndo: boolean;
  champion: FighterRef | null;
  thirdPlaceWinner: FighterRef | null;
};

/**
 * bracketResultsSignature — компактный отпечаток РЕЗУЛЬТАТОВ сетки (спека
 * 0051): состояние и счёт каждой пары, в порядке кругов и половин. Нужен
 * ровно для одного: понять, изменилось ли в сетке что-то, ради чего стоит
 * перечитать её админский вид.
 *
 * Зачем отпечаток, а не «перечитывать на каждый живой кадр»: кадр номинации
 * приходит на любое изменение — в том числе на чужой групповой бой и на
 * каждое начисление очка, — и слепая инвалидация превратила бы живой канал в
 * опрос сервера в цикле (NFR-1 прямо это запрещает).
 *
 * Посев и `unassigned` в отпечаток не входят намеренно: они меняются
 * действиями самого админа, и их инвалидация уже висит на мутациях
 * (`use-seed-slot`, `use-clear-slot`, …).
 */
export function bracketResultsSignature(bracket: Bracket): string {
  const parts: string[] = [];
  for (const round of bracket.rounds) {
    for (const half of round.halves) {
      for (const pair of half.pairs) {
        const bout = pair.bout;
        parts.push(bout ? `${bout.id}:${bout.state}:${bout.scoreA}:${bout.scoreB}` : "-");
      }
    }
  }
  return parts.join("|");
}

/**
 * bracketRoundOneFilledCount — число занятых слотов первого круга (спека
 * 0032, join): «Заполнено N / M» страницы этапа для сетки. Та же логика,
 * что `stageProgressFromSnapshot` (`entities/stage/lib/progress.ts`)
 * использует для счётчика бойцов в правом рельсе — вынесена сюда как
 * переиспользуемая чистая функция вместо дублирования подсчёта.
 */
export function bracketRoundOneFilledCount(bracket: Bracket): number {
  const firstRound = bracket.rounds.find((round) => round.number === 1);
  if (!firstRound) return 0;
  let count = 0;
  for (const half of firstRound.halves) {
    for (const pair of half.pairs) {
      if (pair.slotA.state === "BRACKET_SLOT_STATE_FILLED") count += 1;
      if (pair.slotB.state === "BRACKET_SLOT_STATE_FILLED") count += 1;
    }
  }
  return count;
}

/**
 * bracketFinalRounds выделяет финал и бой за 3-е место сетки (спека 0035,
 * FR-18): финал — круг с наибольшим `number` среди кругов с `thirdPlace ===
 * false` (сам чемпионский бой); бой за 3-е место — единственный круг с
 * `thirdPlace === true` (см. доккомментарий `BracketRound.thirdPlace`). На
 * сетке без кругов оба значения — `null`.
 */
export function bracketFinalRounds(bracket: Bracket): {
  final: BracketRound | null;
  thirdPlace: BracketRound | null;
} {
  const thirdPlace = bracket.rounds.find((round) => round.thirdPlace) ?? null;
  const finalCandidates = bracket.rounds.filter((round) => !round.thirdPlace);
  const final = finalCandidates.reduce<BracketRound | null>((best, round) => {
    if (!best || round.number > best.number) return round;
    return best;
  }, null);
  return { final, thirdPlace };
}
