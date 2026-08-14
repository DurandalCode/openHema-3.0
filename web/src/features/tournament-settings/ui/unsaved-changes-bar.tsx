export type UnsavedChangesBarProps = {
  /** Список изменённых полей от `tournamentDraftChanges` (spec FR-7). */
  changes: string[];
};

/**
 * UnsavedChangesBar — полоса несохранённых изменений профиля турнира
 * (spec 0029, FR-7, AC-4/AC-5): перечисляет изменённые поля через запятую и
 * напоминает, что правки станут видны на главной только после сохранения.
 * При пустом списке изменений компонент не рендерится вовсе. Признак читается
 * текстом, а не только цветом (NFR-4).
 */
export function UnsavedChangesBar({ changes }: UnsavedChangesBarProps) {
  if (changes.length === 0) return null;

  return (
    <div
      data-slot="unsaved-changes-bar"
      role="status"
      className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
    >
      <p className="font-medium text-foreground">
        Несохранённые изменения: {changes.join(", ")}
      </p>
      <p className="text-caption-foreground">
        Правки появятся на главной сразу после сохранения.
      </p>
    </div>
  );
}
