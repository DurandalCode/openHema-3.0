"use client";

import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { Row } from "@/shared/ui/stack";
import { findActiveApplication, stateLabel } from "@/entities/application/lib/state";
import type { Nomination } from "@/entities/nomination/lib/types";
import { useMyApplications } from "@/features/my-applications/api/use-my-applications";

/**
 * NominationApplyCta — точка входа в подачу заявки на публичной странице
 * номинации (спека 0036, FR-10..FR-12, FR-14, AC-2/AC-5).
 *
 * - Гость (`!isAuthenticated`) не видит блок вовсе — ничего не рендерится
 *   (FR-14, «Принятые решения» п.2).
 * - Приём закрыт — только подпись «Приём заявок завершён» (FR-12,
 *   формулировка совпадает с карточкой номинации на главной).
 * - Приём открыт и у пользователя уже есть нетерминальная заявка в эту
 *   номинацию — вместо кнопки показывается её текущее состояние и ссылка
 *   «Мои заявки» (FR-11) — подать вторую заявку нельзя.
 * - Иначе — кнопка-ссылка «Подать заявку» на форму подачи (FR-10).
 *
 * Пока список заявок ещё грузится, ничего не показываем — кнопка/состояние
 * появятся сразу с верным вариантом после загрузки, без мигания.
 *
 * Запрос списка заявок гейтится `enabled: isAuthenticated` — без гейта
 * гость получал бы гарантированный 401 на каждый визит публичной страницы
 * номинации (хук всё равно вызывается на каждый рендер, как того требуют
 * правила хуков, но саму сетевую заявку TanStack Query не отправляет).
 */
export function NominationApplyCta({
  nomination,
  isAuthenticated,
}: {
  nomination: Nomination;
  isAuthenticated: boolean;
}) {
  const { data: applications, isLoading } = useMyApplications({ enabled: isAuthenticated });

  if (!isAuthenticated) return null;

  if (nomination.status !== "NOMINATION_STATUS_OPEN") {
    return <p className="text-sm text-muted-foreground">Приём заявок завершён</p>;
  }

  if (isLoading || !applications) return null;

  const active = findActiveApplication(applications, nomination.id);

  if (active) {
    return (
      <Row align="center" gap={2} className="text-sm">
        <span>{stateLabel(active.state)}</span>
        <Link href="/applications" className="underline underline-offset-2 hover:text-foreground">
          Мои заявки
        </Link>
      </Row>
    );
  }

  return (
    <Button asChild>
      <Link href={`/nominations/${nomination.id}/apply`}>Подать заявку</Link>
    </Button>
  );
}
