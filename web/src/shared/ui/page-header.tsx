export type PageHeaderProps = {
  crumb?: React.ReactNode;
  title?: string;
  status?: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
};

/**
 * PageHeader — строка заголовка раздела (крошка/заголовок/статус/счётчик/
 * действия), FR-19 спеки 0024. Вынесена из header-строки `AppShell` (спека
 * 0022) без изменения разметки/классов: `AppShell` рендерит только topbar,
 * а строку заголовка раздела рендерит сам экран первым элементом — сборка
 * та же двухрядная, но данные для слотов идут от страницы, а не пробрасываются
 * сквозь layout.
 *
 * Строка не рендерится вовсе, если все слоты пусты — так же, как раньше вело
 * себя `hasHeader` в `AppShell`.
 *
 * Отличие от исходных слотов `AppShell`: `meta` — `React.ReactNode`, а не
 * `string` (счётчик приходит как форматированный элемент из данных).
 */
export function PageHeader({
  crumb,
  title,
  status,
  meta,
  action,
  secondary,
}: PageHeaderProps) {
  const hasHeader = Boolean(
    crumb || title || status || meta || action || secondary,
  );

  if (!hasHeader) return null;

  return (
    <div
      data-slot="page-header"
      className="flex h-[var(--header-h)] w-full items-center justify-between border-b border-border bg-surface-raised px-4"
    >
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
          <span className="font-mono text-caption-foreground">{meta}</span>
        )}
        {secondary}
        {action}
      </div>
    </div>
  );
}
