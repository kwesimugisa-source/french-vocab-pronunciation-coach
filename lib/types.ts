export type ArticleData = {
  title: string;
  source?: string;
  level?: string;
  text: string;
};

export type WordInsight = {
  word: string;
  root?: string;
  partOfSpeech?: string;
  roleInSentence?: string;
  infinitive?: string;
  tense?: string;
  mood?: string;
  conjugation?: string;
  usage?: string;
  sentence?: string;
  francePronunciation?: string;
  quebecPronunciation?: string;
};


export type PronunciationIssue = {
  word: string;
  note: string;
  severity: "low" | "medium" | "high";
};
