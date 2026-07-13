import Link from "next/link";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { siteConfig } from "@/shared/config/site-config";
import { Row } from "@/shared/ui/stack";
import { NavLinks } from "./nav-links";
import { UserMenu } from "./user-menu";
import { NavbarAuthButton } from "./navbar-auth-button";
import { ThemeToggle } from "./theme-toggle";

/**
 * Navbar — серверный компонент.
 * Получает пользователя через getCurrentUser() (cookie + gRPC me) и рендерит
 * auth-блок в зависимости от состояния. Токен не утекает в браузер.
 */
export async function Navbar() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-sm">
      <Row align="center" justify="between" className="mx-auto h-14 max-w-6xl px-4">
        <Row align="center" gap={6}>
          <Link
            href="/"
            className="text-base font-semibold tracking-tight"
          >
            {siteConfig.name}
          </Link>
          <NavLinks isAuthenticated={Boolean(user)} />
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
  );
}
