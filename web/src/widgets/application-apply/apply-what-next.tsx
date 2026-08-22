import { Col } from "@/shared/ui/stack";
import { applicationFunnel } from "@/entities/application/lib/state";

/**
 * ApplyWhatNext — блок «Что дальше» рядом с формой подачи (спека 0036,
 * FR-4): порядок состояний happy path заявки (`applicationFunnel`, тот же
 * источник подписей, что список «Мои заявки» — не второй набор строк) и
 * правило отзыва до регистрации. Чистый презентационный компонент, без
 * хуков и данных.
 */
export function ApplyWhatNext() {
  const funnel = applicationFunnel();

  return (
    <Col gap={4} className="rounded-lg border border-border bg-surface-raised p-4">
      <h2 className="text-sm font-semibold text-foreground">Что дальше</h2>
      <ol className="flex flex-col gap-2">
        {funnel.map((step, i) => (
          <li key={step.label} className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs text-caption-foreground">{i + 1}.</span>
            {step.label}
          </li>
        ))}
      </ol>
      <p className="text-xs text-caption-foreground">
        Оплату отмечаете вы сами, подтверждает секретарь. Отозвать заявку можно до регистрации —
        после этого отзыв недоступен.
      </p>
    </Col>
  );
}
