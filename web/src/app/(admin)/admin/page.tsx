import { getCurrentUser } from "@/entities/user/model/get-current-user";
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
      />

      <div className="mt-8">
        <AdminList currentUserId={user?.id ?? ""} />
      </div>
    </div>
  );
}
