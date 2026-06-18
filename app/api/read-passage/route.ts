import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TheatreSegment = {
  type: "dialogue" | "stage";
  speaker: string;
  text: string;
};

const NARRATOR_VOICE = "shimmer";
const CHORUS_VOICE = "echo";
const CHARACTER_VOICES = ["onyx", "nova", "fable", "alloy"] as const;

function detectReadingMode(text: string) {
  const lines = text.split("\n").map((line) => line.trim());

  const dialogueLines = lines.filter((line) =>
    /^.{1,40}?\s*[:：]\s*/.test(line)
  );

  const hasSpeakerLines = dialogueLines.length >= 2;

  const stanzaCount = text.split("\n\n").length;
  const lineCount = text.split("\n").filter((line) => line.trim()).length;

  if (hasSpeakerLines) return "theatre";
  if (stanzaCount >= 2 && lineCount >= 6) return "poetry";

  return "standard";
}

function normalizeSpeakerName(name: string) {
  return name
    .replace(/\u00A0/g, " ")
    .replace(/[’‘]/g, "'")
    .trim()
    .toUpperCase();
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

    const match = line.match(/^(.{1,40}?)\s*[:：]\s*(.*)$/);

    if (match) {
      const speaker = normalizeSpeakerName(match[1]);
      const spokenText = match[2].trim();

      if (spokenText) {
        segments.push({
          type: "dialogue",
          speaker,
          text: spokenText,
        });
      }

      continue;
    }

    const lastSegment = segments[segments.length - 1];

    if (lastSegment && lastSegment.type === "dialogue") {
      lastSegment.text = `${lastSegment.text} ${line}`;
    } else {
      segments.push({
        type: "stage",
        speaker: "NARRATOR",
        text: line,
      });
    }
  }

  return segments;
}

function voiceForSpeaker(
  speaker: string,
  speakerVoiceMap: Record<string, string>
) {
  if (speaker === "NARRATOR") return NARRATOR_VOICE;

  if (
    speaker.includes("CHŒUR") ||
    speaker.includes("CHOEUR") ||
    speaker.includes("CHORUS")
  ) {
    return CHORUS_VOICE;
  }

  if (!speakerVoiceMap[speaker]) {
    const usedCount = Object.keys(speakerVoiceMap).length;
    speakerVoiceMap[speaker] =
      CHARACTER_VOICES[usedCount % CHARACTER_VOICES.length];
  }

  return speakerVoiceMap[speaker];
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
      const speakerVoiceMap: Record<string, string> = {};
      const segments = parseTheatreSegments(text).slice(0, 40);

      const clips = await Promise.all(
        segments.map(async (segment, index) => {
          const voice = voiceForSpeaker(segment.speaker, speakerVoiceMap);

          const characterSpeed = Math.max(0.95, playbackSpeed);
          const narratorSpeed = Math.max(0.65, playbackSpeed - 0.15);

          const segmentSpeed =
            segment.type === "stage" ? narratorSpeed : characterSpeed;

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