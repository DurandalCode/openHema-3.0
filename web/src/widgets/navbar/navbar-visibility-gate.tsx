"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isAdminRoute } from "@/shared/lib/is-admin-route";

/**
 * NavbarVisibilityGate — прячет публичный `Navbar` на `/admin/**`: там уже
 * есть собственная полноценная шапка `AdminShell` (widgets/admin-shell) —
 * бренд + под-навигация + меню пользователя. Без ворот на `/admin` рисовались
 * бы обе шапки разом, дублируя бренд и меню пользователя (найдено ручной
 * проверкой, макетов на этот случай нет — переход между зонами всегда
 * подразумевался неявно). `Navbar` — async server component (нужен
 * `getCurrentUser()`), сам не может читать `usePathname()`, поэтому решение
 * вынесено в этот тонкий клиентский компонент-обёртку — тот же приём, что
 * уже применяет `NavLinks` для собственных ссылок.
 */
export function NavbarVisibilityGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isAdminRoute(pathname)) return null;

  return <>{children}</>;
}
