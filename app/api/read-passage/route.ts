import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TheatreSegment = {
  type: "dialogue" | "stage";
  speaker: string;
  text: string;
};

const FEMALE_VOICE = "nova";
const MALE_VOICE = "onyx";
const NARRATOR_VOICE = "shimmer";

const FEMALE_NAMES = [
  "NORA",
  "MARIE",
  "SOPHIE",
  "CLARA",
  "ANNA",
  "EMMA",
  "JULIE",
];

const MALE_NAMES = [
  "SAMIR",
  "PAUL",
  "JULIEN",
  "THOMAS",
  "LUC",
  "MARC",
  "DAVID",
];

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

function parseTheatreSegments(text: string): TheatreSegment[] {
  const segments: TheatreSegment[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^\(.+\)$/.test(line)) {
      segments.push({
        type: "stage",
        speaker: "NARRATOR",
        text: line,
      });
      continue;
    }

    const match = line.match(
      /^\*{0,2}([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'’-]{0,30})\*{0,2}\s*[:：—–-]\s*(.+)$/
    );

    if (match) {
      segments.push({
        type: "dialogue",
        speaker: match[1].trim().toUpperCase(),
        text: match[2].trim(),
      });
      continue;
    }

    segments.push({
      type: "stage",
      speaker: "NARRATOR",
      text: line,
    });
  }

  return segments;
}

function voiceForSpeaker(speaker: string) {
  if (speaker === "NARRATOR") return NARRATOR_VOICE;
  if (FEMALE_NAMES.includes(speaker)) return FEMALE_VOICE;
  if (MALE_NAMES.includes(speaker)) return MALE_VOICE;

  return MALE_VOICE;
}

async function speechToBase64({
  client,
  text,
  voice,
  speed,
}: {
  client: OpenAI;
  text: string;
  voice: string;
  speed: number;
}) {
  const audioResponse = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: voice as any,
    input: text,
    speed,
  });

  const buffer = Buffer.from(await audioResponse.arrayBuffer());
  return buffer.toString("base64");
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

    const playbackSpeed = speedMap[String(speed)] ?? 1.0;
    const mode = detectReadingMode(text);

    if (mode === "theatre") {
      const segments = parseTheatreSegments(text).slice(0, 40);

      const clips = await Promise.all(
        segments.map(async (segment, index) => {
          const voice = voiceForSpeaker(segment.speaker);

          const characterSpeed = Math.max(0.95, playbackSpeed);
const narratorSpeed = Math.max(0.65, playbackSpeed - 0.15);

const segmentSpeed =
  segment.type === "stage"
    ? narratorSpeed
    : characterSpeed;

          const audioBase64 = await speechToBase64({
            client,
            text: segment.text,
            voice,
            speed: segmentSpeed,
          });

          return {
            index,
            type: segment.type,
            speaker: segment.speaker,
            text: segment.text,
            voice,
            speed: segmentSpeed,
            audioBase64,
          };
        })
      );

      return Response.json({
        mode: "theatre",
        clips,
      });
    }

    const audioResponse = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: text,
      speed: playbackSpeed,
    });

    const buffer = await audioResponse.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Reading-Mode": mode,
      },
    });
  } catch (error) {
    console.error("read-passage error:", error);
    return new Response("Error generating audio", { status: 500 });
  }
}