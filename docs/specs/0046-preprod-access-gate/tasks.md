# Tasks: Режим препродакшена (гейт публичного доступа)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-30
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах. Фича
целиком web — Go/proto не трогаются, треков/волн не заводим (все куски,
кроме T1, зависят от общих `shared/config/preprod.ts` и/или
`lib/grpc/preprod-guard.ts` из T1–T2, а объём каждого куска мал).

## Конфигурация

- [x] T1. `.env.example` — добавить `PREPROD_MODE=` и
      `REGISTRATION_DISABLED=` с комментарием (пусто/выключено по
      умолчанию, как `FILE_STORAGE_DIR`). → `tasks/T1-env-example.md`
- [x] T2. **shared/config (red→green)** — `shared/config/preprod.test.ts`:
      `isPreprodModeEnabled`/`isRegistrationDisabled` на `undefined`,
      `"true"`, любом другом значении → затем `shared/config/preprod.ts`.
      → `tasks/T2-shared-config-preprod.md`

## BFF-гейт публичных данных

- [x] T3. **guard (red→green)** — `lib/grpc/preprod-guard.test.ts`:
      флаг выключен → `null`, `getCurrentUser` не вызван (мок); флаг включён
      без сессии → `401`-`NextResponse`; флаг включён с сессией (мок
      `getCurrentUser`) → `null` → затем `lib/grpc/preprod-guard.ts`
      (`assertPreprodAccess`). → `tasks/T3-preprod-guard.md`
- [x] T4. **представитель + regression (red→green)** —
      `app/api/tournament/route.test.ts`: расширить кейсами
      `PREPROD_MODE=true` без сессии (`401`, апстрим не вызван) и с сессией
      (как раньше) → добавить вызов `assertPreprodAccess()` первой строкой
      в `route.ts`. Тот же приём — `app/api/files/[id]/route.test.ts` +
      `route.ts`. → `tasks/T4-gate-tournament-and-files.md`
- [x] T5. **остальные публичные ручки** — по одному regression-тесту
      «guard вызывается первой строкой» (мок `assertPreprodAccess` →
      `401`, апстрим-клиент не дёрнут) + добавление вызова в каждый `route.ts`:
      `app/api/tournament/live`, `app/api/tournament/live-snapshot`,
      `app/api/nominations`, `app/api/nominations/[id]`,
      `app/api/nominations/[id]/participants`,
      `app/api/nominations/[id]/roster`,
      `app/api/nominations/[id]/public-pools`,
      `app/api/nominations/[id]/live`,
      `app/api/nominations/[id]/live-snapshot`,
      `app/api/nominations/[id]/results`,
      `app/api/nominations/[id]/results/export`.
      → `tasks/T5-gate-remaining-public-routes.md` (батч-карточка: один
      файл разобран полностью как эталон, остальные десять — списком с
      точками отличия, применяются по образцу самим исполнителем)
- [x] T6. **пауза регистрации, BFF (red→green)** — `route.ts` пока не имеет
      теста вовсе (в отличие от плана — файла `route.test.ts` нет). Создать
      `app/api/auth/register/route.test.ts` с нуля (мокировать
      `@/lib/grpc/client`/`@/lib/session/cookies`/`@/lib/grpc/serialize`, как
      сосед `app/api/auth/profile/route.test.ts`): счастливый путь (флаги
      выключены → `authClient.register` вызывается, как сегодня) +
      `REGISTRATION_DISABLED=true` → `403`, `authClient.register` не вызван;
      `PREPROD_MODE=true` (без `REGISTRATION_DISABLED`) → тоже `403` (FR-4)
      → добавить проверку первой строкой в `route.ts`.
      → `tasks/T6-gate-register-route.md`

## Гейт публичных страниц

**Найден готовый прецедент** — `app/(admin)/layout.tsx` (спека 0023) уже
делает ровно `if (!user) redirect("/login")` для гостя. Этот приём
переиспользуется дословно для `/about` и `/nominations/[id]`; для `/` он
зациклился бы (`/login` сам делает `router.replace("/")`) — там нужен
гейт-виджет на месте, без редиректа (см. `plan.md`, «Гейт публичных
страниц»).

- [x] T7. **виджет для главной (red→green)** —
      `widgets/preprod-gate/preprod-gate-screen.test.tsx`: рендер зовёт
      `useAuthDialogStore.getState().open("login")` (мок стора), показывает
      текст приглашения → `widgets/preprod-gate/preprod-gate-screen.tsx`
      (плоско, без `ui/`-подпапки — как остальные виджеты проекта, напр.
      `widgets/session-expired/session-expired-dialog.tsx`).
      → `tasks/T7-preprod-gate-widget.md`
- [ ] T8. **страницы**: → `tasks/T8a-gate-home-page.md` (главная, рендер
      на месте), `tasks/T8b-gate-about-and-nomination-pages.md` (`/about` +
      `/nominations/[id]`, редирект)
      - `app/page.tsx` — добавить ветвление `isPreprodModeEnabled() &&
        !currentUser` → `<PreprodGateScreen />` вместо обычного виджета
        (`currentUser` уже вычисляется).
      - `app/nominations/[id]/page.tsx` — добавить `import { redirect } from
        "next/navigation"` (если ещё не импортирован) и
        `if (isPreprodModeEnabled() && !currentUser) redirect("/login");`
        сразу после существующего `getCurrentUser()` — дословно приём
        `app/(admin)/layout.tsx`.
      - `app/about/page.tsx` — добавить вызов `getCurrentUser()` (сейчас не
        вызывается) и тот же `redirect("/login")`.
      Тесты — на уровне существующих page-тестов, если есть, иначе смоук T13
      (страничных unit-тестов для этих трёх page.tsx в проекте сегодня нет —
      мирроринг `app/(admin)/layout.test.tsx` возможен, но не обязателен,
      решает исполнитель по месту).

## Пауза регистрации, UI

- [ ] T9. **AuthDialog (red→green)** —
      `features/auth/ui/auth-dialog.test.tsx`: расширить кейсом
      `registrationDisabled=true` → таб «Регистрация» рендерит сообщение о
      паузе вместо `<AuthForm mode="register">` → добавить проп
      `registrationDisabled` и ветвление в `auth-dialog.tsx`.
      → `tasks/T9-auth-dialog-registration-disabled.md`
- [ ] T10. **layout wiring** — `app/layout.tsx`: вычислить
      `isRegistrationDisabled()` и передать пропом в `<AuthDialog>`.
      → `tasks/T10-layout-wiring.md`

## Проверка

- [ ] T11. `make test-web` зелёный (весь новый и расширенный набор из
      T2–T10).
- [ ] T12. `pnpm exec tsc --noEmit`.
- [ ] T13. Ручной смоук (`make dev`, `PREPROD_MODE=true` в `.env`): гость на
      `/`, `/about`, `/nominations/[id]` видит гейт-экран с открытым
      диалогом входа; логин снимает гейт без навигации, без цикла через
      `/login`; `curl` на любую из 13 гейтованных BFF-ручек без cookie —
      `401`. Затем `PREPROD_MODE=` (выкл), `REGISTRATION_DISABLED=true`:
      сайт виден гостю как обычно, `/register` показывает сообщение о
      паузе, `curl -X POST /api/auth/register` — `403`.
- [ ] T14. Обновить статус спеки/плана/индекс в `docs/specs/README.md`
      (`draft` → `done`).
