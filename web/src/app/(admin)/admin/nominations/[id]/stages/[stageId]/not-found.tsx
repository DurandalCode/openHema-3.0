import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { StatusPage } from "@/shared/ui/status-page";

/**
 * «Не найдено» для конкретного этапа (спека 0023, FR-2/AC-2). Ловит
 * `notFound()` из `admin/nominations/[id]/stages/[stageId]/page.tsx` (и там,
 * и здесь, id родительской номинации/этапа отдельно не передаётся — Next.js
 * не прокидывает `params` в `not-found.tsx`, поэтому переход ведёт на общий
 * список номинаций, ближайший достижимый «список того же рода»).
 */
export default function StageNotFound() {
  return (
    <StatusPage
      code="404"
      title="Этап не найден"
      description="Такого этапа нет — его могли удалить, а ссылка устарела."
      actions={
        <Button asChild>
          <Link href="/admin/nominations">Все номинации</Link>
        </Button>
      }
    />
  );
}
