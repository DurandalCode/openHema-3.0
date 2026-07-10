# Tasks: UI-flow — навигация, точки входа и цветовая идентичность

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-07-09
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Инкремент web-only (нет proto/server/BFF).
Порядок: токены/примитивы → чистая логика (TDD) → навигация → поток auth →
контент страниц → проверка. Где есть чистая логика — сначала падающий тест
(red), затем код (green), затем рефактор.

## Токены и примитивы дизайн-системы

- [x] T1. **Палитра** — `src/app/globals.css`: задать `--primary`/
      `--primary-foreground` в зелёный (обе темы), увязать `--ring`; добавить
      семантические `--gold`/`--gold-foreground` и зарегистрировать
      `--color-gold`/`--color-gold-foreground` в `@theme inline`. Не трогать
      `--accent`/`--destructive`. Проверить контраст в светлой/тёмной (FR-10..12).
- [x] T2. **Badge gold-вариант** — `src/shared/ui/badge.tsx`: добавить вариант
      `gold`/`accent` на новых токенах; не ломать существующие варианты.

## Чистая логика (TDD)

- [x] T3. **isActiveNavItem (red→green)** — `src/shared/lib/is-active-nav-item.ts`
      + `is-active-nav-item.test.ts`: сначала тесты (точное совпадение,
      вложенные роуты `/admin/tournament`→«Турнир», корень `/admin` не
      подсвечивает под-разделы, якоря), затем реализация.
- [x] T4. **site-config + инвариант** — `src/shared/config/site-config.ts` +
      обновить `site-config.test.ts`: новая форма `navItems` (секции главной
      `#tournament`/`#nominations` + роут `/about`); тип пункта поддерживает
      якорь и роут; тест «нет пунктов в никуда».

## Навигация

- [x] T5. **Меню профиля** — `src/widgets/navbar/user-menu.tsx`: добавить пункты
      «Кабинет» (`/dashboard`) и «Админка» (`/admin`, только для админа) рядом с
      «Выйти» (FR-2/AC-1).
- [x] T6. **Публичная навигация + активный пункт** — `src/widgets/navbar/navbar.tsx`
      (+ при необходимости клиентский `nav-links.tsx` с `usePathname`): рендер
      `navItems` с подсветкой активного (T3/T4), внутренние роуты через
      `next/link`; убрать «Админка» из общего ряда (переехала в меню аватара).
- [x] T7. **Под-навигация админки** — `src/app/(admin)/admin/layout.tsx` (новый)
      + `src/app/(admin)/admin/admin-nav.tsx` (client, `usePathname`): ряд/панель
      с пунктами Пользователи (`/admin`), Турнир (`/admin/tournament`),
      Номинации (`/admin/nominations`), + Создать админа (`/admin/create`),
      активный подсвечен (FR-3/FR-4/AC-3/AC-4). Не ломать серверный guard в
      `(admin)/layout.tsx`.
- [x] T8. **Чистка admin-actions** — `src/app/(admin)/admin/page.tsx` и
      под-страницы: убрать дублирующие кнопки навигации из `AdminHeader.actions`;
      упростить/убрать `backHref` (навигация теперь в под-навигации). Заголовки
      разделов сохранить.

## Поток аутентификации

- [x] T9. **Убрать редирект** — `src/features/auth/ui/auth-dialog.tsx`:
      `onSuccess` = `close()` + `router.refresh()` без `router.push("/dashboard")`
      (FR-6/AC-2). Проверить `(auth)/login` и `(auth)/register` — не уносят в
      кабинет.

## Контент страниц

- [x] T10. **Главная — про турнир** — `src/app/page.tsx`: убрать hero «о
      платформе» и кнопку «Перейти в кабинет»; вести с `TournamentHero` +
      `NominationsList`; решить судьбу гостевого `AuthCta` (лёгкий CTA или
      убрать). Пустые состояния как есть (FR-7/FR-9/AC-5).
- [x] T11. **Раздел «О платформе»** — `src/app/about/page.tsx` (новый, server):
      краткая заготовка о платформе (перенос слогана/описания с главной);
      пункт в `navItems` уже добавлен (T4) (FR-8/AC-6).
- [x] T12. **Золотые бейджи** — `src/widgets/tournament-hero/tournament-hero.tsx`
      и `src/widgets/nominations-list/nominations-list.tsx`: перевести бейджи
      «Активный турнир»/«Номинации» на gold-вариант (T2). Чистую логику
      (`formatEventRange`, `contactHref`) не трогать — тесты зелёные.

## Проверка

- [x] T13. `make test-web` зелёный (новые + существующие Vitest).
- [x] T14. `pnpm exec tsc --noEmit` — типизация проходит.
- [x] T15. `pnpm build` — сборка проходит.
- [x] T16. Ручная проверка в обеих темах: нет скрытых переходов (AC-7), логин без
      редиректа (AC-2), кабинет в меню (AC-1), под-навигация админки (AC-3/AC-4),
      главная про турнир (AC-5), «О платформе» (AC-6), палитра (AC-8),
      регрессий нет (AC-9).
- [x] T17. Обновить статус спеки/плана/tasks (`ready`→`done`) и строку в
      `docs/specs/README.md`.
