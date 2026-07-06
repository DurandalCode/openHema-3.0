import Link from "next/link";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { siteConfig } from "@/shared/config/site-config";
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
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight"
          >
            {siteConfig.name}
          </Link>
          <nav className="hidden items-center gap-6 text-sm md:flex">
            {siteConfig.navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.title}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? <UserMenu user={user} /> : <NavbarAuthButton />}
        </div>
      </div>
    </header>
  );
}
