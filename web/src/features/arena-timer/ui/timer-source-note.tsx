import type { ScoreboardRoomDto } from "@/entities/arena-live/lib/types";

/**
 * TimerSourceNote — подпись «таймер идёт на этом экране», когда источником
 * стала сама панель управления, потому что табло арены не открыто (спека
 * 0015, уточнение ADR 0013 §1/§4).
 *
 * Условие — пара `scoreboardCount === 0 && thisIsSource`: именно её сервер
 * выставляет панели-фоллбэку. До первого живого кадра снапшот-заглушка даёт
 * `{0, false}`, так что ложной тревоги на старте не будет.
 *
 * Зачем подпись вообще: без табло отсчёт живёт только в этой вкладке — её
 * нельзя закрывать, и зрители в зале ничего не видят. Раньше эта же ситуация
 * молча ломала кнопки таймера (команды улетали в никуда), и секретарь не мог
 * понять, что происходит.
 */
export function TimerSourceNote({ room }: { room: ScoreboardRoomDto | null | undefined }) {
  if (!room || room.scoreboardCount !== 0 || !room.thisIsSource) return null;

  return (
    <span className="text-sm text-warning">Табло не подключено — время идёт на этом экране</span>
  );
}
