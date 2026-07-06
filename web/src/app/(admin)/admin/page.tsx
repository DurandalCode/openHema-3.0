import Link from "next/link";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { Button } from "@/shared/ui/button";
import { AdminList } from "@/features/admin/ui/admin-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /admin — дашборд администратора: списки админов и пользователей. */
export default async function AdminPage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Админка</h1>
          <p className="mt-2 text-muted-foreground">
            Управление пользователями и администраторами.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/create">+ Создать админа</Link>
        </Button>
      </div>

      <div className="mt-8">
        <AdminList currentUserId={user?.id ?? ""} />
      </div>
    </div>
  );
}
