import { ResetPasswordScreen } from "@/widgets/reset-password/reset-password-screen";

export const runtime = "nodejs";

type PageProps = { searchParams: Promise<{ token?: string }> };

/**
 * /reset-password — публичная страница установки нового пароля по ссылке
 * из письма восстановления (spec 0038, FR-9). Сервер письма (0037) жёстко
 * формирует именно этот адрес — `/reset-password?token=...` — и это
 * самостоятельная страница, НЕ deep-link группы `(auth)`: она не открывает
 * AuthDialog, а рендерит собственный экран. Отсутствующий/пустой `token`
 * тоже отдаётся дальше — экран сам показывает единый отказ (FR-13).
 */
export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  return <ResetPasswordScreen token={token ?? ""} />;
}
