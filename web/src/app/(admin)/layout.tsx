import { redirect } from "next/navigation";
import { getCurrentUser } from "@/entities/user/model/get-current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Layout admin-зоны: server-side guard. Если пользователь не аутентифицирован
 * или не админ — редирект на главную. Edge middleware не может читать JWT из
 * httpOnly-cookie и ходить в gRPC, поэтому реальная проверка здесь
 * (см. ADR 0007).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ROLE_ADMIN") {
    redirect("/");
  }
  return <>{children}</>;
}
