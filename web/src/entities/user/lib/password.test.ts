import { describe, expect, it } from "vitest";

import { MIN_PASSWORD_LEN, passwordHint } from "./password";

describe("entities/user/lib/password", () => {
  it("MIN_PASSWORD_LEN mirrors server policy (0037, FR-11)", () => {
    expect(MIN_PASSWORD_LEN).toBe(8);
  });

  describe("passwordHint", () => {
    it("empty value: level 0, not ok, hint text shown", () => {
      const hint = passwordHint("");
      expect(hint).toEqual({ level: 0, ok: false, text: "не меньше 8 символов" });
    });

    it("short value (<8): level 1, not ok, hint text shown", () => {
      const hint = passwordHint("abc123");
      expect(hint).toEqual({ level: 1, ok: false, text: "не меньше 8 символов" });
    });

    it("value of exactly MIN_PASSWORD_LEN: level 2, ok, no text", () => {
      const hint = passwordHint("12345678");
      expect(hint).toEqual({ level: 2, ok: true, text: "" });
    });

    it("value longer than MIN_PASSWORD_LEN: level 2, ok, no text", () => {
      const hint = passwordHint("a very long password indeed");
      expect(hint).toEqual({ level: 2, ok: true, text: "" });
    });
  });
});
