---
task: T8a
feature: docs/specs/0046-preprod-access-gate/
status: pending
requires: local
depends_on: [T2, T7]
---

# T8a — гейт главной страницы (`app/page.tsx`)

> Артефакт ADR 0021. Самодостаточная карточка: исполнитель работает
> **только** с этим файлом и файлами, которые он явно называет — не
> заглядывает в `AGENTS.md`, `spec.md`, `plan.md` или другие задачи.

## Цель

На главной странице анонимный посетитель при включённом `PREPROD_MODE`
видит `PreprodGateScreen` (уже существует, задача T7) вместо обычного
содержимого. Здесь — **не редирект** (в отличие от T8b): `/login` в этом
проекте — клиентская заглушка, которая сама делает `router.replace("/")`, и
редирект `/` → `/login` зациклился бы. Поэтому на самой главной — рендер на
месте, без навигации.

**Предполагается, что `web/src/shared/config/preprod.ts`
(`isPreprodModeEnabled(): boolean`, задача T2) и
`web/src/widgets/preprod-gate/preprod-gate-screen.tsx`
(`PreprodGateScreen`, задача T7) уже существуют** — не создавать их заново,
только импортировать.

## Контекст

`web/src/app/page.tsx` (текущее содержимое целиком):

```tsx
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getNominations } from "@/entities/nomination/model/get-nominations";
import { getNominationParticipants } from "@/entities/application/model/get-nomination-participants";
import type { NominationParticipants } from "@/entities/application/lib/types";
import { getNominationRoster } from "@/entities/fighter/model/get-nomination-roster";
import type { RosterEntry } from "@/entities/fighter/lib/types";
import { getTournamentLive } from "@/entities/tournament-live/model/get-tournament-live";
import { HomeScreen } from "@/widgets/home/home-screen";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, tournament] = await Promise.all([
    getCurrentUser(),
    getActiveTournament(),
  ]);
  const [nominations, initialLiveSnapshot] = await Promise.all([
    getNominations(tournament?.id ?? ""),
    getTournamentLive(tournament?.id ?? ""),
  ]);
  const participantsByNomination: Record<string, NominationParticipants> = Object.fromEntries(
    await Promise.all(
      nominations.map(async (n) => [n.id, await getNominationParticipants(n.id)] as const),
    ),
  );
  const rosterByNomination: Record<string, RosterEntry[]> = Object.fromEntries(
    await Promise.all(
      nominations.map(async (n) => [n.id, await getNominationRoster(n.id)] as const),
    ),
  );

  return (
    <HomeScreen
      tournament={tournament}
      nominations={nominations}
      participantsByNomination={participantsByNomination}
      rosterByNomination={rosterByNomination}
      isAuthenticated={Boolean(user)}
      initialLiveSnapshot={initialLiveSnapshot}
    />
  );
}
```

`user` уже вычисляется первой строкой `Promise.all` — `null`, если гость
(см. сигнатуру `getCurrentUser()` в T3/T7: `Promise<CurrentUser | null>`).

## Red — тест первым

В проекте сегодня нет unit-теста для `app/page.tsx` (страница не покрыта
отдельным тестовым файлом) — эта задача не заводит его специально
(создание page-теста для страницы такого размера — за рамками мелкой
правки, и в проекте есть прецедент не покрывать конкретно эти три страницы
юнит-тестами, см. `plan.md`/`tasks.md` T8). Готовность проверяется вручную
(см. Acceptance) и содержательно — тестом `PreprodGateScreen` (T7) и тестом
`isPreprodModeEnabled` (T2), которые уже существуют и не меняются здесь.

## Green — минимальная реализация

Путь: `web/src/app/page.tsx`

Импортировать `isPreprodModeEnabled` из `@/shared/config/preprod` и
`PreprodGateScreen` из `@/widgets/preprod-gate/preprod-gate-screen`. После
получения `user` (после `Promise.all` с `getCurrentUser()`/
`getActiveTournament()`) добавить ветвление: если
`isPreprodModeEnabled() && !user` — вернуть `<PreprodGateScreen />` сразу,
не выполняя дальнейшие запросы (`getNominations`/`getTournamentLive`/...) —
гостю в preprod-режиме реальные данные турнира не нужны и не должны
запрашиваться. Иначе — существующая логика без изменений.

## Acceptance

Команда: `pnpm --dir web exec tsc --noEmit` (проверка типов — юнит-теста
для этой страницы нет, см. Red) плюс ручная проверка: `PREPROD_MODE=true`
в окружении Next.js dev-сервера, открыть `/` без сессии — виден
`PreprodGateScreen`, а не `HomeScreen`; с сессией (или без
`PREPROD_MODE`) — страница как раньше.

Критерий: `tsc --noEmit` без ошибок; при ручной проверке оба сценария ведут
себя, как описано.

## Boundaries

- Не создавать файлы сверх правки `web/src/app/page.tsx`.
- Не трогать: `web/src/widgets/home/home-screen.tsx` и остальные
  `entities/*` геттеры, `web/src/widgets/preprod-gate/preprod-gate-screen.tsx`
  (уже существует, T7), `app/about/page.tsx`, `app/nominations/[id]/page.tsx`
  (отдельная задача T8b — там другой паттерн, редирект, не рендер на месте).
- Не заводить `page.test.tsx` — в проекте сегодня его нет для этой
  страницы, и эта задача не расширяет тестовый охват страниц (см. Red).
