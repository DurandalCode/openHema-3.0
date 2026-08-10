import { PresetLibrary } from "@/features/format-presets/ui/preset-library";
import { AdminHeader } from "../admin-header";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /admin/formats — библиотека пресетов формата (спека 0020, FR-12):
 * глобальная, вне турнира и вне номинации — сохранить/переименовать/удалить.
 * Сохранение нового пресета из схемы номинации — на странице этапов
 * номинации (`SavePresetDialog`, `.../nominations/[id]/stages`); здесь —
 * только сама библиотека.
 */
export default function AdminFormatsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <AdminHeader
        title="Форматы"
        description="Библиотека пресетов схемы номинации — вне турнира, переиспользуется между турнирами (FR-12)."
      />

      <div className="mt-8">
        <PresetLibrary />
      </div>
    </div>
  );
}
