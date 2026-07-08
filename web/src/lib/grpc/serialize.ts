import { toJson } from "@bufbuild/protobuf";
import { UserSchema, type User } from "@/gen/hema/v1/common_pb";
import { TournamentSchema, type Tournament } from "@/gen/hema/v1/tournament_pb";
import type { Tournament as TournamentDto } from "@/entities/tournament/lib/types";

/**
 * userToJson превращает protobuf-сообщение User в обычный JSON-объект,
 * пригодный для NextResponse.json (Timestamp → ISO-строка, без BigInt).
 */
export function userToJson(user: User | undefined) {
  if (!user) return null;
  return toJson(UserSchema, user);
}

/**
 * tournamentToJson превращает protobuf-сообщение Tournament в обычный
 * JSON-объект, пригодный для NextResponse.json.
 *
 * Нормализует proto3-дефолты: `toJson` опускает пустые строки и пустой
 * `repeated`, но consumer (TournamentHero, форма) ждёт поля по контракту
 * `Tournament` (title/description/emblemUrl — строки, contacts — массив).
 * Без нормализации пустой seed-турнир отдаёт JSON без `contacts`, и
 * `TournamentHero` падает на `undefined.filter(...)`.
 */
export function tournamentToJson(tournament: Tournament | undefined): TournamentDto | null {
  if (!tournament) return null;
  const raw = toJson(TournamentSchema, tournament) as Partial<TournamentDto>;
  return {
    id: raw.id ?? "",
    title: raw.title ?? "",
    description: raw.description ?? "",
    eventStartAt: raw.eventStartAt ?? "",
    eventEndAt: raw.eventEndAt ?? "",
    emblemUrl: raw.emblemUrl ?? "",
    isActive: raw.isActive ?? false,
    contacts: Array.isArray(raw.contacts)
      ? raw.contacts.map((c) => ({ ...c, value: c.value ?? "", position: c.position ?? 0 }))
      : [],
    createdAt: raw.createdAt ?? "",
    updatedAt: raw.updatedAt ?? "",
  };
}
