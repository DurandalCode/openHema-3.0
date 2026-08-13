import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { Button } from "@/shared/ui/button";
import { StatusPage } from "@/shared/ui/status-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Layout admin-зоны: server-side guard. Edge middleware не может читать JWT
 * из httpOnly-cookie и ходить в gRPC, поэтому реальная проверка здесь (см.
 * ADR 0007).
 *
 * Спека 0023 (FR-3/AC-3/AC-4) разделяет два случая, которые раньше были
 * неразличимым `redirect("/")`:
 * - **гость** (нет пользователя) — по-прежнему отправляется на вход, ему
 *   нечего объяснять, ему нужно войти (поведение не меняется);
 * - **аутентифицированный не-админ** (роль отличается от `ROLE_ADMIN`,
 *   ADR 0007) — видит оформленную 403 с объяснением вместо молчаливого
 *   редиректа на главную.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "ROLE_ADMIN") {
    return (
      <StatusPage
        code="403"
        title="Нужны права организатора"
        description="Раздел администрирования доступен только пользователям с ролью организатора (ROLE_ADMIN). Если вам нужен доступ, обратитесь к администратору турнира — он может выдать роль организатора."
        actions={
          <Button asChild>
            <Link href="/dashboard">В кабинет</Link>
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}
