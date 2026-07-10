import { Row } from "@/shared/ui/stack";

/**
 * AdminHeader — единый заголовок раздела админки: заголовок/описание и
 * правые actions. Переходы между разделами — через AdminNav (layout.tsx).
 */
export function AdminHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Row align="start" justify="between" gap={4}>
      <div>
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
