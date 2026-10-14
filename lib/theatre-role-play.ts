import { parseTheatreItems } from "./theatre";
import type { TheatreItem } from "./theatre";
import { theatreRole } from "./theatre-casting";

/** Identity only; never normalize or rewrite the authored dialogue. */
export function selectableTheatreRoles(items: readonly TheatreItem[]): string[] {
  return [...new Set(items.filter(item => theatreRole(item) === "character" && item.speaker !== "NARRATOR")
    .map(item => item.speaker))];
}
export function theatreRoles(text: string): string[] { return selectableTheatreRoles(parseTheatreItems(text)); }
export type TheatreRoleRun = Readonly<{
  epoch: number; sessionId: number; documentId: string; revision: number;
  speaker: string; style: "clarte" | "naturel"; speed: string;
}>;
export type LearnerTurn = Readonly<{
  run: TheatreRoleRun; itemId: string; index: number; speaker: string; text: string;
}>;
