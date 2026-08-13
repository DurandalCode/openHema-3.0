export type AppShellProps = {
  brand?: React.ReactNode;
  nav?: React.ReactNode;
  userSlot?: React.ReactNode;
};

/**
 * AppShell — презентационная оболочка верхней полосы приложения (topbar),
 * без бизнес-данных. Пункты навигации/юзер-блок приходят готовыми
 * React-узлами — конкретная композиция (реальные пункты, `getCurrentUser`)
 * собирается выше по FSD-дереву, см. `widgets/admin-shell`.
 *
 * Строка заголовка раздела (крошка/заголовок/статус/счётчик/действия) сюда
 * не входит — с спеки 0024 (FR-19) это отдельный `shared/ui/page-header.tsx`,
 * который рендерит сам экран первым элементом.
 */
export function AppShell({ brand, nav, userSlot }: AppShellProps) {
  return (
    <div data-slot="app-shell">
      <div className="flex h-[var(--topbar-h)] w-full items-center justify-between border-b border-border bg-background px-4">
        <div className="flex h-full items-center gap-6">
          {brand}
          {nav}
        </div>
        {userSlot}
      </div>
    </div>
  );
}
