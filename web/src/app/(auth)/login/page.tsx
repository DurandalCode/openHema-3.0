import { AuthForm } from "../auth-form";

export default function LoginPage() {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: 24 }}>
      <AuthForm mode="login" />
    </main>
  );
}
