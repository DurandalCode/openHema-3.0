import { Button } from "@/shared/ui/button";
import { Tag, type TagTone } from "@/shared/ui/tag";
import { Tooltip } from "@/shared/ui/tooltip";
import type { Role } from "@/entities/user/lib/types";
import type { AdminUser } from "../api/requests";
import { formatDateTime, formatRelativeDay } from "@/shared/lib/datetime";
import { initials } from "../lib/select-users";

export type UserRowAction = {
  label: "Повысить" | "Понизить";
  onClick: () => void;
  disabled?: boolean;
};

const ROLE_LABEL: Record<Role, string> = {
  ROLE_ADMIN: "Админ",
  ROLE_USER: "Пользователь",
  ROLE_UNSPECIFIED: "—",
};

const ROLE_TONE: Record<Role, TagTone> = {
  ROLE_ADMIN: "blue",
  ROLE_USER: "neutral",
  ROLE_UNSPECIFIED: "neutral",
};

/**
 * UserRow — строка учётной записи в таблице «Пользователи» (FR-1, FR-9,
 * FR-10): аватар-инициалы + имя/email, роль, дата регистрации с подсказкой,
 * действие «Повысить»/«Понизить» либо подпись «вы · нельзя понизить себя»
 * в собственной строке текущего пользователя.
 *
 * Решение по «Рискам» плана (T8, план §«Риски и открытые вопросы»): строка
 * НЕ использует `cells`-API `TableRow` — ячейки «Пользователь» (аватар) и
 * «Действие» (кнопка/подпись) нуждаются в разметке, а не в тексте, а
 * расширение общего примитива слотом `node` — вне скоупа этого трека
 * (`shared/ui/**` в это время правит Трек A в отдельном worktree); строка
 * верстается независимо, переиспользуя визуальный язык `TableRow` (высота
 * `--row-h`, граница снизу, hover-фон) через собственную разметку.
 */
export function UserRow({
  user,
  isCurrentUser,
  action,
  now,
}: {
  user: AdminUser;
  isCurrentUser: boolean;
  action?: UserRowAction;
  now?: Date;
}) {
  return (
    <div
      data-slot="user-row"
      className="flex items-center gap-4 border-b border-border px-6 hover:bg-[#f4f2ee] dark:hover:bg-[#111116]"
      style={{ height: "var(--row-h)" }}
    >
      <div className="flex min-w-0 flex-[2] items-center gap-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#f4f2ee] text-[11px] font-semibold text-[#6b6b76] dark:bg-[#1a1a20] dark:text-[#a6a6b2]"
        >
          {initials(user)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {user.displayName || "—"}
          </div>
          <div className="truncate text-xs text-caption-foreground">{user.email}</div>
        </div>
      </div>

      <div className="flex-1">
        <Tag label={ROLE_LABEL[user.role]} tone={ROLE_TONE[user.role]} />
      </div>

      <div className="flex-1">
        <Tooltip content={formatDateTime(user.createdAt)}>
          <span
            tabIndex={0}
            className="cursor-default text-sm text-[#6b6b76] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:text-[#a6a6b2]"
          >
            {formatRelativeDay(user.createdAt, now)}
          </span>
        </Tooltip>
      </div>

      <div className="flex flex-1 justify-end">
        {isCurrentUser ? (
          <span className="text-xs text-caption-foreground">
            вы · нельзя понизить себя
          </span>
        ) : action ? (
          <Button size="sm" variant="outline" disabled={action.disabled} onClick={action.onClick}>
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
