import { isChorusSpeaker, speakerIdentity } from "./theatre-speakers";

/** A dialogue turn is one logical item, even when it spans physical lines.
 * IDs are scene-local and deterministic for unchanged source text. They are not
 * persistent edit-tracking IDs: scope selections to their original scene.
 */
export type TheatreItem = {
  id: string;
  index: number;
  type: "dialogue" | "stage";
  speaker: string;
  text: string;
  /** One-based physical source lines contributing to this item's text. */
  sourceLines: number[];
};

export type TheatreClip = TheatreItem & {
  /** Separate cached sources; still ONE logical item. Primary audio retained for legacy clients. */
  chorus?: { components: { voice: string; audioBase64: string }[] };
  voice: string;
  speed: number;
  audioBase64: string;
};

export type TheatreResponse = {
  mode: "theatre";
  ambience?: import("./theatre-ambience").AmbienceRecommendation;
  /** Advisory generation metadata only; never used as playback state. */
  direction?: import("./theatre-direction").DirectionMetadata;
  casting?: import("./theatre-casting").TheatreCasting;
  integrity: {
    version: 1;
    parsedItemCount: number;
    /** All current parsed items are spoken, including stage directions. */
    expectedItemIds: string[];
    generatedClipCount: number;
  };
  clips: TheatreClip[];
};

/** Preserve the existing theatre grammar and continuation-line behavior. */
export function parseTheatreItems(text: string): TheatreItem[] {
  const items: TheatreItem[] = [];
  const lines = text.split("\n");
  let pendingSpeaker: string | null = null;

  function append(type: TheatreItem["type"], speaker: string, text: string, sourceLine: number) {
    items.push({
      id: `line-${sourceLine}`,
      index: items.length,
      type,
      speaker,
      text,
      sourceLines: [sourceLine],
    });
  }

  lines.forEach((rawLine, offset) => {
    const line = rawLine.trim();
    const sourceLine = offset + 1;
    if (!line) return;

    if (/^\(.+\)$/.test(line)) {
      append("stage", "NARRATOR", line, sourceLine);
      return;
    }

    const match = line.match(/^(.{1,40}?)\s*[:：]\s*(.*)$/);
    if (match) {
      const spokenText = match[2].trim();
      pendingSpeaker = speakerIdentity(match[1]);
      if (spokenText) {
        append("dialogue", pendingSpeaker, spokenText, sourceLine);
        pendingSpeaker = null;
      }
      return;
    }

    if (pendingSpeaker !== null) {
      append("dialogue", pendingSpeaker, line, sourceLine);
      pendingSpeaker = null;
      return;
    }

    // Isolated numeric content is ambiguous: preserve it as a spoken item,
    // rather than deleting possible dialogue or appending pagination to a turn.
    if (/^\d+$/.test(line) && !lines[offset - 1]?.trim() && !lines[offset + 1]?.trim()) {
      append("stage", "NARRATOR", line, sourceLine);
      return;
    }

    const lastItem = items[items.length - 1];
    if (lastItem?.type === "dialogue") {
      lastItem.text = `${lastItem.text} ${line}`;
      lastItem.sourceLines.push(sourceLine);
    } else {
      append("stage", "NARRATOR", line, sourceLine);
    }
  });

  return items;
}

/** Check against an independently parsed source, not just server-supplied counts.
 * This also guards playback against a truncated, duplicated or reordered scene.
 */
export function assertCompleteTheatreResponse(
  value: unknown,
  expectedItems: readonly TheatreItem[]
): asserts value is TheatreResponse {
  const invalid = () => { throw new Error("Réponse audio de théâtre incomplète ou invalide."); };
  if (!value || typeof value !== "object") return invalid();
  const data = value as Partial<TheatreResponse>;
  const integrity = data.integrity;
  if (
    data.mode !== "theatre" || !Array.isArray(data.clips) ||
    !integrity || integrity.version !== 1 ||
    !Array.isArray(integrity.expectedItemIds) ||
    integrity.parsedItemCount !== expectedItems.length ||
    integrity.generatedClipCount !== expectedItems.length ||
    integrity.expectedItemIds.length !== expectedItems.length ||
    data.clips.length !== expectedItems.length ||
    new Set(integrity.expectedItemIds).size !== expectedItems.length
  ) return invalid();

  expectedItems.forEach((item, index) => {
    const clip = data.clips![index];
    if (
      !clip || integrity.expectedItemIds[index] !== item.id ||
      clip.id !== item.id || clip.index !== item.index ||
      clip.type !== item.type || clip.speaker !== item.speaker || clip.text !== item.text ||
      !Array.isArray(clip.sourceLines) ||
      clip.sourceLines.length !== item.sourceLines.length ||
      clip.sourceLines.some((line, i) => line !== item.sourceLines[i]) ||
      typeof clip.voice !== "string" || !clip.voice ||
      typeof clip.speed !== "number" || !Number.isFinite(clip.speed) || clip.speed <= 0 ||
      typeof clip.audioBase64 !== "string" || !clip.audioBase64.trim()
    ) invalid();
    if (clip.chorus !== undefined) {
      const parts = clip.chorus?.components;
      if (item.type !== "dialogue" || !isChorusSpeaker(item.speaker) ||
        !Array.isArray(parts) || parts.length !== 3 || new Set(parts.map((part) => part?.voice)).size !== 3 ||
        parts.some((part) => !part || typeof part.voice !== "string" || !part.voice ||
          typeof part.audioBase64 !== "string" || !part.audioBase64.trim()) ||
        parts[0].voice !== clip.voice || parts[0].audioBase64 !== clip.audioBase64) invalid();
    }
  });
}
