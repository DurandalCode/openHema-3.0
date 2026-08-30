import { describe, expect, it } from "vitest";
import {
  emptyForecast,
  formatForecastClock,
  formatForecastCountdown,
  formatForecastSummary,
} from "./forecast-time";

describe("forecast-time (спека 0043, ADR 0020)", () => {
  describe("formatForecastClock", () => {
    it("форматирует ISO-момент как часы:минуты", () => {
      const iso = new Date(2026, 7, 29, 11, 20, 0).toISOString();
      expect(formatForecastClock(iso)).toBe("11:20");
    });

    it("дополняет часы/минуты нулём слева", () => {
      const iso = new Date(2026, 7, 29, 9, 5, 0).toISOString();
      expect(formatForecastClock(iso)).toBe("09:05");
    });
  });

  describe("formatForecastCountdown", () => {
    it("«через ~N минут» с правильным склонением", () => {
      const now = new Date(2026, 7, 29, 11, 0, 0);
      const iso = new Date(2026, 7, 29, 11, 14, 0).toISOString();
      expect(formatForecastCountdown(iso, now)).toBe("через ~14 минут");
    });

    it("склонение «минуту» для 1 и «минуты» для 2-4", () => {
      const now = new Date(2026, 7, 29, 11, 0, 0);
      expect(formatForecastCountdown(new Date(2026, 7, 29, 11, 1, 0).toISOString(), now)).toBe(
        "через ~1 минуту",
      );
      expect(formatForecastCountdown(new Date(2026, 7, 29, 11, 3, 0).toISOString(), now)).toBe(
        "через ~3 минуты",
      );
    });

    it("не уходит в 0/отрицательное значение при малом остатке — минимум ~1 минута", () => {
      const now = new Date(2026, 7, 29, 11, 0, 0);
      const iso = new Date(2026, 7, 29, 11, 0, 20).toISOString(); // 20 секунд
      expect(formatForecastCountdown(iso, now)).toBe("через ~1 минуту");
    });
  });

  describe("formatForecastSummary — «вот-вот» вместо прошедшего времени (AC-4)", () => {
    it("imminent=true даёт «вот-вот», без часов и без счётчика", () => {
      const now = new Date(2026, 7, 29, 11, 0, 0);
      const iso = new Date(2026, 7, 29, 10, 55, 0).toISOString(); // уже прошло
      expect(formatForecastSummary(iso, true, now)).toBe("вот-вот");
    });

    it("imminent=false даёт «ориентировочно HH:MM · через ~N минут»", () => {
      const now = new Date(2026, 7, 29, 11, 0, 0);
      const iso = new Date(2026, 7, 29, 11, 20, 0).toISOString();
      expect(formatForecastSummary(iso, false, now)).toBe("ориентировочно 11:20 · через ~20 минут");
    });
  });

  describe("emptyForecast", () => {
    it("expectedStartAt = null — «нет прогноза», не время из прошлого/нулевое", () => {
      expect(emptyForecast().expectedStartAt).toBeNull();
    });
  });
});
