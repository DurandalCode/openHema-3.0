---
task: T8b
feature: docs/specs/0046-preprod-access-gate/
status: pending
requires: local
depends_on: [T2]
---

# T8b — гейт `/about` и `/nominations/[id]` (редирект, как в `app/(admin)/layout.tsx`)

> Артефакт ADR 0021. Самодостаточная карточка: исполнитель работает
> **только** с этим файлом и файлами, которые он явно называет — не
> заглядывает в `AGENTS.md`, `spec.md`, `plan.md` или другие задачи.

## Цель

На двух публичных страницах — `app/about/page.tsx` и
`app/nominations/[id]/page.tsx` — анонимный посетитель при включённом
`PREPROD_MODE` получает `redirect("/login")`, тем же приёмом, что уже
использует `app/(admin)/layout.tsx` для гостя. Здесь редирект безопасен
(в отличие от главной, T8a): `/login` — заглушка, уводящая на `/`, и `/` —
не эта страница, цикла не будет.

**Предполагается, что `web/src/shared/config/preprod.ts`
(`isPreprodModeEnabled(): boolean`, задача T2) уже существует** — не
создавать его заново, только импортировать.

## Контекст

Готовый прецедент того же гейта, `web/src/app/(admin)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
// ...
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  // ...
}
```

`web/src/app/about/page.tsx` (текущее содержимое целиком):

```tsx
import { Swords } from "lucide-react";
import { siteConfig } from "@/shared/config/site-config";
import { Badge } from "@/shared/ui/badge";
import { Col } from "@/shared/ui/stack";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getNominations } from "@/entities/nomination/model/get-nominations";
import { TournamentAboutScreen } from "@/widgets/tournament-about/tournament-about-screen";

export const dynamic = "force-dynamic";

function AboutPlatformFallback() {
  // ... не трогать, презентационная функция
}

export default async function AboutPage() {
  const tournament = await getActiveTournament();
  if (!tournament) {
    return <AboutPlatformFallback />;
  }

  const nominations = await getNominations(tournament.id);

  return <TournamentAboutScreen tournament={tournament} nominations={nominations} />;
}
```

Эта страница **не вызывает `getCurrentUser()` сегодня вовсе** — нужно
добавить вызов.

`web/src/app/nominations/[id]/page.tsx` (текущее содержимое целиком):

```tsx
import { notFound } from "next/navigation";
import { getNomination } from "@/entities/nomination/model/get-nomination";
import { getNominationLive } from "@/entities/nomination-live/model/get-nomination-live";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { NominationPublicScreen } from "@/widgets/nomination-public/nomination-public-screen";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function PublicNominationPage({ params }: PageProps) {
  const { id } = await params;
  const [nomination, snapshot, user] = await Promise.all([
    getNomination(id),
    getNominationLive(id),
    getCurrentUser(),
  ]);
  if (!nomination) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16">
      <NominationPublicScreen
        nominationId={id}
        nomination={nomination}
        initialSnapshot={snapshot}
        isAuthenticated={Boolean(user)}
      />
    </div>
  );
}
```

Эта страница **уже вызывает `getCurrentUser()`** (в составе `Promise.all`,
переменная `user`) — использовать существующий результат, не звать второй
раз.

## Red — тест первым

В проекте сегодня нет unit-тестов для этих двух `page.tsx` (в отличие от
`app/(admin)/layout.test.tsx`, который есть). Эта задача не заводит их
специально — готовность проверяется вручную (Acceptance) и содержательно
тестом `isPreprodModeEnabled` (T2), который уже существует и не меняется
здесь.

Если исполнитель предпочитает всё же покрыть эти две страницы тестами по
образцу `app/(admin)/layout.test.tsx` (мок `next/navigation` `redirect`,
бросающий с текстом `REDIRECT:/login`, мок `getCurrentUser`) — это
допустимо и приветствуется, но не обязательно для Acceptance.

## Green — минимальная реализация

**`web/src/app/about/page.tsx`**: импортировать `redirect` из
`"next/navigation"`, `getCurrentUser` из
`@/entities/user/model/get-current-user`, `isPreprodModeEnabled` из
`@/shared/config/preprod`. В начале `AboutPage` — до текущей первой строки
`const tournament = await getActiveTournament();` — вызвать
`getCurrentUser()` и, если `isPreprodModeEnabled()` и пользователя нет,
сделать `redirect("/login")`, дословно как в `app/(admin)/layout.tsx`.

**`web/src/app/nominations/[id]/page.tsx`**: импортировать `redirect` из
`"next/navigation"` (`notFound` там уже импортирован из того же модуля —
объединить в один импорт) и `isPreprodModeEnabled` из
`@/shared/config/preprod`. После существующего `Promise.all` (уже даёт
`user`) и **до** `if (!nomination) { notFound(); }` — если
`isPreprodModeEnabled()` и `!user`, сделать `redirect("/login")`.

## Acceptance

Команда: `pnpm --dir web exec tsc --noEmit`

Критерий: без ошибок типов; плюс ручная проверка — `PREPROD_MODE=true`,
открыть `/about` и `/nominations/<любой-id>` без сессии → браузер уходит на
`/`, где открывается диалог входа (через тот же `/login`); с сессией (или
без `PREPROD_MODE`) — страницы работают как раньше.

## Boundaries

- Не создавать файлы сверх правки этих двух `page.tsx`.
- Не трогать: `app/(admin)/layout.tsx` (образец, не менять), `app/page.tsx`
  (отдельная задача T8a — там другой паттерн, рендер на месте, не редирект),
  `web/src/shared/config/preprod.ts` (уже существует, T2).
- Не заводить `page.test.tsx` для этих страниц как обязательную часть
  задачи (см. Red) — можно добавить по желанию, не блокирует Acceptance.
