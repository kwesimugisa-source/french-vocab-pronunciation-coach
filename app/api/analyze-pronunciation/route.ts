import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    return NextResponse.json({
      summary: {
        overall: "Recording received successfully.",
        clarity: "Placeholder feedback.",
        rhythm: "Placeholder feedback.",
        priority: "Full AI pronunciation analysis comes next."
      },
      weakPoints: [
        {
          word: "example",
          note: "Placeholder weak point. Real analysis comes next.",
          severity: "medium"
        }
      ],
      meta: {
        receivedAudioName: audio.name,
        receivedAudioType: audio.type,
        receivedAudioSize: audio.size,
        referenceLength: text.length
      }
    });
  } catch (error) {
    console.error("analyze-pronunciation error:", error);
    return NextResponse.json(
      { error: "Failed to analyze pronunciation." },
      { status: 500 }
    );
  }
}