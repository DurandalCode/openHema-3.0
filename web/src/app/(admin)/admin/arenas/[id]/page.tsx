import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import { getArena } from "@/entities/arena/model/get-arena";
import { arenaStatusLabel } from "@/entities/arena/lib/types";
import { AdminHeader } from "../../admin-header";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

/**
 * /admin/arenas/[id] — стабильный URL страницы управления площадкой (FR-9).
 * Серверный компонент: SSR `getArena` по id; показывает реквизиты площадки
 * (имя, описание, статус) и плейсхолдер-секцию «Управление боями появится
 * позже». Идентификатор = id (uuid), поэтому URL не рвётся при переименовании
 * и архивации (FR-8) без дополнительной логики.
 *
 * Каркас: бои наполнят эту страницу отдельной будущей фичей.
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
            <CardTitle>Управление боями</CardTitle>
            <CardDescription>
              Здесь появится управление боями этой площадки. Бои наполнят
              эту страницу отдельной будущей фичей — пока площадка лишь
              предоставляет стабильный URL (FR-9).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Пока нет боёв.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}