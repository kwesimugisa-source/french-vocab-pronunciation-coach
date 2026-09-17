import { EffectiveType } from "./content-document";
import { detectContent } from "./smart-import";

/** Explicit document identity is authoritative, including explicit unknown.
 * Only identity-free legacy requests may discover a mode from source structure. */
export function readingMode(text: string, type?: EffectiveType): "theatre" | "poetry" | "standard" {
  const effective = type === undefined ? detectContent(text).contentType : type;
  return effective === "theatre" ? "theatre" : effective === "poetry" ? "poetry" : "standard";
}
