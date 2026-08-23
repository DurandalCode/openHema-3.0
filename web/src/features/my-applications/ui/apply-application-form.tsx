"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Col } from "@/shared/ui/stack";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import { useSubmitApplication } from "@/features/my-applications/api/use-submit-application";
import { applicationErrorMessage } from "@/features/my-applications/api/errors";
import { ApplicationRequestError } from "@/features/my-applications/api/mutation-error";
import { clearDraft, loadDraft, saveDraft } from "@/features/my-applications/model/apply-draft";
import { UnauthorizedError } from "@/shared/api/unauthorized";

type ApplyDraft = { club: string; needsEquipment: boolean };

/**
 * ApplyApplicationForm — форма подачи заявки на экране «Заявка на участие»
 * (спека 0036, FR-3/FR-5/FR-6, AC-3/AC-6). Ровно два поля домена (0006):
 * клуб — явно подписан как необязательный — и признак «нужна экипировка».
 * Контролируемая: значения полей не сбрасываются ни при успехе (страница
 * всё равно уходит на «Мои заявки»), ни при отказе (AC-6 — можно
 * поправить и повторить без повторного набора).
 *
 * Успех — тост + переход на «Мои заявки» (FR-5). Отказ — тост с русским
 * текстом причины через `applicationErrorMessage` (FR-6); поля остаются
 * заполненными.
 *
 * Черновик (спека 0038, FR-19..FR-21): при монтировании поля
 * инициализируются сохранённым в `localStorage` черновиком той же
 * номинации (если он есть), а каждое изменение полей тут же перезаписывает
 * его — без дебаунса. Полей всего два (текст + чекбокс), запись —
 * синхронный `setItem` с парой байт JSON, поэтому дебаунс здесь был бы
 * сложностью без измеримой пользы; если поля формы вырастут, к вопросу
 * стоит вернуться. После успешной подачи черновик очищается (FR-21).
 */
export function ApplyApplicationForm({ nominationId }: { nominationId: string }) {
  const router = useRouter();
  const submit = useSubmitApplication();
  const [club, setClub] = useState("");
  const [needsEquipment, setNeedsEquipment] = useState(false);

  useEffect(() => {
    const draft = loadDraft<ApplyDraft>(nominationId);
    if (draft) {
      setClub(draft.club);
      setNeedsEquipment(draft.needsEquipment);
    }
  }, [nominationId]);

  function updateClub(value: string) {
    setClub(value);
    saveDraft<ApplyDraft>(nominationId, { club: value, needsEquipment });
  }

  function updateNeedsEquipment(value: boolean) {
    setNeedsEquipment(value);
    saveDraft<ApplyDraft>(nominationId, { club, needsEquipment: value });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit.mutate(
      { nominationId, club, needsEquipment },
      {
        onSuccess: () => {
          clearDraft(nominationId);
          toastSuccess("Заявка подана");
          router.push("/applications");
        },
        onError: (error) => {
          // UnauthorizedError уже поднимает «Сессия истекла»
          // (widgets/session-expired, глобальный MutationCache.onError) —
          // тост поверх нёс бы дублирующее и более общее сообщение
          // (спека 0038, FR-18/AC-10).
          if (error instanceof UnauthorizedError) return;
          const status = error instanceof ApplicationRequestError ? error.status : undefined;
          toastError(applicationErrorMessage(error.message, status));
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Col gap={4} className="items-start">
        <Col gap={2} className="w-full">
          <Label htmlFor="apply-club">Клуб — опционально</Label>
          <Input
            id="apply-club"
            placeholder="Клуб"
            value={club}
            onChange={(e) => updateClub(e.target.value)}
          />
        </Col>
        <Label className="flex items-center gap-2 font-normal normal-case">
          <Checkbox
            checked={needsEquipment}
            onCheckedChange={(checked) => updateNeedsEquipment(checked === true)}
          />
          Нужна экипировка от организатора
        </Label>
        <Button type="submit" loading={submit.isPending}>
          Подать заявку
        </Button>
      </Col>
    </form>
  );
}
