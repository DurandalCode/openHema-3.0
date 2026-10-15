import { beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.fn();
let forwardedProto: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({ set }),
  headers: async () => ({
    get: (name: string) => (name === "x-forwarded-proto" ? forwardedProto : null),
  }),
}));

import { setSessionCookies } from "./cookies";

function secureFlags(): boolean[] {
  return set.mock.calls.map((call) => call[2].secure);
}

describe("setSessionCookies", () => {
  beforeEach(() => {
    set.mockReset();
    forwardedProto = null;
  });

  it("marks cookies secure when the request came over https", async () => {
    forwardedProto = "https";
    await setSessionCookies("a", "r");
    expect(secureFlags()).toEqual([true, true]);
  });

  it("drops the secure flag for plain http (LAN access by IP)", async () => {
    forwardedProto = "http";
    await setSessionCookies("a", "r");
    expect(secureFlags()).toEqual([false, false]);
  });

  it("takes the first hop of a proxy chain", async () => {
    forwardedProto = "https, http";
    await setSessionCookies("a", "r");
    expect(secureFlags()).toEqual([true, true]);
  });
});
