import Link from "next/link";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { getPublicPhase } from "@/entities/tournament-live/model/get-public-phase";
import { publicNavItems } from "@/shared/lib/public-nav-items";
import { siteConfig } from "@/shared/config/site-config";
import { Row } from "@/shared/ui/stack";
import { NavLinks } from "./nav-links";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";
import { NavbarAuthButton } from "./navbar-auth-button";
import { ThemeToggle } from "./theme-toggle";

/**
 * Navbar — серверный компонент.
 * Получает пользователя через getCurrentUser() (cookie + gRPC me) и рендерит
 * auth-блок в зависимости от состояния. Токен не утекает в браузер.
 *
 * Состав пунктов меню (спека 0039, блок B) считает `publicNavItems` по фазе
 * турнира (`getPublicPhase`, server-only) и авторизации — единый список,
 * который получает и широкое меню (`NavLinks`), и узкая нижняя панель
 * (`MobileNav`, T18). Обе рендерятся отсюда, из одного вызова
 * `getCurrentUser`/`getPublicPhase`, а не из двух отдельных серверных
 * компонентов — иначе `getCurrentUser` (не обёрнут `cache()`, T15 обернул
 * только `getActiveTournament`/`getTournamentLive`) звался бы дважды за
 * рендер, что и обошлось бы дороже одного лишнего запроса (NFR-3).
 * `NavbarVisibilityGate` в `app/layout.tsx` прячет оба представления разом,
 * потому что оба — часть одного дерева, возвращаемого этим компонентом.
 */
export async function Navbar() {
  const [user, phase] = await Promise.all([getCurrentUser(), getPublicPhase()]);
  const items = publicNavItems({ phase, isAuthenticated: Boolean(user) });

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-sm">
        <Row align="center" justify="between" className="mx-auto h-14 max-w-6xl px-4">
          <Row align="center" gap={6}>
            <Link
              href="/"
              className="text-base font-semibold tracking-tight"
            >
              {siteConfig.name}
            </Link>
            <NavLinks items={items} />
            {user?.role === "ROLE_ADMIN" && (
              <Link
                href="/admin"
                className="hidden text-sm font-medium text-foreground transition-colors hover:text-primary md:inline"
              >
                Админка
              </Link>
            )}
          </Row>

          <Row align="center" gap={2}>
            <ThemeToggle />
            {user ? <UserMenu user={user} /> : <NavbarAuthButton />}
          </Row>
        </Row>
      </header>
      <MobileNav items={items} />
    </>
  );
}
