import { Skeleton } from "@/shared/ui/skeleton";
import { Col, Row } from "@/shared/ui/stack";

/**
 * SchemaSkeleton — первичная загрузка схемы (спека 0031, FR-28, AC-19): в
 * форме будущего холста — палитра слева (три плашки-заглушки, `schema-palette.tsx`)
 * и два ряда уровней с карточками-заглушками (`schema-canvas.tsx`), не текст
 * «Загрузка…».
 */
export function SchemaSkeleton() {
  return (
    <div
      data-testid="schema-skeleton"
      className="grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]"
    >
      <Col gap={2} data-testid="schema-skeleton-palette">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Col>

      <Col gap={4}>
        {[0, 1].map((level) => (
          <Col key={level} gap={2} data-testid="schema-skeleton-level">
            <Skeleton className="h-3 w-20" />
            <Row gap={3} wrap>
              <Skeleton className="h-32 w-60" />
              <Skeleton className="h-32 w-60" />
            </Row>
          </Col>
        ))}
      </Col>
    </div>
  );
}
