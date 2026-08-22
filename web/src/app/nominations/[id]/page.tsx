import { notFound } from "next/navigation";
import { getNomination } from "@/entities/nomination/model/get-nomination";
import { getNominationLive } from "@/entities/nomination-live/model/get-nomination-live";
import { NominationPublicScreen } from "@/widgets/nomination-public/nomination-public-screen";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

/**
 * /nominations/[id] — публичный экран номинации (редизайн спекой 0035:
 * схема номинации цепочкой этапов вместо админской карточной сетки, счёт
 * `—:—` у неначатого боя, живое положение номинации в шапке). Read-only,
 * без авторизации. Страница — тонкая серверная обёртка (правило 0032,
 * NFR-2): вся композиция и живая подписка — в `NominationPublicScreen`.
 *
 * SSR: `getNomination`/`getNominationLive` — публичные gRPC, без
 * access-токена (как публичный ростер 0007). `getNominationLive` (спека
 * 0014) сеет живой снапшот — «живость» после гидратации ведёт клиентский
 * `useNominationLive` внутри `NominationPublicScreen` (SSE + polling-fallback).
 */
export default async function PublicNominationPage({ params }: PageProps) {
  const { id } = await params;
  const nomination = await getNomination(id);
  if (!nomination) {
    notFound();
  }

  const snapshot = await getNominationLive(id);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16">
      <NominationPublicScreen nominationId={id} nomination={nomination} initialSnapshot={snapshot} />
    </div>
  );
}
