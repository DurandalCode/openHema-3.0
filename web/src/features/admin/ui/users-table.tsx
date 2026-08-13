"use client";

import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { SkeletonRows } from "@/shared/ui/skeletons";
import { TableHead, type TableHeadCol } from "@/shared/ui/table-head";
import type { AdminUser } from "../api/requests";
import { sortUsers } from "../lib/select-users";
import { UserRow, type UserRowAction } from "./user-row";

const COLUMNS: TableHeadCol[] = [
  { label: "Пользователь" },
  { label: "Роль", width: 160 },
  { label: "Регистрация", width: 160 },
  { label: "Действие", width: 180, align: "right" },
];

/**
 * UsersTable — таблица «Пользователи» (FR-1): шапка из четырёх колонок,
 * строки в детерминированном порядке `sortUsers` (FR-3), скелетон в форме
 * таблицы при загрузке (FR-20), ошибка с повтором (FR-21), два разных
 * пустых состояния — нет учёток вовсе / ничего не нашлось по фильтру или
 * поиску (FR-22).
 */
export function UsersTable({
  users,
  isLoading,
  error,
  onRetry,
  hasAnyUsers,
  currentUserId,
  getAction,
  now,
}: {
  /** Уже отфильтрованная/нарезанная по странице выборка — сортировка гарантируется этим компонентом. */
  users: AdminUser[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Есть ли хоть одна учётка в системе вообще (до фильтра/поиска) — различает два пустых состояния. */
  hasAnyUsers: boolean;
  currentUserId: string;
  getAction: (user: AdminUser) => UserRowAction | undefined;
  now?: Date;
}) {
  const rows = sortUsers(users);

  return (
    <div data-slot="users-table" className="overflow-hidden rounded-lg border border-border">
      <TableHead cols={COLUMNS} />

      {isLoading ? (
        <SkeletonRows rows={6} cols={4} />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Повторить
          </Button>
        </div>
      ) : rows.length === 0 ? (
        hasAnyUsers ? (
          <EmptyState
            title="Ничего не найдено"
            hint="Попробуйте изменить фильтр по роли или сбросить поиск."
          />
        ) : (
          <EmptyState title="В системе нет ни одной учётной записи" />
        )
      ) : (
        rows.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            isCurrentUser={u.id === currentUserId}
            action={getAction(u)}
            now={now}
          />
        ))
      )}
    </div>
  );
}
