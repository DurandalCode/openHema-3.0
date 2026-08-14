import { describe, expect, it } from "vitest";
import { tournamentErrorMessage } from "./errors";

// spec 0029, обзор п.3 / AC-9: отказ сервера переводится по HTTP-статусу,
// а не по тексту — `tournament: invalid input` (английская строка Go-домена)
// не должна попадать пользователю на экран.
describe("features/tournament-settings/api/errors tournamentErrorMessage (spec 0029, AC-9)", () => {
  it("explains title/date validation on 400", () => {
    const message = tournamentErrorMessage("tournament: invalid input", 400);
    expect(message).not.toContain("tournament: invalid input");
    expect(message).toContain("название");
    expect(message).toMatch(/дат/);
  });

  it('returns "Недостаточно прав" on 401', () => {
    expect(tournamentErrorMessage("unauthenticated", 401)).toBe("Недостаточно прав");
  });

  it('returns "Недостаточно прав" on 403', () => {
    expect(tournamentErrorMessage("permission denied", 403)).toBe("Недостаточно прав");
  });

  it("returns a general message on other statuses, without the raw server string", () => {
    const message = tournamentErrorMessage("internal error: boom", 500);
    expect(message).not.toContain("internal error: boom");
    expect(message.length).toBeGreaterThan(0);
  });

  it("returns a general message when status is missing/0 (network failure)", () => {
    const message = tournamentErrorMessage("Сеть недоступна", 0);
    expect(message.length).toBeGreaterThan(0);
  });
});
