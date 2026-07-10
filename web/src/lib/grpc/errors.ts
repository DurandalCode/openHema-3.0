import { Code, ConnectError } from "@connectrpc/connect";
import { NextResponse } from "next/server";

// Маппинг connect.Code → HTTP-статус для ответа браузеру.
const codeToStatus: Partial<Record<Code, number>> = {
  [Code.InvalidArgument]: 400,
  [Code.Unauthenticated]: 401,
  [Code.PermissionDenied]: 403,
  [Code.NotFound]: 404,
  [Code.AlreadyExists]: 409,
  // FailedPrecondition (недопустимый переход state machine заявки) и
  // Aborted (конфликт версии потока, ADR 0011) — оба «текущее состояние не
  // позволяет» на стороне клиента, конвенционально 409.
  [Code.FailedPrecondition]: 409,
  [Code.Aborted]: 409,
  [Code.Internal]: 500,
  [Code.Unavailable]: 503,
};

/** errorResponse превращает ошибку gRPC в JSON-ответ BFF. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ConnectError) {
    const status = codeToStatus[err.code] ?? 500;
    return NextResponse.json({ error: err.rawMessage }, { status });
  }
  return NextResponse.json({ error: "internal error" }, { status: 500 });
}
