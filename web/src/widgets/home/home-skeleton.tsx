import { Skeleton } from "@/shared/ui/skeleton";
import { SkeletonCards, SkeletonRows } from "@/shared/ui/skeletons";
import { Col } from "@/shared/ui/stack";

/**
 * HomeSkeleton — состояние загрузки главной (спека 0034, NFR-5): скелетон в
 * форме будущего контента, не спиннер и не текст «Загрузка…» (правила
 * 0022/0023). Поскольку по NFR-1 первый снапшот всегда приходит с сервера в
 * SSR-пропе, этот компонент на самом деле почти никогда не виден живому
 * пользователю — его реальная точка подключения (`loading.tsx` рядом с
 * `app/page.tsx`, если Next решит показать fallback между навигациями) не в
 * этом инкременте (T23), но сам компонент готов и протестирован уже здесь.
 *
 * Форма — компромисс между двумя состояниями страницы («до старта» и
 * «идёт»): полоса-афиша сверху + сетка карточек (годится и для карточек
 * номинаций «до старта», и для карточек площадок «идёт») + строки ленты.
 */
export function HomeSkeleton() {
  return (
    <Col gap={8} className="mx-auto w-full max-w-6xl px-4 py-8" data-slot="home-skeleton">
      <Col gap={3} align="center">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </Col>
      <SkeletonCards count={3} />
      <SkeletonRows rows={5} cols={5} />
    </Col>
  );
}
