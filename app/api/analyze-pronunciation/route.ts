import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const audio = formData.get("audio");
    const text = formData.get("text");

    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "Missing audio file." },
        { status: 400 }
      );
    }

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Missing reference text." },
        { status: 400 }
      );
    }

    const transcript = await client.audio.transcriptions.create({
      file: audio,
      model: "gpt-4o-mini-transcribe",
    });

    const transcriptText = transcript.text?.trim() || "";

    const analysis = await client.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: `You are a French pronunciation coach.

Return only valid JSON with this exact shape:
{
  "score": {
    "overall": number,
    "pronunciation": number,
    "fluency": null,
    "intonation": null
  },
  "summary": {
    "overall": "string",
    "clarity": "string",
    "rhythm": "string",
    "priority": "string"
  },
  "weakPoints": [
    {
      "word": "string",
      "note": "string",
      "severity": "low" | "medium" | "high"
    }
  ],
  "transcript": "string"
}

Evidence limits:
- You receive only a reference and a machine-generated transcript, not acoustic evidence.
- overall and pronunciation are legacy field names for estimated transcript/reference word correspondence, from 0 to 100.
- fluency and intonation MUST be null: neither is measured.
- Never infer sound clarity, pacing, hesitation, stress, expression, phoneme accuracy or melody.
- Summaries describe textual agreement and possible transcription differences only.
- State that recognition errors can explain differences; they do not prove mispronunciation.
- summary.rhythm must state that rhythm and intonation cannot be evaluated from this evidence.
- Suggest rereading reference words for practice, without diagnosing sounds.
- Return at most 6 weak points. Transcript must be the supplied transcript.

CRITICAL:
- Each weakPoints.word must be a SINGLE WORD only (no phrases).
- Each weakPoints.word MUST appear exactly in the reference passage.
- Do NOT return multi-word expressions.
- Do NOT return transcript-only variants.
- Preserve accents and apostrophes exactly as they appear in the reference passage.
- If the issue involves a phrase, select the single most relevant word from the reference passage.`,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Reference passage:
${text}

User transcript:
${transcriptText}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "pronunciation_feedback",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              score: {
                type: "object",
                additionalProperties: false,
                properties: {
                  overall: { type: "number", minimum: 0, maximum: 100 },
                  pronunciation: { type: "number", minimum: 0, maximum: 100 },
                  fluency: { type: "null" },
                  intonation: { type: "null" },
                },
                required: [
                  "overall",
                  "pronunciation",
                  "fluency",
                  "intonation",
                ],
              },
              summary: {
                type: "object",
                additionalProperties: false,
                properties: {
                  overall: { type: "string" },
                  clarity: { type: "string" },
                  rhythm: { type: "string" },
                  priority: { type: "string" },
                },
                required: ["overall", "clarity", "rhythm", "priority"],
              },
              weakPoints: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    word: { type: "string" },
                    note: { type: "string" },
                    severity: {
                      type: "string",
                      enum: ["low", "medium", "high"],
                    },
                  },
                  required: ["word", "note", "severity"],
                },
              },
              transcript: { type: "string" },
            },
            required: ["score", "summary", "weakPoints", "transcript"],
          },
        },
      },
    });

    const parsed = JSON.parse(analysis.output_text);

    const score = parsed?.score?.overall;
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100 || !Array.isArray(parsed?.weakPoints))
      throw new Error("Invalid transcript comparison");
    const referenceWords = new Set(text.match(/[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*/gu) ?? []);
    const weakPoints = parsed.weakPoints.filter((point: { word?: unknown }) => typeof point?.word === "string" && referenceWords.has(point.word))
      .slice(0, 6).map((point: { word: string }) => ({ word: point.word,
        note: "Différence possible dans la transcription. Réécoutez et réessayez ; la reconnaissance vocale peut se tromper.", severity: "low" }));
    return NextResponse.json({
      score: { overall: score, pronunciation: score, fluency: null, intonation: null },
      summary: {
        overall: "Comparaison indicative de la transcription avec le texte de référence.",
        clarity: "Les différences de mots peuvent provenir de la reconnaissance vocale ; elles ne prouvent pas une erreur de prononciation.",
        rhythm: "La fluidité et l’intonation ne sont pas mesurées.",
        priority: weakPoints.length ? "Réécoutez les mots proposés, puis enregistrez un nouvel essai." : "Continuez à pratiquer en comparant votre lecture au modèle.",
      },
      weakPoints, transcript: transcriptText, evidence: "transcript-reference-comparison",
    });
  } catch (error) {
    console.error("analyze-pronunciation error:", error);
    return NextResponse.json(
      { error: "Failed to analyze pronunciation." },
      { status: 500 }
    );
  }
}