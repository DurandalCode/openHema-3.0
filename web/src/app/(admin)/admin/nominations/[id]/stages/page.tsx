import { notFound } from "next/navigation";
import { Col } from "@/shared/ui/stack";
import { getNomination } from "@/entities/nomination/model/get-nomination";
import { getNominationResults } from "@/entities/nomination-results/model/get-nomination-results";
import { NominationResults } from "@/widgets/nomination-results/nomination-results";
import { NominationSchemaScreen } from "@/widgets/nomination-schema/nomination-schema-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

/**
 * /admin/nominations/[id]/stages — конструктор схемы номинации (спека 0031):
 * палитра + холст + инспектор, заменяет прежний список этапов с кнопками
 * (`StageManagement`/`AdminHeader`, спека 0018). Серверная обёртка получает
 * номинацию как `initialData` для `NominationSchemaScreen` (SSR без мигания
 * скелетоном шапки на маунте) — вся остальная композиция и state живут в
 * `widgets/nomination-schema/nomination-schema-screen.tsx`.
 *
 * Итоговый протокол (спека 0021, FR-19) — `NominationResults` с
 * `showUnfinished`: организатор видит и доигранные секции с местами, и
 * недоигранные с пометкой «этап не доигран» (сценарий 7 — почему номинация
 * ещё не завершена). Данные — server-side через `getNominationResults`
 * (BFF-эквивалент `GetNominationResults`, T11/T12); живой канал (0014) здесь
 * не нужен — организатор сам обновляет страницу. Вне скоупа 0031 (см.
 * spec.md «Вне скоупа») — сохраняется без изменений под конструктором.
 *
 * `canExport` (спека 0041, FR-11..FR-16) — единственное место, где включена
 * кнопка «Экспорт» протокола в CSV: экспорт доступен только admin, хотя
 * сам RPC публичный (см. `widgets/nomination-results/nomination-results.tsx`
 * — «Важный нюанс»). Публичная страница номинации проп не передаёт.
 */
export default async function AdminNominationStagesPage({ params }: PageProps) {
  const { id } = await params;
  const nomination = await getNomination(id);
  if (!nomination) {
    notFound();
  }

  const results = await getNominationResults(id);

  return (
    <Col gap={0}>
      <NominationSchemaScreen nomination={nomination} />
      <div className="w-full px-4 py-8">
        <NominationResults results={results} showUnfinished canExport />
      </div>
    </Col>
  );
}
