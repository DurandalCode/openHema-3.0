/**
 * tournamentSettingsKeys — query/mutation keys для фичи tournament-settings.
 * Иерархия: ['tournament-settings', <scope>, ...params] (см. ADR 0006).
 */
export const tournamentSettingsKeys = {
  active: ["tournament-settings", "active"] as const,
};