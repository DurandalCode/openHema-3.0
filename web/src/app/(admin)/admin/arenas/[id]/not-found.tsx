import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { StatusPage } from "@/shared/ui/status-page";

/**
 * «Не найдено» для конкретной площадки (спека 0023, FR-2/AC-2). Ловит
 * `notFound()` из `admin/arenas/[id]/page.tsx` и `.../scoreboard/page.tsx`
 * (у неё своего `not-found.tsx` нет — Next берёт ближайший вверх по дереву,
 * то есть этот файл).
 */
export default function ArenaNotFound() {
  return (
    <StatusPage
      code="404"
      title="Площадка не найдена"
      description="Такой площадки нет — её могли удалить или переименовать, а ссылка устарела."
      actions={
        <Button asChild>
          <Link href="/admin/arenas">Все площадки</Link>
        </Button>
      }
    />
  );
}
