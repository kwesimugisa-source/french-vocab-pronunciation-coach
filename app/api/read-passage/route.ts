import OpenAI from "openai";
import { generateTheatreResponse, TheatreGenerationError } from "../../../lib/theatre-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      const scene = await generateTheatreResponse(text, playbackSpeed, (input) =>
        speechToBase64({ client, ...input })
      );
      return Response.json(scene);
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
    if (error instanceof TheatreGenerationError) {
      return Response.json({
        error: {
          code: error.code,
          message: error.message,
          failedItems: error.failedItems,
          parsedItemCount: error.parsedItemCount,
          expectedClipCount: error.parsedItemCount,
          generatedClipCount: error.generatedClipCount,
        },
      }, { status: 500 });
    }
    console.error("read-passage error:", error);
    return new Response("Error generating audio", { status: 500 });
  }
}