/** Identity only: never apply this transformation to spoken/source text. */
export function normalizeSpeakerLabel(label: string): string {
  return label.normalize("NFKC").replace(/[Œœ]/g, "OE").replace(/[’‘]/g, "'")
    .replace(/[:：]\s*$/, "").replace(/\s+/gu, " ").trim().toUpperCase();
}

// Exact aliases, intentionally excluding ambiguous collective labels.
const chorusAliases = new Set(["CHOEUR", "LE CHOEUR", "CHORUS", "LE CHORUS"]);
export function isChorusSpeaker(label: string): boolean {
  return chorusAliases.has(normalizeSpeakerLabel(label));
}
export function speakerIdentity(label: string): string {
  return isChorusSpeaker(label) ? "CHŒUR" : normalizeSpeakerLabel(label);
}
