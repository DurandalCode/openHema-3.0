import type { PoolStanding } from "@/entities/pool/lib/types";

/**
 * PoolStandingsTable — итоговая таблица пула (спека 0016): место, боец,
 * победы/ничьи/поражения, набранные/пропущенные очки. `standings` уже
 * отсортирован и несёт готовое место от сервера (FR-8) — компонент только
 * отображает переданный порядок, без пересортировки. Возвращает `null`, если
 * у пула ещё нет ни одного завершённого боя (FR-7, пустой массив).
 *
 * Живёт в `entities/pool/ui`, а не в `features/nomination-pools/ui`, т.к.
 * переиспользуется и admin-фичей (`features/nomination-pools`), и
 * public-виджетом (`widgets/nomination-pools-public`) — по FSD-границам
 * общий UI на этом уровне может жить только в `entities`/`shared`.
 */
export function PoolStandingsTable({ standings }: { standings: PoolStanding[] }) {
  if (standings.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="py-1 pr-2 text-left font-medium">#</th>
            <th className="py-1 pr-2 text-left font-medium">Боец</th>
            <th className="py-1 px-1 text-right font-medium">П</th>
            <th className="py-1 px-1 text-right font-medium">Н</th>
            <th className="py-1 px-1 text-right font-medium">Пор</th>
            <th className="py-1 px-1 text-right font-medium">+О</th>
            <th className="py-1 pl-1 text-right font-medium">−О</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.fighter.fighterId} className="border-b last:border-0">
              <td className="py-1 pr-2 tabular-nums">{s.place}</td>
              <td className="py-1 pr-2">
                {s.fighter.name}
                {s.fighter.club && (
                  <span className="ml-1 text-xs text-muted-foreground">({s.fighter.club})</span>
                )}
              </td>
              <td className="py-1 px-1 text-right tabular-nums">{s.wins}</td>
              <td className="py-1 px-1 text-right tabular-nums">{s.draws}</td>
              <td className="py-1 px-1 text-right tabular-nums">{s.losses}</td>
              <td className="py-1 px-1 text-right tabular-nums">{s.pointsScored}</td>
              <td className="py-1 pl-1 text-right tabular-nums">{s.pointsConceded}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
