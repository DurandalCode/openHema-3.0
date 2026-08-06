import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { Row } from "@/shared/ui/stack";
import { getNomination } from "@/entities/nomination/model/get-nomination";
import { NominationPools } from "@/features/nomination-pools/ui/nomination-pools";
import { BracketSeeding } from "@/features/bracket-seeding/ui/bracket-seeding";
import { AdminHeader } from "../../../../admin-header";
import { getStages } from "../get-stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string; stageId: string }> };

/**
 * /admin/nominations/[id]/stages/[stageId] — работа с составом одного этапа
 * (спека 0018, FR-18): групповой этап рендерит существующий экран раскладки
 * (`NominationPools`, спека 0009), сетка — экран посева/сетки
 * (`BracketSeeding`, FR-7/FR-8). Тип этапа известен серверу из `ListStages`
 * (`getStages`, прямой gRPC `StageAdminService.ListStages` — `GetStage` RPC
 * не существует, `plan.md` «Контракты»), поэтому нужный виджет выбирается на
 * сервере, без лишнего round-trip на клиенте (`plan.md`, «Маршруты страниц»).
 */
export default async function AdminStagePage({ params }: PageProps) {
  const { id, stageId } = await params;
  const nomination = await getNomination(id);
  if (!nomination) {
    notFound();
  }

  const stages = await getStages(id);
  const stage = stages.find((s) => s.id === stageId);
  if (!stage) {
    notFound();
  }

  const isBracket = stage.type === "STAGE_TYPE_BRACKET";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16">
      <Row align="center" justify="between" gap={4} className="flex-wrap">
        <AdminHeader
          title={`${stage.title} — ${nomination.title}`}
          description={
            isBracket
              ? "Ручной посев слотов и сетка этапа."
              : "Раскладка бойцов этапа по группам."
          }
        />
        <Button variant="outline" asChild>
          <Link href={`/admin/nominations/${id}/stages`}>← Все этапы</Link>
        </Button>
      </Row>

      <div className="mt-8">
        {isBracket ? <BracketSeeding stageId={stageId} /> : <NominationPools stageId={stageId} />}
      </div>
    </div>
  );
}
