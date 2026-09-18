import type { Presentation } from "./voice-casting";
/** Editorial French-theatre casting conventions, not claims about real people.
 * Add reviewed entries here; unfamiliar/ambiguous names deliberately abstain. */
export type NameConvention = { normalizedName: string; presentation: Presentation; locale: "fr"; confidence: "strong" | "ambiguous" };
export function normalizeConventionName(name: string): string {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[’‘]/g, "'")
    .toLocaleLowerCase("fr").trim().replace(/^[\s:：.,;!?()[\]«»"']+|[\s:：.,;!?()[\]«»"']+$/gu, "");
}
const groups: { presentation: Presentation; names: string[] }[] = [
  { presentation: "female-presenting", names: ["Clara", "Claudine", "Sophie", "Marie", "Isabelle", "Élodie", "Élise", "Amélie", "Julie", "Juliette", "Lucie", "Louise", "Charlotte", "Alice", "Manon", "Chloé", "Sarah", "Nora", "Emma", "Léa", "Inès", "Anaïs", "Camille-Marie", "Catherine", "Anne", "Hélène", "Jeanne", "Pauline", "Mathilde", "Margot", "Valérie", "Sylvie", "Nathalie", "Véronique", "Sandrine", "Audrey", "Aline", "Mireille", "Monique", "Colette", "Françoise", "Béatrice", "Zoé", "Fatima", "Aïcha", "Nadia", "Yasmine", "Leïla"] },
  { presentation: "male-presenting", names: ["Marc", "Claude", "Pierre", "Jean", "Antoine", "Paul", "Louis", "Luc", "Lucien", "Julien", "Mathieu", "Thomas", "Nicolas", "Alexandre", "Guillaume", "François", "Philippe", "Jacques", "André", "Michel", "Bernard", "Laurent", "Sébastien", "Vincent", "Olivier", "David", "Daniel", "Gabriel", "Raphaël", "Arthur", "Hugo", "Émile", "Étienne", "Maxime", "Romain", "Quentin", "Benoît", "Frédéric", "Jean-Pierre", "Jean-Luc", "Samir", "Karim", "Mehdi", "Ahmed", "Youssef", "Ibrahim"] },
  { presentation: "unspecified", names: ["Alex", "Camille", "Dominique", "Andrea", "Charlie", "Sasha", "Sacha", "Alix", "Noa", "Kim", "Morgan", "Eden", "Lou", "Noor"] },
];
export const NAME_CONVENTIONS: readonly NameConvention[] = groups.flatMap(group => group.names.map(name => ({
  normalizedName: normalizeConventionName(name), presentation: group.presentation, locale: "fr" as const,
  confidence: group.presentation === "unspecified" ? "ambiguous" as const : "strong" as const,
})));
const lookup = new Map(NAME_CONVENTIONS.map(entry => [entry.normalizedName, entry]));
export function nameConvention(name: string): NameConvention | undefined { return lookup.get(normalizeConventionName(name)); }
