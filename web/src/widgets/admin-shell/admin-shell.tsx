import Link from "next/link";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { siteConfig } from "@/shared/config/site-config";
import { AppShell } from "@/shared/ui/app-shell";
import { UserMenu } from "@/widgets/navbar/user-menu";
import { AdminNavLinks } from "./admin-nav-links";

/**
 * AdminShell — шапка админ-зоны: topbar (бренд + под-навигация + юзер-блок).
 * Server component: получает пользователя через `getCurrentUser()` (та же
 * функция уже вызвана в родительском guard'е `(admin)/layout.tsx` — здесь
 * повторный вызов нужен для прокидывания `UserMenu`; дублирование —
 * существующий паттерн, см. `widgets/navbar/navbar.tsx`).
 *
 * Header-слоты `AppShell` (crumb/title/status/meta/action/secondary) — вне
 * скоупа 0022, заполняются экранными спеками `0024`+.
 */
export async function AdminShell() {
  const user = await getCurrentUser();

  return (
    <AppShell
      brand={
        <Link
          href="/admin"
          className="text-base font-semibold tracking-tight text-foreground"
        >
          {siteConfig.name}
        </Link>
      }
      nav={<AdminNavLinks />}
      userSlot={user && <UserMenu user={user} />}
    />
  );
}
