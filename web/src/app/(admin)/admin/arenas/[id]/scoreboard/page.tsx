import { notFound } from "next/navigation";
import { getArena } from "@/entities/arena/model/get-arena";
import { getArenaLiveBoard } from "@/entities/arena-live/model/get-arena-live";
import { ArenaScoreboard } from "@/widgets/arena-scoreboard/arena-scoreboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

/**
 * /admin/arenas/[id]/scoreboard — полноэкранное табло арены (спека 0015,
 * FR-1): admin-only (защищено layout-guard `(admin)` на роль ADMIN — как
 * все страницы этой группы), открывается организатором на проекторе/втором
 * экране. Server component: SSR `getArena` (имя) + `getArenaLiveBoard`
 * (доска, чтобы табло не мигало пустотой до первого SSE-кадра — таймер и
 * состав комнаты эфемерны, ADR 0013, и появятся из первого живого кадра).
 */
export default async function ArenaScoreboardPage({ params }: PageProps) {
  const { id } = await params;
  const arena = await getArena(id);
  if (!arena) {
    notFound();
  }
  const board = await getArenaLiveBoard(id);

  return <ArenaScoreboard arenaId={id} arenaName={arena.name} initialBoard={board} />;
}
