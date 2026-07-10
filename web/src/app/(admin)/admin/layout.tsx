import { AdminNav } from "./admin-nav";

/**
 * Layout раздела /admin/**: под-навигация по разделам админки (FR-3).
 * Серверный guard (аутентификация/роль) — в родительском (admin)/layout.tsx,
 * выполняется раньше рендера этого layout'а.
 */
export default function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="mx-auto w-full max-w-4xl px-4">
        <AdminNav />
      </div>
      {children}
    </>
  );
}
