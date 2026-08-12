export type AppShellProps = {
  brand?: React.ReactNode;
  nav?: React.ReactNode;
  userSlot?: React.ReactNode;
  crumb?: string;
  title?: string;
  status?: React.ReactNode;
  meta?: string;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
};

/**
 * AppShell — презентационная оболочка шапки приложения: двухрядная
 * (topbar + опциональный header раздела), без бизнес-данных. Пункты
 * навигации/юзер-блок приходят готовыми React-узлами — конкретная композиция
 * (реальные пункты, `getCurrentUser`) собирается выше по FSD-дереву, см.
 * `widgets/admin-shell`.
 *
 * Header-строка (crumb/title/status/meta/action/secondary) рендерится только
 * если передан хотя бы один из этих слотов — иначе не показываем пустую
 * полосу. Скоуп 0022 — только topbar (шапка+навигация+юзер); слоты header'а
 * принимаются уже сейчас (сигнатура не будет меняться на каждой следующей
 * экранной спеке), но заполняются начиная со спек `0024`+.
 */
export function AppShell({
  brand,
  nav,
  userSlot,
  crumb,
  title,
  status,
  meta,
  action,
  secondary,
}: AppShellProps) {
  const hasHeader = Boolean(
    crumb || title || status || meta || action || secondary,
  );

  return (
    <div data-slot="app-shell">
      <div className="flex h-[var(--topbar-h)] w-full items-center justify-between border-b border-border bg-background px-4">
        <div className="flex h-full items-center gap-6">
          {brand}
          {nav}
        </div>
        {userSlot}
      </div>
      {hasHeader && (
        <div className="flex h-[var(--header-h)] w-full items-center justify-between border-b border-border bg-surface-raised px-4">
          <div>
            {crumb && (
              <div className="font-mono text-[10px] uppercase tracking-[.14em] text-caption-foreground">
                {crumb}
              </div>
            )}
            {title && (
              <div className="text-[17px] font-bold text-foreground">
                {title}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            {status}
            {meta && (
              <span className="font-mono text-caption-foreground">
                {meta}
              </span>
            )}
            {secondary}
            {action}
          </div>
        </div>
      )}
    </div>
  );
}
