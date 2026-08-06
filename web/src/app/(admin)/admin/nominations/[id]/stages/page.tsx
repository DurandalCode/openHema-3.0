import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { Row } from "@/shared/ui/stack";
import { getNomination } from "@/entities/nomination/model/get-nomination";
import { StageManagement } from "@/features/stage-management/ui/stage-management";
import { AdminHeader } from "../../../admin-header";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

/**
 * /admin/nominations/[id]/stages — список этапов номинации + добавление
 * этапа-сетки (спека 0018, FR-2/FR-18/FR-2; заменяет `.../pools`, NFR-1:
 * совместимость адресов не требуется). Серверная обёртка получает номинацию
 * для заголовка; список этапов и создание/удаление — client-side
 * (`StageManagement`, TanStack Query), как раньше было с `NominationPools` на
 * `.../pools`.
 */
export default async function AdminNominationStagesPage({ params }: PageProps) {
  const { id } = await params;
  const nomination = await getNomination(id);
  if (!nomination) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16">
      <Row align="center" justify="between" gap={4} className="flex-wrap">
        <AdminHeader
          title={`Этапы — ${nomination.title}`}
          description="Групповые этапы и плейофф-сетки номинации."
        />
        <Button variant="outline" asChild>
          <Link href="/admin/nominations">← Все номинации</Link>
        </Button>
      </Row>

      <div className="mt-8">
        <StageManagement nominationId={id} />
      </div>
    </div>
  );
}
