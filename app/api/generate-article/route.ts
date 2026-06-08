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
- For generated theatre, set "source" to "Scène originale générée par IA".
- Use clearly gendered French first names for characters.
- Prefer common names such as Nora, Sophie, Marie, Clara, Emma, Julie, Samir, Paul, Julien, Thomas, Marc, Luc, and David.
- Stage directions must include the character name when possible, for example "(Nora soupire.)" or "(Samir regarde la porte.)".
- Avoid overusing quiet cafés, rain, old streets, markets, parks, and waiting scenes.
- For theatre, vary the conflict: misunderstanding, surprise visit, lost object, disagreement, secret, decision, apology, invitation, small emergency, or unexpected news.
- For theatre, vary the setting: apartment, bus stop, library, workplace, train station, school, theatre backstage, clinic, museum, or street corner.
- Do not always use two people waiting or talking calmly.
- Each generated text should have a clear situation, small tension, and resolution.
- Avoid repeatedly using lost objects, missing documents, forgotten items, mistaken identity, waiting for someone, or simple arrival/departure scenes.
- Vary the dramatic situation significantly from one generation to the next.
- Possible themes include:
  - a surprise announcement
  - a misunderstanding
  - a difficult decision
  - an unexpected visitor
  - a secret revealed
  - a workplace conflict
  - a friendship problem
  - a family discussion
  - a travel problem
  - a celebration
  - a competition
  - a community event
  - a mystery
  - a moral dilemma
  - a humorous situation
  - a school challenge
  - a medical appointment
  - a business meeting
  - an interview
  - a historical scene
- Do not frequently reuse the same plot structure.
- If content type is "tongue-twisters", generate French pronunciation exercises.
- Generate between 5 and 10 tongue twisters.
- Preserve line breaks.
- Do not write paragraphs.
- Focus on difficult French pronunciation patterns.
- Vary sounds such as:
  - r
  - u / ou
  - é / è
  - s / ch
  - an / en / on
  - eu / œu
- Match CEFR level.
- Include a short label before each group, such as:
  "Exercice du son R"
  "Exercice du son CH"
  "Exercice du son U"
  "Exercice du son OU"
- Do not use emoji.
- Write labels entirely in French.
- Set "source" to "Virelangues générés par IA".
`,
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