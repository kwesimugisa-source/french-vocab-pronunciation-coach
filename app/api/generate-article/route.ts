import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type GenerateArticleRequest = {
  contentType?: string;
  level?: string;
};

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as GenerateArticleRequest;
    const contentType = body.contentType?.trim() || "news";
    const level = body.level?.trim() || "B1";

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: `You generate short French reading passages for learners.

Return only valid JSON matching this schema:
{
  "title": "string",
  "source": "string",
  "level": "string",
  "text": "string"
}

Rules:
- Write in French only.
- Match the requested CEFR level exactly.
- Match the requested content type exactly.
- Keep the passage to 3 short paragraphs.
- Make it natural, readable, and useful for pronunciation practice.
- Use punctuation clearly so later AI voice playback can follow rhythm and tone.
- "source" should be a short label like "AI News Passage" or "AI Creative Passage".`,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Generate one French passage with:
Content type: ${contentType}
Level: ${level}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "article_payload",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              source: { type: "string" },
              level: { type: "string" },
              text: { type: "string" },
            },
            required: ["title", "source", "level", "text"],
          },
        },
      },
    });

    const parsed = JSON.parse(response.output_text);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("generate-article error:", error);
    return NextResponse.json(
      { error: "Failed to generate article." },
      { status: 500 }
    );
  }
}