import Link from "next/link";
import { notFound } from "next/navigation";
import { getNomination } from "@/entities/nomination/model/get-nomination";
import { nominationStatusLabel } from "@/entities/nomination/lib/types";
import { getPublicPools } from "@/entities/pool/model/get-public-pools";
import { getPublicBouts } from "@/entities/bout/model/get-public-bouts";
import { Badge } from "@/shared/ui/badge";
import { Col, Row } from "@/shared/ui/stack";
import { NominationPoolsPublic } from "@/widgets/nomination-pools-public/nomination-pools-public";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

/**
 * /nominations/[id] — публичный экран номинации (спека 0011, FR-11): пулы
 * готовой раскладки с составом (имена/клубы, 0007), боями (пары + порядок,
 * 0010) и, если пул поставлен на арену — площадкой и ярлыком «готовится к
 * запуску» (FR-12/AC-12). Read-only, без авторизации, доступен любому
 * гостю/бойцу. Пока раскладка `draft` — пулы не показываются (AC-14):
 * решает сервер (`PoolPublicService`), страница лишь рендерит пустой
 * список через `NominationPoolsPublic`.
 *
 * SSR: `getNomination`/`getPublicPools`/`getPublicBouts` — публичные gRPC,
 * без access-токена (как публичный ростер 0007).
 *
 * Статус приёма заявок (спека 0012, FR-8/AC-14): бейдж рядом с `<h1>` при
 * `status !== OPEN` — гость должен видеть статус и на этом экране, не
 * только на главной.
 */
export default async function PublicNominationPage({ params }: PageProps) {
  const { id } = await params;
  const nomination = await getNomination(id);
  if (!nomination) {
    notFound();
  }

  const [pools, bouts] = await Promise.all([getPublicPools(id), getPublicBouts(id)]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16">
      <Col gap={2} className="mb-8">
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-2">
          ← На главную
        </Link>
        <Row align="center" gap={2}>
          <h1 className="text-3xl font-semibold tracking-tight">{nomination.title}</h1>
          {nomination.status !== "NOMINATION_STATUS_OPEN" && (
            <Badge variant="secondary">{nominationStatusLabel(nomination.status)}</Badge>
          )}
        </Row>
        {nomination.description && (
          <p className="text-muted-foreground">{nomination.description}</p>
        )}
      </Col>
      <NominationPoolsPublic pools={pools} bouts={bouts} />
    </div>
  );
}
