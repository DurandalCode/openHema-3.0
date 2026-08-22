/**
 * CurrentUser — публичное представление пользователя для UI.
 * Сериализуемая форма (без bigint/Date), безопасна для передачи из server
 * component в client component через props и для рендера.
 *
 * Соответствует proto `hema.v1.User`, но `created_at` (google.protobuf.Timestamp)
 * приведён к ISO-строке, а `role` — к строковому литералу.
 */
export type Role = "ROLE_UNSPECIFIED" | "ROLE_USER" | "ROLE_ADMIN";

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
};
