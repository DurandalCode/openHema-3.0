import type { LiveArenaDto } from "@/entities/tournament-live/lib/types";
import { ArenaCard } from "./arena-card";

/**
 * ArenasNow — блок «Площадки прямо сейчас» (спека 0034, FR-14). Карточка на
 * каждую неархивную площадку в её собственном admin-порядке (`position`,
 * спека 0027) — сортировка здесь, а не на сервере, чтобы виджет оставался
 * презентационным и не зависел от порядка, в котором пришёл массив.
 *
 * Не рендерится в фазе «завершён» (FR-23) — это решает вызывающая
 * композиция (`home-screen.tsx`, T23), не этот компонент.
 */
export function ArenasNow({ arenas }: { arenas: LiveArenaDto[] }) {
  if (arenas.length === 0) return null;

  const sorted = [...arenas].sort((a, b) => a.position - b.position);

  return (
    <section id="arenas-now" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-8">
      <h2 className="mb-4 text-xl font-semibold tracking-tight">Площадки прямо сейчас</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((arena) => (
          <ArenaCard key={arena.arenaId} arena={arena} />
        ))}
      </div>
    </section>
  );
}
