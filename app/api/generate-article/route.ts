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

    const { contentType = "news", level = "B1" } = await req.json();

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
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
- Write in French only
- Match CEFR level
- Match content type
- 3 short paragraphs
- Natural and readable`,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Content type: ${contentType}\nLevel: ${level}`,
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