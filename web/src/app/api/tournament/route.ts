import { NextResponse, type NextRequest } from "next/server";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { tournamentAdminClient, tournamentClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { tournamentToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import {
  ContactType as ContactTypeProto,
} from "@/gen/hema/v1/tournament_pb";
import type { ContactType, TournamentProgramDay } from "@/entities/tournament/lib/types";

export const runtime = "nodejs";

type ContactInputBody = { type: ContactType; value: string };
type UpdateBody = {
  title: string;
  description?: string;
  emblemUrl?: string;
  eventStartAt?: string | null;
  eventEndAt?: string | null;
  contacts?: ContactInputBody[];
  // Профиль турнира — новые поля (spec 0037, FR-18). UpdateActiveTournament
  // заменяет профиль целиком (FR-22) — не форвардить их здесь означало бы
  // обнулять их на сервере при каждом сохранении любого другого поля.
  chiefJudge?: string;
  regulationsUrl?: string;
  venueName?: string;
  venueAddress?: string;
  // entryFeeMinor — null означает «не задан» (FR-21, отличимо от 0).
  entryFeeMinor?: number | null;
  entryFeeCurrency?: string;
  // program — программа турнира по дням (спека 0040, FR-14). Та же
  // full-replace семантика, что contacts (FR-22): не форвардить здесь —
  // обнулить программу на сервере при следующем сохранении любого поля.
  program?: TournamentProgramDay[];
};

// UI хранит enum строкой с proto-именем ("CONTACT_TYPE_TELEGRAM"); proto-поле
// ContactInput.type — int32. BFF переводит имя → число (строка → NaN при
// binary-сериализации connect-es). Неизвестное имя → 400 (валидация на входе).
const CONTACT_TYPE_BY_NAME: Record<string, ContactTypeProto> = {
  CONTACT_TYPE_UNSPECIFIED: ContactTypeProto.UNSPECIFIED,
  CONTACT_TYPE_TELEGRAM: ContactTypeProto.TELEGRAM,
  CONTACT_TYPE_VK: ContactTypeProto.VK,
  CONTACT_TYPE_FACEBOOK: ContactTypeProto.FACEBOOK,
  CONTACT_TYPE_WEBSITE: ContactTypeProto.WEBSITE,
  CONTACT_TYPE_EMAIL: ContactTypeProto.EMAIL,
  CONTACT_TYPE_OTHER: ContactTypeProto.OTHER,
};

/** GET /api/tournament — активный турнир (публичный, без auth). */
export async function GET(): Promise<NextResponse> {
  try {
    const res = await tournamentClient.getActiveTournament({});
    return NextResponse.json({ tournament: tournamentToJson(res.tournament) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /api/tournament — обновление профиля активного турнира (только admin). */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.title || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const rawContacts = body.contacts ?? [];
  const contacts = [];
  for (const c of rawContacts) {
    const protoType = CONTACT_TYPE_BY_NAME[c.type];
    if (protoType === undefined) {
      return NextResponse.json(
        { error: `invalid contact type: ${String(c.type)}` },
        { status: 400 },
      );
    }
    contacts.push({ type: protoType, value: c.value });
  }
  const eventStartAt =
    typeof body.eventStartAt === "string" && body.eventStartAt.length > 0
      ? timestampFromDate(new Date(body.eventStartAt))
      : undefined;
  const eventEndAt =
    typeof body.eventEndAt === "string" && body.eventEndAt.length > 0
      ? timestampFromDate(new Date(body.eventEndAt))
      : undefined;
  // entryFeeMinor: proto — proto3_optional int64 (bigint в TS). undefined —
  // «не задан» (FR-21); typeof number, включая 0, форвардится как есть.
  // Number.isInteger — обязательная проверка ДО BigInt(): на нецелом числе
  // BigInt() бросает RangeError синхронно, вне try/catch ниже — без неё
  // запрос падает необработанным 500 вместо аккуратного 400.
  if (typeof body.entryFeeMinor === "number" && !Number.isInteger(body.entryFeeMinor)) {
    return NextResponse.json(
      { error: "entryFeeMinor must be an integer" },
      { status: 400 },
    );
  }
  const entryFeeMinor =
    typeof body.entryFeeMinor === "number" ? BigInt(body.entryFeeMinor) : undefined;

  try {
    const res = await tournamentAdminClient.updateActiveTournament(
      {
        title: body.title,
        description: body.description ?? "",
        emblemUrl: body.emblemUrl ?? "",
        eventStartAt,
        eventEndAt,
        contacts,
        chiefJudge: body.chiefJudge ?? "",
        regulationsUrl: body.regulationsUrl ?? "",
        venueName: body.venueName ?? "",
        venueAddress: body.venueAddress ?? "",
        entryFeeMinor,
        entryFeeCurrency: body.entryFeeCurrency ?? "",
        program: body.program ?? [],
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ tournament: tournamentToJson(res.tournament) });
  } catch (err) {
    return errorResponse(err);
  }
}