/**
 * ADJUST_STEPS — шаги ±секунд корректировки таймера боя (спека 0033,
 * FR-17). Вынесены из `TimerControls` (спека 0045, T2), чтобы не
 * дублироваться в мобильном листе действий `BoutActionsSheetContent`.
 */
export const ADJUST_STEPS = [1, 2, 3, 5] as const;
