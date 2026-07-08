import { NextResponse, type NextRequest } from "next/server";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { tournamentAdminClient, tournamentClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { tournamentToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import {
  ContactType as ContactTypeProto,
} from "@/gen/hema/v1/tournament_pb";
import type { ContactType } from "@/entities/tournament/lib/types";

export const runtime = "nodejs";

type ContactInputBody = { type: ContactType; value: string };
type UpdateBody = {
  title: string;
  description?: string;
  emblemUrl?: string;
  eventStartAt?: string | null;
  eventEndAt?: string | null;
  contacts?: ContactInputBody[];
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

  try {
    const res = await tournamentAdminClient.updateActiveTournament(
      {
        title: body.title,
        description: body.description ?? "",
        emblemUrl: body.emblemUrl ?? "",
        eventStartAt,
        eventEndAt,
        contacts,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ tournament: tournamentToJson(res.tournament) });
  } catch (err) {
    return errorResponse(err);
  }
}