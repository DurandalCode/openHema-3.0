import Link from "next/link";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { Button } from "@/shared/ui/button";
import { AdminList } from "@/features/admin/ui/admin-list";
import { AdminHeader } from "./admin-header";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /admin — дашборд администратора: списки админов и пользователей. */
export default async function AdminPage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-16">
      <AdminHeader
        title="Админка"
        description="Управление пользователями и администраторами."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/tournament">Турнир</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/nominations">Номинации</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/create">+ Создать админа</Link>
            </Button>
          </>
        }
      />

      <div className="mt-8">
        <AdminList currentUserId={user?.id ?? ""} />
      </div>
    </div>
  );
}
