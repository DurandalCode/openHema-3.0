/**
 * CurrentUser — публичное представление пользователя для UI.
 * Сериализуемая форма (без bigint/Date), безопасна для передачи из server
 * component в client component через props и для рендера.
 *
 * Соответствует proto `hema.v1.User`, но `created_at` (google.protobuf.Timestamp)
 * приведён к ISO-строке.
 */
export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
};
