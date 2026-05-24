import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const {
      contentType = "news",
      level = "B1",
      seed = Date.now(),
    } = await req.json();

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      temperature: 0.8,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: `You generate short French reading passages for learners.

Return only valid JSON:
{
  "title": "string",
  "source": "string",
  "level": "string",
  "text": "string"
}

Rules:
- Write in French only.
- Match CEFR level.
- Match content type.
- For standard prose content types, write 3 short paragraphs.
- Natural and readable.
- If content type is "poetry", generate a short French poem, NOT an article.
- For poetry, the "text" field MUST preserve verse formatting with line breaks.
- Use 3 short stanzas.
- Each stanza should have 3–4 lines.
- Separate stanzas with a blank line.
- Do not write paragraphs for poetry.
- If content type is "theatre", generate a short French theatrical scene.
- Use character names before dialogue lines.
- Preserve dialogue line breaks.
- Include occasional short stage directions in parentheses.
- Use 2–4 characters maximum.
- Keep dialogue natural, expressive, and readable for learners.
- Do not write theatre scenes as paragraphs.
- For generated poetry, set "source" to "Poème original généré par IA".
- For generated theatre, set "source" to "Scène originale générée par IA".`,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Content type: ${contentType}\n` +
                `Level: ${level}\n` +
                `Variation seed: ${seed}\n\n` +
                `Generate fresh content every time. Do not reuse the same setting, characters, opening situation, theme, imagery, or structure. Vary topic, vocabulary focus, verbs, locations, and emotional tone.`,
            },
          ],
        },
      ],
    });

    const text = response.output_text;
    const parsed = JSON.parse(text);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to generate article." },
      { status: 500 }
    );
  }
}