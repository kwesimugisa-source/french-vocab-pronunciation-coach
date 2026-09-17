import OpenAI from "openai";
import { generateTheatreResponse, TheatreGenerationError } from "../../../lib/theatre-generation";
import { requestDramaticAnalysis } from "../../../lib/theatre-direction";
import type { TheatreVoice } from "../../../lib/theatre-casting";

import { readingMode } from "../../../lib/content-routing";
import { isEffectiveType, MAX_TEXT_LENGTH, TTS_INPUT_LIMIT, validateIdentity } from "../../../lib/content-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function speechToBase64({
  client,
  text,
  voice,
  speed,
  instructions,
}: {
  client: OpenAI;
  text: string;
  voice: TheatreVoice;
  speed: number;
  instructions: string;
}) {
  if (text.length > TTS_INPUT_LIMIT) throw new Error("Réplique trop longue pour une requête audio.");
  const audioResponse = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice,
    input: text,
    speed,
    instructions,
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

    const body = await req.json();
    if (!body || typeof body.text !== "string" || !body.text.trim() || body.text.length > MAX_TEXT_LENGTH ||
      (body.contentType !== undefined && !isEffectiveType(body.contentType)))
      return new Response("Texte ou type invalide.", { status: 400 });
    if (body.documentId !== undefined || body.revision !== undefined) {
      try { validateIdentity(body); } catch { return new Response("Identité du document invalide.", { status: 400 }); }
    }
    const { text, speed = "normal" } = body;
    if (!["very-slow", "slow", "normal", "fast"].includes(speed)) return new Response("Vitesse invalide.", { status: 400 });

    const speedMap: Record<string, number> = {
      "very-slow": 0.7,
      slow: 0.85,
      normal: 1.0,
      fast: 1.15,
    };

    const playbackSpeed = speedMap[String(speed)] ?? 1.0;
    const mode = readingMode(text, body.contentType);

    if (mode === "theatre") {
      const scene = await generateTheatreResponse(text, playbackSpeed, (input) =>
        speechToBase64({ client, ...input }),
        { analyze: (sceneJson, signal, maxOutputTokens) => requestDramaticAnalysis(client, sceneJson, signal, maxOutputTokens) }
      );
      return Response.json(scene);
    }
    if (text.length > TTS_INPUT_LIMIT) return new Response(
      `La lecture audio hors théâtre accepte au maximum ${TTS_INPUT_LIMIT} caractères. Importez un passage plus court pour l’écouter. Le texte affiché est conservé.`, { status: 413 });
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
