import { isEffectiveType, LEVELS, validateIdentity } from "../../../lib/content-document";
import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnalyzeWordRequest = {
  documentId?: string;
  revision?: number;
  word?: string;
  sentence?: string;
  level?: string;
  contentType?: string;
};

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    const body = (await req.json()) as AnalyzeWordRequest;

    if (!body || typeof body.word !== "string" || !body.word.trim() || body.word.length > 100 ||
      typeof body.sentence !== "string" || body.sentence.length > 60000 || !isEffectiveType(body.contentType) ||
      (body.level !== "unknown" && !LEVELS.includes(body.level as typeof LEVELS[number])))
      return NextResponse.json({ error: "Contexte du mot invalide." }, { status: 400 });
    if (body.documentId !== undefined || body.revision !== undefined) {
      try { validateIdentity({ ...body }); } catch { return NextResponse.json({ error: "Identité invalide." }, { status: 400 }); }
    }
    const word = body.word.trim();
    const sentence = body.sentence.trim();
    const level = body.level;
    const contentType = body.contentType;

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: `You are a French language analysis engine.

Return only valid JSON with this exact shape:
{
  "word": "string",
  "root": "string",
  "partOfSpeech": "string",
  "roleInSentence": "string",
  "infinitive": "string",
  "tense": "string",
  "mood": "string",
  "conjugation": "string",
  "usage": "string",
  "sentence": "string",
  "francePronunciation": "string",
  "quebecPronunciation": "string"
}

Rules:
- An unknown level is not an assessed CEFR level; use accessible explanations without assigning a level.
- Analyze the word in the context of the supplied sentence.
- Write explanations in clear learner-friendly English.
- If a field does not apply, use "—".
- "root" should be the lemma or base form when possible.
- "partOfSpeech" should be things like Noun, Verb, Adjective, Adverb, Pronoun, etc.
- "roleInSentence" should describe what the word is doing in this exact sentence.
- "infinitive" applies mainly to verbs.
- "tense" and "mood" should reflect the actual verb form in context.
- "conjugation" should describe the exact form, like "3rd person plural" or "feminine plural adjective".
- "usage" should be a short explanation of the meaning in context.
- "sentence" must return the original sentence unchanged.
- Keep pronunciation fields simple and readable for learners, not IPA-heavy.`,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Analyze this French word in context.

Word: ${word}
Sentence: ${sentence}
Level: ${level}
Content type: ${contentType}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "word_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              word: { type: "string" },
              root: { type: "string" },
              partOfSpeech: { type: "string" },
              roleInSentence: { type: "string" },
              infinitive: { type: "string" },
              tense: { type: "string" },
              mood: { type: "string" },
              conjugation: { type: "string" },
              usage: { type: "string" },
              sentence: { type: "string" },
              francePronunciation: { type: "string" },
              quebecPronunciation: { type: "string" },
            },
            required: [
              "word",
              "root",
              "partOfSpeech",
              "roleInSentence",
              "infinitive",
              "tense",
              "mood",
              "conjugation",
              "usage",
              "sentence",
              "francePronunciation",
              "quebecPronunciation",
            ],
          },
        },
      },
    });

    const parsed = JSON.parse(response.output_text);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("analyze-word error:", error);
    return NextResponse.json(
      { error: "Failed to analyze word." },
      { status: 500 }
    );
  }
}