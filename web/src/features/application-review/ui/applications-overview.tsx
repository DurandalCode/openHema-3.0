"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { cn } from "@/shared/lib/cn";
import { Col, Row } from "@/shared/ui/stack";
import { Input } from "@/shared/ui/input";
import { allowedSecretaryActions, stateLabel } from "@/entities/application/lib/state";
import type { Application, ApplicationState } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { useApplicationsOverview } from "../api/use-applications-overview";
import { useConfirmPayment } from "../api/use-confirm-payment";
import { useRegisterFighter } from "../api/use-register-fighter";
import { EditApplicationDialog } from "./edit-application-dialog";

const STATUS_OPTIONS: ApplicationState[] = [
  "APPLICATION_STATE_SUBMITTED",
  "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION",
  "APPLICATION_STATE_PAID",
  "APPLICATION_STATE_REGISTERED",
  "APPLICATION_STATE_WITHDRAWN",
];

/**
 * ApplicationsOverview — сводный экран заявок турнира (admin): квик-фильтры
 * бейджами по статусу и номинации (FR-14), оба множественного выбора
 * (мульти-select внутри группы, И между группами). Фильтрация — на клиенте
 * поверх одного запроса без фильтров: список admin-экрана не настолько велик,
 * чтобы платить лишний round-trip за каждый клик по бейджу. Используется и
 * как общий обзор, и как «заявки одной номинации» (initialNominationId
 * предвыбирает бейдж номинации).
 */
export function ApplicationsOverview({
  tournamentId,
  nominations,
  initialNominationId,
}: {
  tournamentId: string;
  nominations: Nomination[];
  initialNominationId?: string;
}) {
  const [statuses, setStatuses] = useState<Set<ApplicationState>>(new Set());
  const [nominationIds, setNominationIds] = useState<Set<string>>(
    () => new Set(initialNominationId ? [initialNominationId] : []),
  );
  const [search, setSearch] = useState("");
  const [needsEquipmentOnly, setNeedsEquipmentOnly] = useState(false);

  const { data: applications = [], isLoading } = useApplicationsOverview(tournamentId, {});

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return applications.filter((app) => {
      if (statuses.size > 0 && !statuses.has(app.state)) return false;
      if (nominationIds.size > 0 && !nominationIds.has(app.nominationId)) return false;
      if (needsEquipmentOnly && !app.needsEquipment) return false;
      if (
        query &&
        !app.applicantDisplayName.toLowerCase().includes(query) &&
        !app.club.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [applications, statuses, nominationIds, needsEquipmentOnly, search]);

  const hasFilters =
    statuses.size > 0 || nominationIds.size > 0 || needsEquipmentOnly || search.trim().length > 0;
  const nominationTitle = (id: string) => nominations.find((n) => n.id === id)?.title ?? id;

  return (
    <Col gap={6}>
      <Col gap={3}>
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени или клубу"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Row gap={2} wrap>
          {STATUS_OPTIONS.map((s) => (
            <FilterBadge
              key={s}
              active={statuses.has(s)}
              onClick={() => setStatuses((prev) => toggled(prev, s))}
            >
              {stateLabel(s)}
            </FilterBadge>
          ))}
          <FilterBadge
            active={needsEquipmentOnly}
            onClick={() => setNeedsEquipmentOnly((prev) => !prev)}
          >
            Нужна экипировка
          </FilterBadge>
        </Row>
        {nominations.length > 0 && (
          <Row gap={2} wrap>
            {nominations.map((n) => (
              <FilterBadge
                key={n.id}
                active={nominationIds.has(n.id)}
                onClick={() => setNominationIds((prev) => toggled(prev, n.id))}
              >
                {n.title}
              </FilterBadge>
            ))}
          </Row>
        )}
        {hasFilters && (
          <button
            type="button"
            className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              setStatuses(new Set());
              setNominationIds(new Set());
              setNeedsEquipmentOnly(false);
              setSearch("");
            }}
          >
            <X className="size-3" />
            Сбросить фильтры
          </button>
        )}
      </Col>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {hasFilters ? "Ничего не найдено по выбранным фильтрам." : "Заявок не найдено."}
        </p>
      ) : (
        <Col gap={3}>
          {filtered.map((app) => (
            <ApplicationReviewRow
              key={app.id}
              application={app}
              nominationTitle={nominationTitle(app.nominationId)}
              nominations={nominations}
            />
          ))}
        </Col>
      )}
    </Col>
  );
}

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

/** FilterBadge — кликабельный бейдж-чип квик-фильтра (мульти-select). */
function FilterBadge({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Badge asChild variant={active ? "default" : "outline"}>
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn("cursor-pointer select-none", !active && "hover:bg-accent")}
      >
        {children}
      </button>
    </Badge>
  );
}

function ApplicationReviewRow({
  application,
  nominationTitle,
  nominations,
}: {
  application: Application;
  nominationTitle: string;
  nominations: Nomination[];
}) {
  const confirm = useConfirmPayment();
  const register = useRegisterFighter();
  const actions = allowedSecretaryActions(application.state);
  const error = confirm.error?.message ?? register.error?.message ?? null;
  const warning = register.data?.capacityExceeded
    ? "Номинация переполнена (лимит превышен) — регистрация всё равно выполнена."
    : null;
  const details = [
    application.club && `Клуб: ${application.club}`,
    application.needsEquipment && "нужна экипировка",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card>
      <CardContent className="pt-6">
        <Row align="center" justify="between" gap={4} wrap>
          <Col gap={1}>
            <span className="font-medium">{application.applicantDisplayName || "—"}</span>
            <span className="text-xs text-muted-foreground">{nominationTitle}</span>
            {details && <span className="text-xs text-muted-foreground">{details}</span>}
          </Col>
          <Row align="center" gap={2}>
            <Badge variant="outline">{stateLabel(application.state)}</Badge>
            <EditApplicationDialog application={application} nominations={nominations} />
            {actions.includes("confirmPayment") && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={confirm.isPending}
                onClick={() => confirm.mutate(application.id)}
              >
                Подтвердить оплату
              </Button>
            )}
            {actions.includes("register") && (
              <Button
                type="button"
                size="sm"
                loading={register.isPending}
                onClick={() => register.mutate(application.id)}
              >
                Зарегистрировать
              </Button>
            )}
          </Row>
        </Row>
        {warning && (
          <Alert className="mt-3">
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
