import { notFound } from "next/navigation";
import { getNomination } from "@/entities/nomination/model/get-nomination";
import { StagePageScreen } from "@/widgets/stage-page/stage-page-screen";
import { getStages } from "../get-stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string; stageId: string }> };

/**
 * /admin/nominations/[id]/stages/[stageId] — страница этапа (спека 0032):
 * единый каркас (`PageHeader` + сводка + действия формирования + рельс) над
 * существующим экраном посева, выбранным по типу этапа (FR-9). Композиция
 * переехала в `widgets/stage-page/stage-page-screen.tsx` (NFR-2) — `AdminHeader`,
 * узкая колонка `max-w-6xl` и подпись «← Все этапы» отсюда ушли (FR-2/FR-4/
 * FR-10). Серверная обёртка отвечает только за `notFound()` (FR-27 — этап
 * ищется в списке `ListStages`, `GetStage` RPC не существует, `plan.md`
 * «Контракты») и сеет клиентский `useStages` уже загруженным списком
 * (`initialStages`) — первый рендер без скелетона.
 */
export default async function AdminStagePage({ params }: PageProps) {
  const { id, stageId } = await params;
  const nomination = await getNomination(id);
  if (!nomination) {
    notFound();
  }

  const stages = await getStages(id);
  if (!stages.some((s) => s.id === stageId)) {
    notFound();
  }

  return <StagePageScreen nomination={nomination} stageId={stageId} initialStages={stages} />;
}
