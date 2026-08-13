import { toast } from "sonner";

const RETRY_LABEL = "Повторить";
const UNDO_LABEL = "Отменить";

/**
 * Тонкая проектная обёртка над `sonner` — единственный разрешённый вход к
 * тостам в проекте (FR-5). Фичи импортируют функции отсюда, а не `sonner`
 * напрямую: замена библиотеки становится правкой одного файла, а правило
 * канала обратной связи — проверяемым (см. `web/AGENTS.md`).
 */

/** Успешно выполненное действие без возможности отмены. */
export function toastSuccess(message: string): void {
  toast.success(message);
}

/** Ошибка действия. С `retry` — добавляет действие «Повторить». */
export function toastError(
  message: string,
  options?: { retry?: () => void },
): void {
  toast.error(message, {
    // Ошибка ждёт реакции пользователя, а не скрывается сама (FR-6).
    duration: Infinity,
    action: options?.retry
      ? { label: RETRY_LABEL, onClick: options.retry }
      : undefined,
  });
}

/** Успешно выполненное действие, которое можно отменить одним нажатием. */
export function toastUndo(
  message: string,
  options: { onUndo: () => void },
): void {
  toast.success(message, {
    action: { label: UNDO_LABEL, onClick: options.onUndo },
  });
}

/** Выполняющееся длительное действие. */
export function toastPending(message: string): void {
  toast.loading(message);
}
