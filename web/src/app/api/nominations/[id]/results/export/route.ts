import { NextResponse, type NextRequest } from "next/server";
import { stagePublicClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { assertPreprodAccess } from "@/lib/grpc/preprod-guard";
import { nominationResultsToJson } from "@/lib/grpc/serialize";
import { emptyNominationResults, formatPlace, hasPlaces } from "@/entities/nomination-results/lib/types";
import { CSV_BOM, toCsv } from "@/shared/lib/csv";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const HEADER = ["Этап", "Место", "Боец", "Клуб", "Происхождение места"];

/**
 * GET /api/nominations/[id]/results/export — итоговый протокол номинации
 * файлом CSV (спека 0041, FR-12/FR-13/FR-15/FR-16). Тот же публичный RPC
 * `StagePublicService.GetNominationResults`, что и `.../results` (см.
 * соседний route.ts) — вызов не требует авторизации, как и раньше. FR-16 не
 * вводит новых прав доступа: экспорт "только admin" обеспечен на уровне UI
 * (кнопка есть только на админском экране схемы, `widgets/nomination-results`
 * → `canExport`), а не здесь — этот route остаётся таким же публичным по
 * форме, как исходный `GetNominationResults`.
 *
 * Секции без мест (`!hasPlaces`, этап ещё не доигран, 0021 FR-15) в файл не
 * попадают (FR-12) — даже если другие секции той же номинации уже завершены.
 * Если недоигранных секций нет ни одной, действие недоступно вовсе (FR-13):
 * 409 с понятной причиной, файл не формируется.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await assertPreprodAccess();
  if (gate) return gate;

  const { id } = await ctx.params;

  try {
    const res = await stagePublicClient.getNominationResults({ nominationId: id });
    const results = nominationResultsToJson(res.results) ?? emptyNominationResults(id);

    if (!results.sections.some((section) => hasPlaces(section))) {
      return NextResponse.json(
        { error: "протокол появится, когда закончится хотя бы один финальный этап" },
        { status: 409 },
      );
    }

    const rows = results.sections
      .filter((section) => hasPlaces(section))
      .flatMap((section) =>
        section.entries.map((entry) => [
          section.stageTitle,
          formatPlace(entry),
          entry.fighter.name,
          entry.fighter.club,
          entry.originLabel,
        ]),
      );

    const csv = toCsv(HEADER, rows);
    return new NextResponse(CSV_BOM + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="results.csv"',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
