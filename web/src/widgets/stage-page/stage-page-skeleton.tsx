import { Skeleton } from "@/shared/ui/skeleton";
import { Col, Row } from "@/shared/ui/stack";

/**
 * StagePageSkeleton — первичная загрузка страницы этапа (спека 0032,
 * FR-26, AC-15): в форме каркаса — шапка, три карточки сводки, широкое
 * тело + узкий рельс, а не текст «Загрузка…». По структуре повторяет
 * `widgets/nomination-schema/schema-skeleton.tsx` (спека 0031): та же
 * идея «скелетон в форме будущего экрана», другая форма (каркас страницы
 * этапа, а не холст схемы).
 */
export function StagePageSkeleton() {
  return (
    <Col gap={6} data-testid="stage-page-skeleton">
      <Col gap={2} data-testid="stage-page-skeleton-header">
        <Skeleton className="h-3 w-48" />
        <Row align="center" justify="between" gap={2} className="flex-wrap">
          <Skeleton className="h-7 w-64" />
          <Row gap={2}>
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-40" />
          </Row>
        </Row>
      </Col>

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        data-testid="stage-page-skeleton-cards"
      >
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>

      <div
        className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]"
        data-testid="stage-page-skeleton-body"
      >
        <Skeleton className="h-96 w-full" data-testid="stage-page-skeleton-body-main" />
        <Skeleton className="h-96 w-full" data-testid="stage-page-skeleton-rail" />
      </div>
    </Col>
  );
}
