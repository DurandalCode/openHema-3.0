import type { Tournament, TournamentFile } from "./types";

/**
 * toFilesProxyPath — переписывает адрес загруженного файла, отданный
 * Go-сервером ("/files/{id}", см. `server/modules/tournament/api/
 * handler.go`, `filesBaseURL`), на путь BFF-прокси
 * (`app/api/files/[id]/route.ts`, спека 0042, ADR 0019 п.6): браузер
 * ходит в BFF, а не напрямую в Go-сервер (ADR 0001). Значение, не
 * похожее на путь локального адаптера (например, будущий публичный URL
 * S3-адаптера, ADR 0019 «Альтернативы»), проходит без изменений.
 */
function toFilesProxyPath(url: string): string {
  return url.startsWith("/files/") ? `/api${url}` : url;
}

/**
 * resolveFileOrLink — общее правило «файл приоритетнее ссылки» (спека
 * 0042, FR-34): непустой `file.url` вытесняет `url`. Вынесено отдельно от
 * `regulationsHref`/`emblemSrc`, чтобы тем же правилом мог пользоваться
 * `file-or-link-field.tsx` — там нет целого `Tournament` под рукой, только
 * `TournamentFile` и текущее значение поля ссылки.
 */
export function resolveFileOrLink(file: TournamentFile, url: string): string {
  return file.url ? toFilesProxyPath(file.url) : url;
}

/** regulationsHref — куда ведёт «Регламент турнира» (FR-30/FR-34). */
export function regulationsHref(t: Tournament): string {
  return resolveFileOrLink(t.regulationsFile, t.regulationsUrl);
}

/** emblemSrc — откуда рисовать эмблему турнира (FR-31/FR-34). */
export function emblemSrc(t: Tournament): string {
  return resolveFileOrLink(t.emblemFile, t.emblemUrl);
}

const SIZE_UNITS = ["Б", "КБ", "МБ", "ГБ"] as const;

/**
 * formatFileSize — человекочитаемый размер файла («2,4 МБ»): байты и
 * килобайты — целым числом, от мегабайт — с одним знаком после запятой
 * (русская десятичная запятая, не точка). Используется превью
 * `file-or-link-field.tsx`.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  let formatted: string;
  if (unitIndex === 0) {
    formatted = String(Math.round(value));
  } else {
    const fixed = value.toFixed(1);
    // Целое число единиц (напр. "2.0 КБ") не несёт дробной информации —
    // показываем без ".0", десятичная запятая, не точка (пример из спеки:
    // «2,4 МБ»).
    formatted = fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed.replace(".", ",");
  }
  return `${formatted} ${SIZE_UNITS[unitIndex]}`;
}
