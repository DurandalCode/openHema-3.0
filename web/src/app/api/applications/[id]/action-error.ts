import { Code, ConnectError } from "@connectrpc/connect";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/grpc/errors";

/**
 * applicationActionErrorResponse — отказ действия заявителя над уже
 * существующей заявкой (отметить оплату / отозвать) в человеческом виде
 * (спека 0036, FR-6). `errorResponse` отдаёт для этих ручек волатильный
 * текст Go-домена на `FailedPrecondition`/`Aborted` (например
 * "application: invalid transition") — ровно так же, как для
 * `POST /api/applications` до правки `submitErrorResponse`; здесь тот же
 * приём, с текстом, специфичным для действия.
 */
export function applicationActionErrorResponse(
  err: unknown,
  action: "declare-payment" | "withdraw",
): NextResponse {
  if (err instanceof ConnectError) {
    if (err.code === Code.FailedPrecondition) {
      const message =
        action === "withdraw"
          ? "Заявку нельзя отозвать в текущем состоянии"
          : "Оплату можно отметить только для поданной заявки";
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (err.code === Code.Aborted) {
      return NextResponse.json(
        { error: "Заявка уже изменилась — обновите страницу и попробуйте снова" },
        { status: 409 },
      );
    }
  }
  return errorResponse(err);
}
