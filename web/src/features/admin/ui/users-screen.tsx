"use client";

import { useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Pagination } from "@/shared/ui/pagination";
import { toastError, toastSuccess, toastUndo } from "@/shared/lib/toast";
import type { AdminUser } from "../api/requests";
import { useUsers } from "../api/use-users";
import { usePromoteUser } from "../api/use-promote-user";
import { useDemoteUser } from "../api/use-demote-user";
import { filterUsers, roleCounts, type RoleFilter } from "../lib/select-users";
import { clampPage, pageSlice } from "../lib/paginate-local";
import { CreateAdminDialog } from "./create-admin-dialog";
import { UsersFilters } from "./users-filters";
import { UsersTable } from "./users-table";
import type { UserRowAction } from "./user-row";

/** PAGE_SIZE — фиксированный размер клиентской страницы (FR-23). */
export const PAGE_SIZE = 20;

function personLabel(user: AdminUser): string {
  return user.displayName || user.email;
}

/**
 * UsersScreen — корень экрана «Пользователи» (FR-1…FR-23): единый список
 * всех учётных записей, фильтр по роли + поиск, повышение/понижение с
 * отменяемым тостом, модалка создания админа, клиентская пагинация.
 *
 * Владеет UI-состоянием (фильтр/поиск/страница/открытость модалки) через
 * `useState` (ADR 0006 — некроссcomponent состояние). Заголовок раздела —
 * временная локальная заглушка вместо `shared/ui/page-header.tsx`: этот
 * примитив параллельно строит Трек A (`tasks.md`, T1) в другом worktree;
 * реальное подключение — join-волна T13/T14.
 */
export function UsersScreen({ currentUserId }: { currentUserId: string }) {
  const usersQuery = useUsers();
  const promote = usePromoteUser();
  const demote = useDemoteUser();

  const [role, setRole] = useState<RoleFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const all = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  // roleCounts не принимает поиск намеренно (FR-6/AC-3) — считаем по всему списку.
  const counts = useMemo(() => roleCounts(all), [all]);
  const filtered = useMemo(() => filterUsers(all, { role, query }), [all, role, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = clampPage(page, pageCount);
  const pageItems = pageSlice(filtered, currentPage, PAGE_SIZE);

  function onRoleChange(next: RoleFilter) {
    setRole(next);
    setPage(1); // FR-8/AC-15: смена фильтра возвращает на первую страницу.
  }

  function onQueryChange(next: string) {
    setQuery(next);
    setPage(1); // FR-8: смена поиска возвращает на первую страницу.
  }

  function promoteWithFeedback(user: AdminUser) {
    promote.mutate(user.id, {
      onSuccess: () => {
        toastUndo(`${personLabel(user)} повышен до ADMIN`, {
          onUndo: () => {
            demote.mutate(user.id, {
              onSuccess: () => toastSuccess(`${personLabel(user)} понижен обратно`),
              onError: (err) => toastError(err.message),
            });
          },
        });
      },
      onError: (err) => toastError(err.message),
    });
  }

  function demoteWithFeedback(user: AdminUser) {
    demote.mutate(user.id, {
      onSuccess: () => {
        toastUndo(`${personLabel(user)} понижен до USER`, {
          onUndo: () => {
            promote.mutate(user.id, {
              onSuccess: () => toastSuccess(`${personLabel(user)} повышен обратно`),
              onError: (err) => toastError(err.message),
            });
          },
        });
      },
      onError: (err) => toastError(err.message),
    });
  }

  function getAction(user: AdminUser): UserRowAction | undefined {
    if (user.role === "ROLE_ADMIN") {
      return {
        label: "Понизить",
        disabled: demote.isPending,
        onClick: () => demoteWithFeedback(user),
      };
    }
    return {
      label: "Повысить",
      disabled: promote.isPending,
      onClick: () => promoteWithFeedback(user),
    };
  }

  return (
    <div data-slot="users-screen" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Пользователи</h1>
          <p className="text-sm text-caption-foreground">{counts.total} учётных записей</p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          + Создать админа
        </Button>
      </div>

      <UsersFilters
        role={role}
        onRoleChange={onRoleChange}
        counts={counts}
        query={query}
        onQueryChange={onQueryChange}
      />

      <UsersTable
        users={pageItems}
        isLoading={usersQuery.isLoading}
        error={usersQuery.error}
        onRetry={() => usersQuery.refetch()}
        hasAnyUsers={all.length > 0}
        currentUserId={currentUserId}
        getAction={getAction}
      />

      {pageCount > 1 && (
        <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
      )}

      <CreateAdminDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(user) => toastSuccess(`${personLabel(user)} добавлен`)}
      />
    </div>
  );
}
