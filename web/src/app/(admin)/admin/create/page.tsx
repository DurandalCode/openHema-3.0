import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { CreateAdminForm } from "@/features/admin/ui/create-admin-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /admin/create — форма создания нового администратора. */
export default function CreateAdminPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Новый админ</h1>
      <p className="mt-2 text-muted-foreground">
        Создать пользователя с ролью ADMIN.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Учётные данные</CardTitle>
          <CardDescription>
            Новый админ сможет войти через обычную форму входа.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateAdminForm />
        </CardContent>
      </Card>
    </div>
  );
}
