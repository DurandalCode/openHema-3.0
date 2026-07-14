import type { FighterRef, PoolLayout, Pool } from "@/entities/pool/lib/types";

/**
 * moveFighterInLayout — чистая функция optimistic-обновления раскладки при
 * DnD: перемещает бойца из текущего места (нераспределённые или любой пул) в
 * целевой пул (`toPoolId` — id пула) либо в нераспределённые (`toPoolId ===
 * null`). Инвариант FR-1: боец ровно в одном месте после move. Не мутирует
 * исходный layout — возвращает новую структуру.
 *
 * Используется в `onMutate` мутаций assign/unassign для мгновенного отражения
 * перетаскивания в UI, чтобы DropOverlay dnd-kit не «улетала обратно» в
 * исходную колонку перед приходом ответа сервера.
 */
export function moveFighterInLayout(
  layout: PoolLayout,
  fighterId: string,
  toPoolId: string | null,
): PoolLayout {
  let found: FighterRef | undefined;
  const unassigned = layout.unassigned.filter((f) => {
    if (f.fighterId === fighterId) {
      found = f;
      return false;
    }
    return true;
  });
  const pools: Pool[] = layout.pools.map((p) => {
    const members = p.members.filter((m) => {
      if (m.fighterId === fighterId) {
        found = m;
        return false;
      }
      return true;
    });
    return { ...p, members };
  });
  if (found === undefined) {
    return layout; // боец не найден — no-op (не должен случаться для DnD)
  }
  if (toPoolId === null) {
    return { ...layout, unassigned: [...unassigned, found], pools };
  }
  const target = pools.find((p) => p.id === toPoolId);
  if (target === undefined) {
    return layout; // целевой пул исчез — no-op,rollback даст корректный ответ
  }
  target.members = [...target.members, found];
  return { ...layout, unassigned: unassigned, pools };
}