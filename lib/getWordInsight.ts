import { WordInsight } from "./types";

const wordInsights: Record<string, WordInsight> = {
  marché: {
    word: "marché",
    root: "marché",
    conjugation: "Nom commun",
    usage: "Lieu où l'on vend et achète des produits.",
    francePronunciation: "mar-shay",
    quebecPronunciation: "mar-shay",
  },
  quartier: {
    word: "quartier",
    root: "quartier",
    conjugation: "Nom commun",
    usage: "Partie d'une ville.",
    francePronunciation: "kar-tyay",
    quebecPronunciation: "kar-tyay",
  },
};

export function getWordInsight(word: string): WordInsight | null {
  return wordInsights[word] ?? null;
}