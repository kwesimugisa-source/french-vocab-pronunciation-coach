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
  voice: string;
  speed: number;
  audioBase64: string;
};

export type TheatreResponse = {
  mode: "theatre";
  integrity: {
    version: 1;
    parsedItemCount: number;
    /** All current parsed items are spoken, including stage directions. */
    expectedItemIds: string[];
    generatedClipCount: number;
  };
  clips: TheatreClip[];
};

function normalizeSpeakerName(name: string) {
  return name.replace(/\u00A0/g, " ").replace(/[’‘]/g, "'").trim().toUpperCase();
}

/** Preserve the existing theatre grammar and continuation-line behavior. */
export function parseTheatreItems(text: string): TheatreItem[] {
  const items: TheatreItem[] = [];
  const lines = text.split("\n");

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
      if (spokenText) append("dialogue", normalizeSpeakerName(match[1]), spokenText, sourceLine);
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
  });
}
