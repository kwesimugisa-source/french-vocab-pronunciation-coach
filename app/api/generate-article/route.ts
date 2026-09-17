import OpenAI from "openai";
import { generatedDocument, isContentType, LEVELS } from "../../../lib/content-document";
import { generationPrompt } from "../../../lib/generation-contracts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || !isContentType(body.contentType) || !LEVELS.includes(body.level))
      return Response.json({ error: "Type ou niveau invalide." }, { status: 400 });
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: "gpt-5.4-mini", temperature: 0.8,
      input: [{ role: "system", content: generationPrompt(body.contentType, body.level) },
        { role: "user", content: "Generate fresh material, varying topic, vocabulary and structure." }],
      text: { format: { type: "json_schema", name: "learning_passage", strict: true,
        schema: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, text: { type: "string" } }, required: ["title", "text"] } } },
    });
    const parsed: unknown = JSON.parse(response.output_text);
    const doc = generatedDocument(parsed, body.contentType, body.level, crypto.randomUUID());
    doc.source = "Texte pédagogique original généré par IA";
    return Response.json(doc);
  } catch {
    return Response.json({ error: "Impossible de générer un texte valide. Réessayez." }, { status: 500 });
  }
}
