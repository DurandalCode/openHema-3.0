import { NextResponse, type NextRequest } from "next/server";
import { tournamentAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { tournamentToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { TournamentFileKind } from "@/gen/hema/v1/tournament_pb";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ kind: string }> };

type FileKindParam = "regulations" | "emblem";

const KIND_BY_PARAM: Record<FileKindParam, TournamentFileKind> = {
  regulations: TournamentFileKind.REGULATIONS,
  emblem: TournamentFileKind.EMBLEM,
};

/**
 * FILE_POLICIES — быстрый локальный отказ на BFF, ДО похода на сервер
 * (спека 0042, T36, FR-32): сервер остаётся источником истины (проверяет
 * бинарную сигнатуру, NFR-9), но не заставлять пользователя ждать round-trip
 * ради заведомо неверного файла — дешёвая проверка здесь же. Дефолты те
 * же, что перечислены в спеке (FR-32): регламент — PDF до 10 МБ, эмблема —
 * PNG/JPEG/WebP до 5 МБ (SVG исключён явно, FR-33).
 */
const FILE_POLICIES: Record<FileKindParam, { maxBytes: number; allowedTypes: string[] }> = {
  regulations: { maxBytes: 10 * 1024 * 1024, allowedTypes: ["application/pdf"] },
  emblem: {
    maxBytes: 5 * 1024 * 1024,
    allowedTypes: ["image/png", "image/jpeg", "image/webp"],
  },
};

function parseKindParam(raw: string): FileKindParam | null {
  return raw === "regulations" || raw === "emblem" ? raw : null;
}

/**
 * POST /api/tournament/files/[kind] — загрузка файла регламента/эмблемы
 * турнира (только admin, FR-30/FR-31). Тело — `multipart/form-data`, поле
 * `file`. Неизвестный `kind` в URL и нарушение типа/размера отклоняются
 * здесь же, без обращения к `tournamentAdminClient`.
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { kind: rawKind } = await ctx.params;
  const kindParam = parseKindParam(rawKind);
  if (!kindParam) {
    return NextResponse.json({ error: `unknown file kind: ${rawKind}` }, { status: 400 });
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

  const policy = FILE_POLICIES[kindParam];
  if (!policy.allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: `unsupported file type: ${file.type || "unknown"}` },
      { status: 400 },
    );
  }
  if (file.size > policy.maxBytes) {
    return NextResponse.json(
      { error: `file too large: max ${policy.maxBytes} bytes` },
      { status: 400 },
    );
  }

  const content = new Uint8Array(await file.arrayBuffer());

  try {
    const res = await tournamentAdminClient.uploadTournamentFile(
      {
        kind: KIND_BY_PARAM[kindParam],
        content,
        fileName: file.name,
        contentType: file.type,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ tournament: tournamentToJson(res.tournament) });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * DELETE /api/tournament/files/[kind] — удаление загруженного файла
 * (только admin, FR-36): освобождает прежний объект в хранилище, ссылка
 * (`regulationsUrl`/`emblemUrl`), если она была задана раньше файла,
 * профилем не восстанавливается — источник данных ровно один (FR-34), а
 * повторно её должен ввести admin.
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { kind: rawKind } = await ctx.params;
  const kindParam = parseKindParam(rawKind);
  if (!kindParam) {
    return NextResponse.json({ error: `unknown file kind: ${rawKind}` }, { status: 400 });
  }

  try {
    const res = await tournamentAdminClient.deleteTournamentFile(
      { kind: KIND_BY_PARAM[kindParam] },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ tournament: tournamentToJson(res.tournament) });
  } catch (err) {
    return errorResponse(err);
  }
}
