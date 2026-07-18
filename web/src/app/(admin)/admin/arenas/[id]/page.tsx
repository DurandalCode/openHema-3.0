import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import { getArena } from "@/entities/arena/model/get-arena";
import { arenaStatusLabel } from "@/entities/arena/lib/types";
import { PoolSeating } from "@/features/pool-seating/ui/pool-seating";
import { AdminHeader } from "../../admin-header";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

/**
 * /admin/arenas/[id] — стабильный URL страницы управления площадкой (FR-9).
 * Серверный компонент: SSR `getArena` по id; показывает реквизиты площадки
 * (имя, описание, статус) и секцию постановки/снятия пула (спека 0011,
 * FR-9): виджет `PoolSeating` (клиентский, TanStack Query) поверх
 * `/api/arenas/[id]/pools`. Идентификатор = id (uuid), поэтому URL не
 * рвётся при переименовании и архивации (FR-8) без дополнительной логики.
 *
 * Ход боя (текущий бой, результат) — вне скоупа 0011, будущий инкремент.
 */
export default async function AdminArenaPage({ params }: PageProps) {
  const { id } = await params;
  const arena = await getArena(id);
  if (!arena) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <AdminHeader title={arena.name || "Площадка"} description="Страница управления площадкой" />

      <div className="mt-8">
        <Card>
          <CardHeader>
            <Row align="center" justify="between" gap={4}>
              <Col gap={1}>
                <CardTitle>{arena.name}</CardTitle>
                <CardDescription>
                  Статус: {arenaStatusLabel(arena.status)}
                </CardDescription>
              </Col>
              <Button variant="outline" asChild>
                <Link href="/admin/arenas">← Все площадки</Link>
              </Button>
            </Row>
          </CardHeader>
          <CardContent>
            <Col gap={4}>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Описание / локация</p>
                <p className="mt-1">{arena.description || "—"}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Порядок</p>
                  <p className="mt-1">{arena.position}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">ID (стабильный URL)</p>
                  <p className="mt-1 truncate font-mono text-xs">{arena.id}</p>
                </div>
              </div>
            </Col>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Постановка пула на арену</CardTitle>
            <CardDescription>
              Пул, готовящийся к запуску на этой площадке — с составом и
              боями по порядку, либо список готовых пулов для постановки
              (спека 0011, FR-9). Сам ход боя — будущий инкремент.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PoolSeating arenaId={arena.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}