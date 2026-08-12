import { AdminShell } from "@/widgets/admin-shell/admin-shell";

/**
 * Layout раздела /admin/**: шапка+под-навигация по разделам админки (FR-3).
 * Серверный guard (аутентификация/роль) — в родительском (admin)/layout.tsx,
 * выполняется раньше рендера этого layout'а. `AdminShell` — full-width
 * (topbar), поэтому без `mx-auto max-w-4xl`-обёртки, в отличие от прежней
 * `AdminNav`.
 */
export default function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminShell />
      {children}
    </>
  );
}
