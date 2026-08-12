import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { StatusPage } from "@/shared/ui/status-page";

/**
 * «Не найдено» для публичной страницы номинации (спека 0023, FR-2/AC-2).
 * Ловит `notFound()` из `nominations/[id]/page.tsx`. Публичный экран без
 * админ-раздела — переход дальше ведёт на главную (списка публичных
 * номинаций отдельной страницей в приложении нет).
 */
export default function NominationNotFound() {
  return (
    <StatusPage
      code="404"
      title="Номинация не найдена"
      description="Такой номинации нет — её могли удалить, а ссылка устарела или скопирована неверно."
      actions={
        <Button asChild>
          <Link href="/">На главную</Link>
        </Button>
      }
    />
  );
}
