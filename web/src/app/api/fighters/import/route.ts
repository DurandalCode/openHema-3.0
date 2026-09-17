import { NextResponse, type NextRequest } from "next/server";
import { fighterAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { getAccessToken } from "@/lib/session/cookies";
import { toImportReportDto } from "../to-import-report-dto";

export const runtime = "nodejs";

/**
 * MAX_IMPORT_BYTES — быстрый локальный отказ на BFF, ДО похода на сервер
 * (спека 0049, NFR-1), по образцу `app/api/tournament/files/[kind]`. Сервер
 * остаётся источником истины (у него свой предел и лимит строк) — здесь
 * только чтобы не гонять заведомо неподъёмный файл через gRPC.
 */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/**
 * ALLOWED_EXTENSIONS / ALLOWED_TYPES — гейт формата (NFR-2: CSV и XLSX).
 * Проверяются ОБА признака по «или»: Excel и браузеры врут про MIME
 * (сохранённый Excel'ем CSV приезжает как `application/vnd.ms-excel`, а из
 * некоторых окружений — с пустым типом), но и имя файла не всегда несёт
 * расширение (drag-n-drop из почтового клиента). Разбирает файл всё равно
 * сервер — по `file_name`.
 */
const ALLOWED_EXTENSIONS = [".csv", ".xlsx"];
const ALLOWED_TYPES = [
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function isAllowedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  return ALLOWED_TYPES.includes(file.type);
}

/**
 * POST /api/fighters/import — импорт бойцов из файла (admin, спека 0049).
 * Тело — `multipart/form-data`: `file` (CSV/XLSX), `dryRun` (`"true"`/
 * `"false"`), повторяемое `nominationIds` (номинации-умолчания, FR-5a).
 *
 * `dryRun` по умолчанию `true`: пропущенное поле не должно случайно писать
 * в ростер — предпросмотр (FR-2) безопаснее записи.
 *
 * Турнир не передаётся: экран ростера работает только с активным турниром,
 * и его же резолвит сервер при пустом `tournament_id`.
 *
 * Ошибки уровня строки (пустое имя, неизвестная номинация) — не ошибка
 * запроса, а исход строки в отчёте (FR-9); 400 здесь только про файл
 * целиком.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!isAllowedFile(file)) {
    return NextResponse.json(
      { error: `unsupported file type: ${file.type || file.name || "unknown"}` },
      { status: 400 },
    );
  }

  if (file.size > MAX_IMPORT_BYTES) {
    return NextResponse.json(
      { error: `file too large: max ${MAX_IMPORT_BYTES} bytes` },
      { status: 400 },
    );
  }

  const dryRun = formData.get("dryRun") !== "false";
  const defaultNominationIds = formData
    .getAll("nominationIds")
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const content = new Uint8Array(await file.arrayBuffer());

  try {
    const res = await fighterAdminClient.importFighters(
      { content, fileName: file.name, defaultNominationIds, dryRun },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ report: toImportReportDto(res) });
  } catch (err) {
    return errorResponse(err);
  }
}
