"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { useUnsavedGuardStore } from "@/shared/lib/unsaved-guard-store";

function isModifiedClick(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

function isExternalHref(href: string): boolean {
  try {
    return new URL(href, window.location.origin).origin !== window.location.origin;
  } catch {
    // href нельзя разобрать как URL (например, относительный путь без
    // схемы уже обработан выше базой window.location.origin) — считаем
    // внутренним по умолчанию, а не блокируем переход из-за парсинга.
    return false;
  }
}

/**
 * UnsavedGuardDialog — сквозной перехватчик кликов по ссылкам, пока экран
 * грязный (спека 0039, блок C, FR-13, FR-14). Слушатель — на `document` в
 * capture-фазе (риск конфликта с чужими обработчиками сужен в plan.md:
 * только `a[href]`, только внутренние, без модификаторов, с явным
 * опт-аутом `data-unsaved-guard="ignore"`).
 *
 * `preventDefault()` на native-событии не останавливает распространение —
 * этого достаточно: `next/link` сам проверяет `e.defaultPrevented` перед
 * своей софт-навигацией и не переходит, если событие уже отменено.
 *
 * `beforeunload` (закрытие/перезагрузка вкладки) сюда не входит — его
 * вешает `useUnsavedGuard` на уровне самого экрана (T19), не диалог.
 *
 * Известное ограничение (см. `plan.md`, «Риски»): кнопка «назад» браузера
 * (`popstate`) не перехватывается — в установленной версии Next нет
 * `Link.onNavigate` (появился в 15.3) и нет надёжного способа отменить
 * `popstate`-навигацию App Router без ложных срабатываний. Осознанно вне
 * скоупа FR-14 (там «назад приложения» — это ссылки и кнопки самого
 * приложения).
 */
export function UnsavedGuardDialog() {
  const router = useRouter();
  const dirtyReason = useUnsavedGuardStore((s) => s.dirtyReason);
  const pendingHref = useUnsavedGuardStore((s) => s.pendingHref);
  const request = useUnsavedGuardStore((s) => s.request);
  const confirmLeave = useUnsavedGuardStore((s) => s.confirm);
  const cancel = useUnsavedGuardStore((s) => s.cancel);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (useUnsavedGuardStore.getState().dirtyReason === null) return;
      if (isModifiedClick(e)) return;

      const target = e.target as Element | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === "_blank") return;
      if (anchor.closest('[data-unsaved-guard="ignore"]')) return;

      const href = anchor.getAttribute("href") ?? "";
      if (isExternalHref(href)) return;

      e.preventDefault();
      request(href);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [request]);

  const open = dirtyReason !== null && pendingHref !== null;

  function handleLeave() {
    const href = pendingHref;
    confirmLeave();
    if (href) router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && cancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Несохранённые изменения</DialogTitle>
          <DialogDescription>
            Изменения в «{dirtyReason}» будут потеряны, если вы уйдёте сейчас.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={cancel}>
            Остаться
          </Button>
          <Button variant="destructive" onClick={handleLeave}>
            Уйти без сохранения
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
