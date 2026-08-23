// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthForm } from "./auth-form";

const loginMutate = vi.fn();
const registerMutate = vi.fn();

let loginState: { isPending: boolean; error: Error | null } = {
  isPending: false,
  error: null,
};
let registerState: { isPending: boolean; error: Error | null } = {
  isPending: false,
  error: null,
};

vi.mock("../api/use-login", () => ({
  useLogin: () => ({ mutate: loginMutate, ...loginState }),
}));

vi.mock("../api/use-register", () => ({
  useRegister: () => ({ mutate: registerMutate, ...registerState }),
}));

describe("features/auth/ui/AuthForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loginState = { isPending: false, error: null };
    registerState = { isPending: false, error: null };
  });

  afterEach(() => {
    cleanup();
  });

  it("login mode: submit button reads 'Войти' when idle", () => {
    render(<AuthForm mode="login" onSuccess={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
  });

  it("login mode: submit button reads 'Входим…' and is disabled while pending (FR-4)", () => {
    loginState = { isPending: true, error: null };
    render(<AuthForm mode="login" onSuccess={vi.fn()} />);

    const button = screen.getByRole("button", { name: /Входим…/ });
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it("register mode: submit button reads 'Зарегистрироваться' when idle", () => {
    render(<AuthForm mode="register" onSuccess={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Зарегистрироваться" }),
    ).toBeInTheDocument();
  });

  it("register mode: submit button reads 'Создаём аккаунт…' while pending (FR-4)", () => {
    registerState = { isPending: true, error: null };
    render(<AuthForm mode="register" onSuccess={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /Создаём аккаунт…/ }),
    ).toBeInTheDocument();
  });

  it("shows the login error next to the form and keeps the typed email (FR-3, AC-2)", () => {
    loginState = { isPending: false, error: new Error("Неверный email или пароль") };
    render(<AuthForm mode="login" onSuccess={vi.fn()} />);

    const email = screen.getByLabelText("Email");
    fireEvent.change(email, { target: { value: "ivan@example.com" } });

    expect(screen.getByText("Неверный email или пароль")).toBeInTheDocument();
    expect(email).toHaveValue("ivan@example.com");
  });

  it("register mode: name field has a caption about being seen on the bracket/scoreboard (FR-5)", () => {
    render(<AuthForm mode="register" onSuccess={vi.fn()} />);
    expect(
      screen.getByText(/так вас увидят в сетке и на табло/i),
    ).toBeInTheDocument();
  });

  it("register mode: shows a note that an account is not a fighter yet (FR-5)", () => {
    render(<AuthForm mode="register" onSuccess={vi.fn()} />);
    expect(screen.getByText(/бойцом/i)).toBeInTheDocument();
  });

  it("register mode: blocks submit with a short password and shows the length hint (AC-3)", () => {
    render(<AuthForm mode="register" onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "Иван" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ivan@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "short1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Зарегистрироваться" }),
    );

    expect(registerMutate).not.toHaveBeenCalled();
    expect(screen.getByText("не меньше 8 символов")).toBeInTheDocument();
  });

  it("register mode: submits when password reaches the minimum length", () => {
    render(<AuthForm mode="register" onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "Иван" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ivan@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "longenough1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Зарегистрироваться" }),
    );

    expect(registerMutate).toHaveBeenCalledWith({
      email: "ivan@example.com",
      password: "longenough1",
      displayName: "Иван",
    });
  });

  it("login mode: does not apply the password-length gate (no register field there)", () => {
    render(<AuthForm mode="login" onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ivan@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect(loginMutate).toHaveBeenCalledWith({
      email: "ivan@example.com",
      password: "short",
    });
  });
});
