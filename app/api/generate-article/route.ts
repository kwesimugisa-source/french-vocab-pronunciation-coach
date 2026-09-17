import { soundTarget, structuredExercises } from "../../../lib/tongue-twisters";
import { validateDocument } from "../../../lib/content-document";
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
    let target;
    try { target = soundTarget(body.contentType === "tongue-twisters" ? body.targetSound : undefined); }
    catch { return Response.json({ error: "Son à pratiquer invalide (40 caractères maximum)." }, { status: 400 }); }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: "gpt-5.4-mini", temperature: 0.8,
      input: [{ role: "system", content: generationPrompt(body.contentType, body.level, target) },
        { role: "user", content: body.contentType === "tongue-twisters" ? `Generate practice sentences for this sound-target data: ${JSON.stringify(target)}` : "Generate fresh material, varying topic, vocabulary and structure." }],
      text: { format: { type: "json_schema", name: "learning_passage", strict: true,
        schema: { type: "object", additionalProperties: false, properties: body.contentType === "tongue-twisters" ? { title: { type: "string" }, exercises: { type: "array", minItems: 5, maxItems: 10, items: { type: "string" } } } : { title: { type: "string" }, text: { type: "string" } }, required: body.contentType === "tongue-twisters" ? ["title", "exercises"] : ["title", "text"] } } },
    });
    const parsed: unknown = JSON.parse(response.output_text);
    const structured = body.contentType === "tongue-twisters" ? structuredExercises(parsed, target) : null;
    const doc = generatedDocument(structured ? { title: structured.title, text: structured.text } : parsed, body.contentType, body.level, crypto.randomUUID());
    if (structured) doc.tongueTwisters = structured.practice;
    validateDocument(doc);
    doc.source = "Texte pédagogique original généré par IA";
    return Response.json(doc);
  } catch {
    return Response.json({ error: "Impossible de générer un texte valide. Réessayez." }, { status: 500 });
  }
}
