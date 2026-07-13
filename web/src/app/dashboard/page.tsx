import { redirect } from "next/navigation";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
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
        <CardContent className="text-sm">
          <Col gap={3}>
            <ProfileRow label="Email" value={user.email} />
            <ProfileRow label="Имя" value={user.displayName || "—"} />
            <ProfileRow
              label="Регистрация"
              value={
                user.createdAt
                  ? new Date(user.createdAt).toLocaleDateString("ru-RU")
                  : "—"
              }
            />
          </Col>
        </CardContent>
      </Card>

      <LogoutButton />
    </div>
  );
}

/** ProfileRow — единая строка «label — value» карточки профиля. */
function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <Row justify="between" gap={4}>
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </Row>
  );
}
