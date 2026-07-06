import { redirect } from "next/navigation";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { LogoutButton } from "./logout-button";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Защищённый кабинет: доступен только аутентифицированным пользователям. */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Кабинет</h1>
      <p className="mt-2 text-muted-foreground">
        Привет, {user.displayName || user.email}!
      </p>

      <Card className="mt-6 max-w-md">
        <CardHeader>
          <CardTitle>Профиль</CardTitle>
          <CardDescription>Данные вашего аккаунта.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Email</span>
            <span className="truncate font-medium">{user.email}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Имя</span>
            <span className="font-medium">{user.displayName || "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Регистрация</span>
            <span className="font-medium">
              {user.createdAt
                ? new Date(user.createdAt).toLocaleDateString("ru-RU")
                : "—"}
            </span>
          </div>
        </CardContent>
      </Card>

      <LogoutButton />
    </div>
  );
}
