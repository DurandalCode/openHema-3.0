import { redirect } from "next/navigation";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { MyApplicationsList } from "@/features/my-applications/ui/my-applications-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Мои заявки — отдельная защищённая страница (вынесена из кабинета,
 * доступна из навбара). Доступна только аутентифицированным пользователям.
 */
export default async function ApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Мои заявки</h1>
      <p className="mt-2 text-muted-foreground">
        Статус и история ваших заявок на участие в турнире.
      </p>
      <div className="mt-8">
        <MyApplicationsList />
      </div>
    </div>
  );
}
