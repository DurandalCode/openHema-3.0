import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Заголовки, которые действительно определяют безопасную и корректную
// отдачу файла (спека 0042, ADR 0019 п.6): `Content-Type` — по бинарной
// сигнатуре, определённой сервером при загрузке (NFR-9), не по расширению;
// `X-Content-Type-Options: nosniff` — запрещает браузеру переопределить
// тип; `Content-Disposition` — как отдал сервер (`inline`).
const PROXIED_HEADERS = ["content-type", "x-content-type-options", "content-disposition"];

/**
 * GET /api/files/[id] — публичный проксирующий эндпоинт (без cookie,
 * регламент/эмблема видны и гостю, FR-35): браузер ходит в BFF, а не
 * напрямую в Go-сервер (ADR 0001), который отдаёт файл обычным HTTP GET на
 * своём `http.ServeMux` (`GET /files/{id}`, не через Connect — показ
 * эмблемы не должен быть недешёвым RPC). Тело стримится напрямую
 * (`upstream.body`), без буферизации в память — файлы регламента могут
 * быть до 10 МБ.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { id } = await ctx.params;
  const baseUrl = process.env.SERVER_GRPC_URL ?? "http://localhost:8080";

  const upstream = await fetch(`${baseUrl}/files/${id}`);

  const headers = new Headers();
  for (const name of PROXIED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
