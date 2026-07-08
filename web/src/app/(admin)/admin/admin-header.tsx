import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Row } from "@/shared/ui/stack";

/**
 * AdminHeader — единый заголовок раздела админки: заголовок/описание,
 * опциональная кнопка «назад» (для вложенных страниц) и правые actions.
 */
export function AdminHeader({
  title,
  description,
  backHref,
  actions,
}: {
  title: string;
  description?: string;
  backHref?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Row align="start" justify="between" gap={4}>
      <div>
        {backHref && (
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Назад
          </Link>
        )}
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <Row align="center" gap={2}>
          {actions}
        </Row>
      )}
    </Row>
  );
}
