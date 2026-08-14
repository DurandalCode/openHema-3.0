import { PresetLibrary } from "@/features/format-presets/ui/preset-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /admin/formats — библиотека пресетов формата (спека 0020, FR-12; редизайн
 * 0029, FR-17…FR-23): глобальная, вне турнира и вне номинации —
 * сохранить/переименовать/удалить. Сохранение нового пресета из схемы
 * номинации — на странице этапов номинации (`SavePresetDialog`,
 * `.../nominations/[id]/stages`); здесь — только сама библиотека.
 * `PresetLibrary` сама рендерит `PageHeader` первым элементом (правило 0024,
 * FR-19) — роут не оборачивает её ни в `AdminHeader`, ни в узкую колонку.
 */
export default function AdminFormatsPage() {
  return <PresetLibrary />;
}
