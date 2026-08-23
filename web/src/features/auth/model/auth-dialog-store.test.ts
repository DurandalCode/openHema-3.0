import { beforeEach, describe, expect, it } from "vitest";

import { useAuthDialogStore } from "./auth-dialog-store";

describe("features/auth/model/auth-dialog-store", () => {
  beforeEach(() => {
    useAuthDialogStore.setState({
      isOpen: false,
      mode: "login",
      returnTo: undefined,
    });
  });

  it("has initial state: closed, login mode", () => {
    const state = useAuthDialogStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.mode).toBe("login");
  });

  it("open(mode) sets isOpen=true and mode", () => {
    useAuthDialogStore.getState().open("register");

    const state = useAuthDialogStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.mode).toBe("register");
  });

  it("open(mode) accepts a reset mode", () => {
    useAuthDialogStore.getState().open("reset");

    const state = useAuthDialogStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.mode).toBe("reset");
  });

  it("open(mode, returnTo) sets returnTo; open(mode) leaves it undefined", () => {
    useAuthDialogStore.getState().open("login", "/nominations/n1/apply");

    expect(useAuthDialogStore.getState().returnTo).toBe(
      "/nominations/n1/apply",
    );

    useAuthDialogStore.getState().open("login");

    expect(useAuthDialogStore.getState().returnTo).toBeUndefined();
  });

  it("open(login) sets mode to login", () => {
    useAuthDialogStore.getState().open("register");
    useAuthDialogStore.getState().open("login");

    expect(useAuthDialogStore.getState().mode).toBe("login");
    expect(useAuthDialogStore.getState().isOpen).toBe(true);
  });

  it("close() sets isOpen=false, preserves mode", () => {
    useAuthDialogStore.getState().open("register");
    useAuthDialogStore.getState().close();

    const state = useAuthDialogStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.mode).toBe("register");
  });

  it("setMode(mode) changes mode without opening", () => {
    useAuthDialogStore.getState().setMode("register");

    const state = useAuthDialogStore.getState();
    expect(state.mode).toBe("register");
    expect(state.isOpen).toBe(false);
  });
});
