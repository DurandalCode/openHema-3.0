import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getArena } from "@/entities/arena/model/get-arena";
import { getArenaLiveBoard } from "@/entities/arena-live/model/get-arena-live";
import { ArenaConsole } from "@/widgets/arena-console/arena-console";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

/**
 * /admin/arenas/[id] — стабильный URL страницы площадки (FR-9), спека 0033:
 * консоль с двумя режимами — «Управление ареной» (постановка/снятие пула,
 * ведение боя, таймер) и «Ведение боя» (полноэкранная панель секретаря).
 * Режим — query-параметр `?mode=bout` на этом же пути (FR-1), поэтому
 * `<Suspense>` вокруг `ArenaConsole` (клиентский компонент, читает
 * `useSearchParams`) — требование Next.js App Router, не выбор дизайна.
 *
 * Серверный компонент: SSR `getArena` (имя) + `getArenaLiveBoard` (доска,
 * чтобы страница не мигала пустотой до первого кадра живого канала — тот же
 * приём, что уже использует страница табло, спека 0015 T13).
 */
export default async function AdminArenaPage({ params }: PageProps) {
  const { id } = await params;
  const arena = await getArena(id);
  if (!arena) {
    notFound();
  }
  const board = await getArenaLiveBoard(id);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Suspense fallback={null}>
        <ArenaConsole arenaId={arena.id} arenaName={arena.name} initialBoard={board} />
      </Suspense>
    </div>
  );
}
