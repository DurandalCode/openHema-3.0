/**
 * CurrentUser — публичное представление пользователя для UI.
 * Сериализуемая форма (без bigint/Date), безопасна для передачи из server
 * component в client component через props и для рендера.
 *
 * Соответствует proto `hema.v1.User`, но `created_at` (google.protobuf.Timestamp)
 * приведён к ISO-строке, а `role` — к строковому литералу.
 */
export type Role = "ROLE_UNSPECIFIED" | "ROLE_USER" | "ROLE_ADMIN";

// NotificationSettings — переключатели видов почтовых уведомлений (спека
// 0042). Одна форма для личных настроек учётки (User.notifications) и
// глобальных настроек турнира (Tournament.notifications, entities/tournament)
// — виды совпадают, письмо уходит только когда оба уровня разрешают один и
// тот же вид (FR-21).
export type NotificationSettings = {
  applicationState: boolean;
  poolSeated: boolean;
};

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: string;
  // club — клуб пользователя (данные учётки, не бойца: спеки 0007/0026
  // связь учётка↔боец не восстанавливают). Опционально, "" — «не указан»
  // (spec 0037, FR-13/FR-15).
  club: string;
  // emailVerified — подтверждён ли текущий адрес (спека 0042, FR-1).
  emailVerified: boolean;
  // pendingEmail — новый адрес, ожидающий подтверждения по ссылке из
  // письма (FR-6). "" — запроса смены нет.
  pendingEmail: string;
  // notifications — личные переключатели уведомлений (FR-20). Оба
  // выключены по умолчанию.
  notifications: NotificationSettings;
};

// Session — одна выданная refresh-сессия пользователя (спека 0042, ADR
// 0018, FR-11). Без устройства/браузера/IP (решение 2 спеки) — только
// времена.
export type Session = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};
