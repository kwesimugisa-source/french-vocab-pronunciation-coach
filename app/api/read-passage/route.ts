import { theatreStyle } from "../../../lib/theatre-performance";
import OpenAI from "openai";
import { documentLanguage, DocumentLanguage, pronunciationInstructions } from "../../../lib/document-language";
import { protectedRoute, providerCall } from "../../../lib/beta-server";
import { generateTheatreResponse, TheatreGenerationError } from "../../../lib/theatre-generation";
import { requestDramaticAnalysis } from "../../../lib/theatre-direction";
import type { TheatreVoice } from "../../../lib/theatre-casting";
import { generateConversation, CONVERSATION_INSTRUCTIONS } from "../../../lib/conversation-generation";
import { conversationTurns, conversationVoices } from "../../../lib/conversation";

import { readingMode } from "../../../lib/content-routing";
import { isEffectiveType, MAX_TEXT_LENGTH, TTS_INPUT_LIMIT, validateIdentity } from "../../../lib/content-document";

import { validateTheatreCharacters } from "../../../lib/theatre-characters";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function speechToBase64({
  client,
  text,
  voice,
  speed,
  instructions,
  language,
}: {
  client: OpenAI;
  text: string;
  voice: TheatreVoice;
  speed: number;
  instructions: string;
  language: DocumentLanguage;
}) {
  if (text.length > TTS_INPUT_LIMIT) throw new Error("Réplique trop longue pour une requête audio.");
  const audioResponse = await providerCall("tts", () => client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice,
    input: text,
    speed,
    instructions: pronunciationInstructions(language, instructions),
  }), text.length);

  const buffer = Buffer.from(await audioResponse.arrayBuffer());
  return buffer.toString("base64");
}

async function handlePost(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new Response("Service audio indisponible. Réessayez plus tard.", { status: 500 });
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
    let language: DocumentLanguage;
    try { language = documentLanguage(body.language); }
    catch { return new Response("Langue du document non prise en charge.", { status: 400 }); }
    if (!["very-slow", "slow", "normal", "fast"].includes(speed)) return new Response("Vitesse invalide.", { status: 400 });

    const speedMap: Record<string, number> = {
      "very-slow": 0.7,
      slow: 0.85,
      normal: 1.0,
      fast: 1.15,
    };

    const playbackSpeed = speedMap[String(speed)] ?? 1.0;
    const mode = readingMode(text, body.contentType);
    if (body.conversationTurnId !== undefined && (body.contentType !== "conversation" || typeof body.conversationTurnId !== "string")) return new Response("Tour de parole invalide.", { status: 400 });

    if (body.contentType === "conversation") {
      try {
        const turns = conversationTurns(text);
        if (body.conversationTurnId !== undefined) {
          const turn = turns.find(item => item.id === body.conversationTurnId);
          if (!turn) return new Response("Tour de parole introuvable.", { status: 400 });
          if (turn.spokenText.length > TTS_INPUT_LIMIT) return new Response("Tour de parole trop long.", { status: 413 });
          const voices = conversationVoices(turns);
          // Resolve against the complete dialogue, never recast a one-turn subset.
          try {
            const audio = await speechToBase64({ client, language, text: turn.spokenText,
              voice: voices.get(turn.speakerId)!, speed: playbackSpeed,
              instructions: CONVERSATION_INSTRUCTIONS });
            return new Response(Buffer.from(audio, "base64"), { headers: { "Content-Type": "audio/mpeg", "X-Reading-Mode": "standard" } });
          } catch { return new Response("Impossible de préparer ce tour de parole. Réessayez.", { status: 500 }); }
        }
        if (turns.some(turn => turn.spokenText.length > TTS_INPUT_LIMIT))
          return new Response(`Un tour de parole dépasse ${TTS_INPUT_LIMIT} caractères. Raccourcissez ce tour pour l’écouter.`, { status: 413 });
      } catch (error) {
        return new Response(error instanceof Error ? error.message : "Conversation invalide.", { status: 400 });
      }
      try {
        return Response.json(await generateConversation(text, playbackSpeed, input => speechToBase64({ client, language, ...input })));
      } catch (error) {
        return new Response(error instanceof Error ? error.message : "Génération de conversation impossible.", { status: 500 });
      }
    }

    let theatreCharacters;
    if (body.theatreCharacters !== undefined) {
      try {
        if (mode !== "theatre") throw new Error("Invalid mode");
        theatreCharacters = validateTheatreCharacters(body.theatreCharacters, text);
      } catch { return new Response("Distribution des personnages invalide.", {status:400}); }
    }
    if (mode === "theatre") {
      let performanceStyle;
      try { performanceStyle = theatreStyle(body.performanceStyle); }
      catch { return new Response("Style théâtral invalide.", {status:400}); }
      const scene = await generateTheatreResponse(text, playbackSpeed, (input) =>
        speechToBase64({ client, language, ...input }),
        { performanceStyle, theatreCharacters, analyze: (sceneJson, signal, maxOutputTokens) => requestDramaticAnalysis(client, sceneJson, signal, maxOutputTokens), analysisCacheKey:body.analysisCacheKey, ambienceDecision:body.ambienceDecision, skipAnalysis:body.skipAnalysis === true }
      );
      return Response.json(scene);
    }
    if (text.length > TTS_INPUT_LIMIT) return new Response(
      `La lecture audio hors théâtre accepte au maximum ${TTS_INPUT_LIMIT} caractères. Importez un passage plus court pour l’écouter. Le texte affiché est conservé.`, { status: 413 });
    const audioResponse = await providerCall("tts", () => client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: text,
      speed: playbackSpeed,
      instructions: pronunciationInstructions(language),
    }), text.length);

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
    return new Response("Impossible de préparer la lecture. Réessayez.", { status: 500 });
  }
}
export const POST = protectedRoute("reading", handlePost);
