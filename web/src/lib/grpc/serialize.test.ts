import { describe, it, expect } from "vitest";
import { fromJson } from "@bufbuild/protobuf";
import { UserSchema } from "@/gen/hema/v1/common_pb";
import { TournamentSchema } from "@/gen/hema/v1/tournament_pb";
import { tournamentToJson, userToJson } from "@/lib/grpc/serialize";

type UserJson = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
};

type TournamentJson = {
  id: string;
  title: string;
  description: string;
  eventStartAt?: string;
  eventEndAt?: string;
  emblemUrl: string;
  isActive: boolean;
  contacts: { id: string; type: string; value: string; position: number }[];
  createdAt: string;
  updatedAt: string;
};

describe("userToJson", () => {
  it("converts a protobuf User to plain JSON", () => {
    const user = fromJson(UserSchema, {
      id: "user-123",
      email: "knight@hema.test",
      displayName: "Sir Test",
      role: "ROLE_ADMIN",
      createdAt: "2026-01-01T00:00:00Z",
    });

    const json = userToJson(user) as UserJson;

    expect(json).not.toBeNull();
    expect(json.id).toBe("user-123");
    expect(json.email).toBe("knight@hema.test");
    expect(json.displayName).toBe("Sir Test");
    expect(json.role).toBe("ROLE_ADMIN");
    expect(json.createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("returns null for undefined", () => {
    expect(userToJson(undefined)).toBeNull();
  });
});

describe("tournamentToJson", () => {
  it("converts a protobuf Tournament with contacts to plain JSON (single-day)", () => {
    const t = fromJson(TournamentSchema, {
      id: "t1",
      title: "HEMA Cup",
      description: "Annual",
      eventStartAt: "2026-12-01T10:00:00Z",
      emblemUrl: "https://cdn/x.png",
      isActive: true,
      contacts: [
        { id: "c1", type: "CONTACT_TYPE_TELEGRAM", value: "@org", position: 0 },
      ],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-07-07T00:00:00Z",
    });

    const json = tournamentToJson(t) as TournamentJson;

    expect(json).not.toBeNull();
    expect(json.id).toBe("t1");
    expect(json.title).toBe("HEMA Cup");
    expect(json.eventStartAt).toBe("2026-12-01T10:00:00Z");
    expect(json.eventEndAt).toBe("");
    expect(json.emblemUrl).toBe("https://cdn/x.png");
    expect(json.isActive).toBe(true);
    expect(json.contacts).toEqual([
      { id: "c1", type: "CONTACT_TYPE_TELEGRAM", value: "@org", position: 0 },
    ]);
  });

  it("converts a multi-day tournament (start + end)", () => {
    const t = fromJson(TournamentSchema, {
      id: "t2",
      title: "HEMA festival",
      eventStartAt: "2026-12-01T10:00:00Z",
      eventEndAt: "2026-12-03T18:00:00Z",
    });
    const json = tournamentToJson(t) as TournamentJson;
    expect(json.eventStartAt).toBe("2026-12-01T10:00:00Z");
    expect(json.eventEndAt).toBe("2026-12-03T18:00:00Z");
  });

  it("returns null for undefined", () => {
    expect(tournamentToJson(undefined)).toBeNull();
  });

  // Регрессия: proto3-дефолты (пустые строки, пустой repeated) опускаются
  // toJson, и BFF отдаёт JSON без title/description/emblemUrl/contacts.
  // Consumer (TournamentHero) зовёт `.contacts.filter(...)` → undefined →
  // краш страницы. tournamentToJson обязан нормализовать дефолты.
  it("normalizes proto3 defaults for empty/seed tournament", () => {
    // Сид активного турнира: только id, isActive, timestamps; всё остальное —
    // proto3-дефолты, которые toJson опускает.
    const t = fromJson(TournamentSchema, {
      id: "00000000-0000-0000-0000-000000000001",
      isActive: true,
      createdAt: "2026-07-07T00:00:00Z",
      updatedAt: "2026-07-07T00:00:00Z",
    });

    const json = tournamentToJson(t) as TournamentJson;

    expect(json).not.toBeNull();
    expect(json.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(json.title).toBe("");
    expect(json.description).toBe("");
    expect(json.emblemUrl).toBe("");
    expect(json.isActive).toBe(true);
    expect(Array.isArray(json.contacts)).toBe(true);
    expect(json.contacts).toEqual([]);
    expect(json.createdAt).toBe("2026-07-07T00:00:00Z");
    expect(json.updatedAt).toBe("2026-07-07T00:00:00Z");
  });

  it("normalizes missing contacts array even when other fields set", () => {
    const t = fromJson(TournamentSchema, {
      id: "t2",
      title: "Cup",
    });

    const json = tournamentToJson(t) as TournamentJson;

    expect(json.contacts).toEqual([]);
    expect(json.title).toBe("Cup");
    expect(json.description).toBe("");
    expect(json.emblemUrl).toBe("");
  });
});
