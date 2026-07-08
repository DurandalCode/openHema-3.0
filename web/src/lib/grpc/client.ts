import { createClient, type Client } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { AdminService } from "@/gen/hema/v1/admin_pb";
import { AuthService } from "@/gen/hema/v1/auth_pb";
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
