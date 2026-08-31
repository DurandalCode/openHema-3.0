import { afterEach, describe, expect, it } from "vitest";
import { isPreprodModeEnabled, isRegistrationDisabled } from "./preprod";

function restoreEnv(name: string, original: string | undefined) {
  if (original === undefined) delete process.env[name];
  else process.env[name] = original;
}

describe("isPreprodModeEnabled", () => {
  const original = process.env.PREPROD_MODE;

  afterEach(() => restoreEnv("PREPROD_MODE", original));

  it("returns false when PREPROD_MODE is unset", () => {
    delete process.env.PREPROD_MODE;
    expect(isPreprodModeEnabled()).toBe(false);
  });

  it('returns true only for the exact string "true"', () => {
    process.env.PREPROD_MODE = "true";
    expect(isPreprodModeEnabled()).toBe(true);
  });

  it("returns false for any other non-empty value", () => {
    process.env.PREPROD_MODE = "1";
    expect(isPreprodModeEnabled()).toBe(false);
    process.env.PREPROD_MODE = "TRUE";
    expect(isPreprodModeEnabled()).toBe(false);
  });
});

describe("isRegistrationDisabled", () => {
  const original = process.env.REGISTRATION_DISABLED;

  afterEach(() => restoreEnv("REGISTRATION_DISABLED", original));

  it("returns false when REGISTRATION_DISABLED is unset", () => {
    delete process.env.REGISTRATION_DISABLED;
    expect(isRegistrationDisabled()).toBe(false);
  });

  it('returns true only for the exact string "true"', () => {
    process.env.REGISTRATION_DISABLED = "true";
    expect(isRegistrationDisabled()).toBe(true);
  });

  it("returns false for any other non-empty value", () => {
    process.env.REGISTRATION_DISABLED = "1";
    expect(isRegistrationDisabled()).toBe(false);
    process.env.REGISTRATION_DISABLED = "TRUE";
    expect(isRegistrationDisabled()).toBe(false);
  });
});
