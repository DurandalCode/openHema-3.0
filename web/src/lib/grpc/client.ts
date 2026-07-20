import { createClient, type Client } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { AdminService } from "@/gen/hema/v1/admin_pb";
import {
  ApplicationAdminService,
  ApplicationPublicService,
  ApplicationService,
} from "@/gen/hema/v1/application_pb";
import { ArenaAdminService } from "@/gen/hema/v1/arena_pb";
import { AuthService } from "@/gen/hema/v1/auth_pb";
import { BoutAdminService, BoutPublicService } from "@/gen/hema/v1/bout_pb";
import { FighterAdminService, FighterPublicService } from "@/gen/hema/v1/fighter_pb";
import { NominationAdminService, NominationService } from "@/gen/hema/v1/nomination_pb";
import { PoolAdminService, PoolPublicService } from "@/gen/hema/v1/pool_pb";
import { TournamentAdminService, TournamentService } from "@/gen/hema/v1/tournament_pb";

// Адрес Go-сервера (gRPC/Connect). Задаётся через окружение.
const baseUrl = process.env.SERVER_GRPC_URL ?? "http://localhost:8080";

// gRPC-транспорт поверх HTTP/2 (h2c) для связи BFF → Go.
const transport = createGrpcTransport({
  baseUrl,
});

/**
 * authClient — типобезопасный клиент AuthService.
 * Используется только на сервере (Route Handlers / Node runtime).
 */
export const authClient: Client<typeof AuthService> = createClient(
  AuthService,
  transport,
);

/**
 * adminClient — типобезопасный клиент AdminService.
 * Используется только на сервере (Route Handlers / Node runtime).
 * Все RPC требуют роль ADMIN (проверяется Go-сервером); BFF прокидывает
 * access-токен админа из httpOnly-cookie в заголовке Authorization.
 */
export const adminClient: Client<typeof AdminService> = createClient(
  AdminService,
  transport,
);

/**
 * tournamentClient — публичный клиент TournamentService (чтение активного
 * турнира). RPC GetActiveTournament не требует access-токена.
 * Только на сервере (Node runtime).
 */
export const tournamentClient: Client<typeof TournamentService> = createClient(
  TournamentService,
  transport,
);

/**
 * tournamentAdminClient — клиент TournamentAdminService (управление профилем
 * турнира). Все RPC требуют роль ADMIN; BFF прокидывает access-токен админа
 * из httpOnly-cookie. Только на сервере (Node runtime).
 */
export const tournamentAdminClient: Client<typeof TournamentAdminService> =
  createClient(TournamentAdminService, transport);

/**
 * nominationClient — публичный клиент NominationService (чтение номинаций
 * турнира). ListNominations/GetNomination не требуют access-токена.
 * Только на сервере (Node runtime).
 */
export const nominationClient: Client<typeof NominationService> = createClient(
  NominationService,
  transport,
);

/**
 * nominationAdminClient — клиент NominationAdminService (управление
 * номинациями турнира). Все RPC требуют роль ADMIN; BFF прокидывает
 * access-токен админа из httpOnly-cookie. Только на сервере (Node runtime).
 */
export const nominationAdminClient: Client<typeof NominationAdminService> =
  createClient(NominationAdminService, transport);

/**
 * applicationClient — клиент ApplicationService (операции заявителя над
 * своей заявкой). Все RPC требуют access-токен; BFF прокидывает его из
 * httpOnly-cookie. Только на сервере (Node runtime).
 */
export const applicationClient: Client<typeof ApplicationService> = createClient(
  ApplicationService,
  transport,
);

/**
 * applicationAdminClient — клиент ApplicationAdminService (секретарь/admin:
 * подтверждение оплаты, регистрация, сводный экран заявок). Все RPC требуют
 * роль ADMIN. Только на сервере (Node runtime).
 */
export const applicationAdminClient: Client<typeof ApplicationAdminService> =
  createClient(ApplicationAdminService, transport);

/**
 * applicationPublicClient — публичный клиент ApplicationPublicService
 * (стартовый лист номинации: имена + счётчики). Не требует access-токена.
 * Только на сервере (Node runtime).
 */
export const applicationPublicClient: Client<typeof ApplicationPublicService> =
  createClient(ApplicationPublicService, transport);

/**
 * fighterAdminClient — клиент FighterAdminService (ростер бойцов турнира:
 * ручное заведение, вывод/возврат, участие в номинациях, правка). Все RPC
 * требуют роль ADMIN. Только на сервере (Node runtime).
 */
export const fighterAdminClient: Client<typeof FighterAdminService> = createClient(
  FighterAdminService,
  transport,
);

/**
 * fighterPublicClient — публичный клиент FighterPublicService (состав
 * номинации: имя/клуб/статус). Не требует access-токена. Только на сервере
 * (Node runtime).
 */
export const fighterPublicClient: Client<typeof FighterPublicService> = createClient(
  FighterPublicService,
  transport,
);

/**
 * arenaAdminClient — клиент ArenaAdminService (управление площадками турнира:
 * создать/править/архивировать/вернуть/переупорядочить). Все RPC требуют роль
 * ADMIN. Только на сервере (Node runtime).
 */
export const arenaAdminClient: Client<typeof ArenaAdminService> = createClient(
  ArenaAdminService,
  transport,
);

/**
 * poolAdminClient — клиент PoolAdminService (управление раскладкой бойцов
 * номинации по пулам: создать/удалить пул, DnD, автораспределение, undo,
 * смена статуса draft/ready). Все RPC требуют роль ADMIN; публичного чтения
 * нет (спека 0009, FR-13). Только на сервере (Node runtime).
 */
export const poolAdminClient: Client<typeof PoolAdminService> = createClient(
  PoolAdminService,
  transport,
);

/**
 * poolPublicClient — публичный клиент PoolPublicService (чтение пулов
 * номинации: состав, статус, площадка, спека 0011, FR-11). Не требует
 * access-токена; показывает пулы только при готовой (ready) раскладке.
 * Только на сервере (Node runtime).
 */
export const poolPublicClient: Client<typeof PoolPublicService> = createClient(
  PoolPublicService,
  transport,
);

/**
 * boutAdminClient — клиент BoutAdminService (чтение боёв, сформированных
 * внутри пулов номинации при фиксации раскладки, спека 0010). Все RPC
 * требуют роль ADMIN; публичного чтения нет (спека 0010, FR-8). Только на
 * сервере (Node runtime).
 */
export const boutAdminClient: Client<typeof BoutAdminService> = createClient(
  BoutAdminService,
  transport,
);

/**
 * boutPublicClient — публичный клиент BoutPublicService (чтение боёв
 * номинации: пары бойцов + порядок проведения, спека 0011, FR-11). Не
 * требует access-токена. Только на сервере (Node runtime).
 */
export const boutPublicClient: Client<typeof BoutPublicService> = createClient(
  BoutPublicService,
  transport,
);
