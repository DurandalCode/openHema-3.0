import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { Row } from "@/shared/ui/stack";
import { getNomination } from "@/entities/nomination/model/get-nomination";
import { NominationPools } from "@/features/nomination-pools/ui/nomination-pools";
import { AdminHeader } from "../../../admin-header";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

/**
 * /admin/nominations/[id]/pools — экран управления составом номинации:
 * нераспределённые бойцы + пулы, drag & drop, автораспределение, undo,
 * статус draft/ready (спека 0009). Серверная обёртка получает номинацию для
 * заголовка; сама раскладка — client-side (`NominationPools`, TanStack
 * Query) — экран интерактивный (DnD), SSR-prefetch не даёт выгоды здесь.
 */
export default async function AdminNominationPoolsPage({ params }: PageProps) {
  const { id } = await params;
  const nomination = await getNomination(id);
  if (!nomination) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16">
      <Row align="center" justify="between" gap={4} className="flex-wrap">
        <AdminHeader
          title={`Пулы — ${nomination.title}`}
          description="Раскладка бойцов номинации по группам перед отбором."
        />
        <Button variant="outline" asChild>
          <Link href="/admin/nominations">← Все номинации</Link>
        </Button>
      </Row>

      <div className="mt-8">
        <NominationPools nominationId={id} />
      </div>
    </div>
  );
}
