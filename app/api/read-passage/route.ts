import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stripTheatreSpeakerNames(text: string) {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();

      // Keep stage directions like "(soupire)" for now.
      // Later, narrator voice will handle these separately.
      if (/^\(.+\)$/.test(trimmed)) {
        return trimmed;
      }

      return trimmed
        .replace(
          /^\*{0,2}[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'’-]{0,30}\*{0,2}\s*[:：—–-]\s*/,
          ""
        )
        .trim();
    })
    .join("\n");
}

function detectReadingMode(text: string) {
  const hasSpeakerLines = text
    .split("\n")
    .some((line) =>
      /^\*{0,2}[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'’-]{0,30}\*{0,2}\s*[:：—–-]\s*/.test(
        line.trim()
      )
    );

  const stanzaCount = text.split("\n\n").length;
  const lineCount = text.split("\n").filter((line) => line.trim()).length;

  if (hasSpeakerLines) return "theatre";
  if (stanzaCount >= 2 && lineCount >= 6) return "poetry";

  return "standard";
}

function prepareReadingText(text: string) {
  const mode = detectReadingMode(text);

  if (mode === "theatre") {
    return {
      mode,
      text: stripTheatreSpeakerNames(text),
    };
  }

  return {
    mode,
    text,
  };
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new Response("Missing API key", { status: 500 });
    }

    const client = new OpenAI({ apiKey });

    const { text, speed = "normal" } = await req.json();

    if (!text) {
      return new Response("Missing text", { status: 400 });
    }

    const speedMap: Record<string, number> = {
      "very-slow": 0.7,
      slow: 0.85,
      normal: 1.0,
      fast: 1.15,
    };

    const playbackSpeed = speedMap[speed] ?? 1.0;
    const prepared = prepareReadingText(text);

    const audioResponse = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: prepared.text,
      speed: playbackSpeed,
    });

    const buffer = await audioResponse.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Reading-Mode": prepared.mode,
      },
    });
  } catch (error) {
    console.error("read-passage error:", error);
    return new Response("Error generating audio", { status: 500 });
  }
}