"use client";

import { filterChipVariants } from "@/shared/ui/filter-chip";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/cn";
import type { RoleCounts, RoleFilter } from "../lib/select-users";

const SEARCH_ID = "users-search";

/**
 * RoleChip — переключатель фильтра по роли, поверх стилей `FilterChip`
 * (спека 0022). `FilterChip` сам по себе не принимает `aria-pressed`
 * (интерфейс `FilterChipProps` не расширяет `React.ComponentProps<"button">`
 * и не спредит лишние пропы) — а NFR-4 требует настоящего переключателя с
 * состоянием «выбран». Расширить примитив нельзя: `shared/ui/**` в эту волну
 * правит Трек A в параллельном worktree (вне скоупа этого трека). Поэтому
 * здесь собран собственный `<button aria-pressed>`, переиспользующий
 * экспортированный `filterChipVariants` — те же классы/тона, что и у
 * `FilterChip`, но с настоящей a11y-семантикой переключателя.
 */
function RoleChip({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string;
  count?: number;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(filterChipVariants({ tone: pressed ? "active" : "idle" }))}
    >
      <span>{label}</span>
      {count !== undefined && <span className="font-mono">{count}</span>}
    </button>
  );
}

/**
 * UsersFilters — три взаимоисключающих фильтра по роли + поиск по имени/email
 * (FR-5, FR-6, FR-7). Управляемый компонент: состояние живёт в `UsersScreen`.
 */
export function UsersFilters({
  role,
  onRoleChange,
  counts,
  query,
  onQueryChange,
}: {
  role: RoleFilter;
  onRoleChange: (role: RoleFilter) => void;
  counts: RoleCounts;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Фильтр по роли" className="flex gap-2">
        <RoleChip label="Все" pressed={role === "all"} onClick={() => onRoleChange("all")} />
        <RoleChip
          label="Администраторы"
          count={counts.admins}
          pressed={role === "admin"}
          onClick={() => onRoleChange("admin")}
        />
        <RoleChip
          label="Пользователи"
          count={counts.users}
          pressed={role === "user"}
          onClick={() => onRoleChange("user")}
        />
      </div>

      <div className="min-w-[220px] flex-1">
        <Label htmlFor={SEARCH_ID} className="sr-only">
          Поиск по имени или email
        </Label>
        <Input
          id={SEARCH_ID}
          type="search"
          placeholder="Поиск по имени или email"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
    </div>
  );
}
