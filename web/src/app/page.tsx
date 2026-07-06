import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: 24 }}>
      <h1>HEMA Tournament</h1>
      <p>Стартовый каркас. Авторизация подключена.</p>
      <nav style={{ display: "flex", gap: 16, marginTop: 24 }}>
        <Link href="/login">Войти</Link>
        <Link href="/register">Регистрация</Link>
        <Link href="/dashboard">Кабинет</Link>
      </nav>
    </main>
  );
}
