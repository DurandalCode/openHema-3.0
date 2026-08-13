/**
 * formatDurationLabel — форматирует дефолтную длительность боя площадки
 * (`Arena.defaultDurationSeconds`, спека 0015) в `M:SS` для колонки
 * «Длительность по умолчанию» и быстрых значений модалки правки (спека
 * 0027, FR-1/FR-12). Минуты без ведущего нуля, секунды — с ведущим нулём до
 * двух знаков. Отдельная функция от `formatTimerCs` (`features/arena-timer`)
 * — тот работает с сотыми секунды таймера, здесь секунды настройки.
 */
export function formatDurationLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
