// Server-owned repository configuration. Never selected by request data.
// Deliberate rollback/activation is a reviewed repository change, not fallback.
export type TheatrePreparationStrategy = "MONOLITHIC" | "TWO_PASS";
export const THEATRE_PREPARATION_STRATEGY: TheatrePreparationStrategy = "MONOLITHIC";
export function preparationStrategy(): TheatrePreparationStrategy {
  const value: string = THEATRE_PREPARATION_STRATEGY;
  if (value !== "MONOLITHIC" && value !== "TWO_PASS") throw new Error("INVALID_PREPARATION_STRATEGY");
  return value;
}
