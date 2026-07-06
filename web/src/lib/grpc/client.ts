import { createClient, type Client } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { AdminService } from "@/gen/hema/v1/admin_pb";
import { AuthService } from "@/gen/hema/v1/auth_pb";

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
