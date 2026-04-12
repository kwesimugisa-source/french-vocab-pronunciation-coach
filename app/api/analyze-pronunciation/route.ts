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

    // 1) Real transcription
    const transcript = await client.audio.transcriptions.create({
      file: audio,
      model: "gpt-4o-mini-transcribe",
    });

    const transcriptText = transcript.text?.trim() || "";

    // 2) Structured pronunciation feedback
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

Rules:
- Compare the user's transcript with the reference passage.
- Focus on learner-friendly pronunciation feedback.
- Mention likely skipped, changed, or unclear words.
- Keep feedback concise and practical.
- If evidence is weak, say "possible issue" rather than overclaiming.
- Return at most 6 weak points.
- transcript must be the user's transcribed reading.`,
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
            required: ["summary", "weakPoints", "transcript"],
          },
        },
      },
    });

    const parsed = JSON.parse(analysis.output_text);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("analyze-pronunciation error:", error);
    return NextResponse.json(
      { error: "Failed to analyze pronunciation." },
      { status: 500 }
    );
  }
}