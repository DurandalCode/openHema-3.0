import Link from "next/link";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { siteConfig } from "@/shared/config/site-config";
import { AppShell } from "@/shared/ui/app-shell";
import { Row } from "@/shared/ui/stack";
import { UserMenu } from "@/widgets/navbar/user-menu";
import { AdminNavLinks } from "./admin-nav-links";
import { ExitToPublicLink } from "./exit-to-public-link";

/**
 * AdminShell — шапка админ-зоны: topbar (бренд + под-навигация + юзер-блок).
 * Server component: получает пользователя через `getCurrentUser()` (та же
 * функция уже вызвана в родительском guard'е `(admin)/layout.tsx` — здесь
 * повторный вызов нужен для прокидывания `UserMenu`; дублирование —
 * существующий паттерн, см. `widgets/navbar/navbar.tsx`).
 *
 * `ExitToPublicLink` — рядом с `UserMenu` в `userSlot`, не отдельный четвёртый
 * слот `AppShell` (тот сознательно ограничен `brand`/`nav`/`userSlot`,
 * `web/AGENTS.md` правило 11).
 *
 * Строку заголовка раздела (крошка/заголовок/счётчик/действия) `AppShell`
 * больше не рендерит — с спеки 0024 (FR-19) это `shared/ui/page-header.tsx`,
 * которую рендерит сам экран.
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
      userSlot={
        <Row align="center" gap={4}>
          <ExitToPublicLink />
          {user && <UserMenu user={user} />}
        </Row>
      }
    />
  );
}
