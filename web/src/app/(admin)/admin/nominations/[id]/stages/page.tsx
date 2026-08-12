import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import { getNomination } from "@/entities/nomination/model/get-nomination";
import { getNominationResults } from "@/entities/nomination-results/model/get-nomination-results";
import { StageManagement } from "@/features/stage-management/ui/stage-management";
import { NominationResults } from "@/widgets/nomination-results/nomination-results";
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
 *
 * Итоговый протокол (спека 0021, FR-19) — `NominationResults` с
 * `showUnfinished`: организатор видит и доигранные секции с местами, и
 * недоигранные с пометкой «этап не доигран» (сценарий 7 — почему номинация
 * ещё не завершена). Данные — server-side через `getNominationResults`
 * (BFF-эквивалент `GetNominationResults`, T11/T12); живой канал (0014) здесь
 * не нужен — организатор сам обновляет страницу.
 */
export default async function AdminNominationStagesPage({ params }: PageProps) {
  const { id } = await params;
  const nomination = await getNomination(id);
  if (!nomination) {
    notFound();
  }

  const results = await getNominationResults(id);

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

      <Col gap={8} className="mt-8">
        <NominationResults results={results} showUnfinished />
        <StageManagement nominationId={id} />
      </Col>
    </div>
  );
}
