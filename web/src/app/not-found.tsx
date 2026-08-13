import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { StatusPage } from "@/shared/ui/status-page";

/**
 * Общая страница «не найдено» (спека 0023, FR-2/AC-2). Рендерится, когда
 * `notFound()` вызван вне сегментов со своим, более конкретным
 * `not-found.tsx` — Next.js берёт ближайший вверх по дереву файл.
 */
export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="Страница не найдена"
      description="Такой страницы нет — возможно, ссылка устарела или содержит опечатку."
      actions={
        <Button asChild>
          <Link href="/">На главную</Link>
        </Button>
      }
    />
  );
}
