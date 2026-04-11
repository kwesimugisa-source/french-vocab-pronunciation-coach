"use client";

import { useMemo, useState } from "react";
import { getWordInsight } from "@/lib/getWordInsight";
import ArticleHeader from "@/components/article-reader/ArticleHeader";
import ArticleTextPanel from "@/components/article-reader/ArticleTextPanel";
import ReadingControls from "@/components/article-reader/ReadingControls";
import ReadingSetupBar from "@/components/article-reader/ReadingSetupBar";
import AppShell from "@/components/layout/AppShell";
import PronunciationSummary from "@/components/pronunciation/PronunciationSummary";
import WeakPointsPanel from "@/components/pronunciation/WeakPointsPanel";
import WordInsightPanel from "@/components/vocabulary/WordInsightPanel";
import type { ArticleData, WordInsight } from "@/lib/types";

const initialArticle: ArticleData = {
  title: "Une promenade dans un quartier de Montréal",
  source: "Demo article",
  level: "B1–B2",
  text: `Le samedi matin, plusieurs habitants du quartier se rendent au marché pour acheter des produits frais. Certains prennent le temps de discuter avec les commerçants, tandis que d'autres préfèrent faire leurs courses rapidement avant de rentrer chez eux.

Dans les rues voisines, on entend souvent des conversations en français, en anglais et parfois dans d'autres langues. Cette diversité donne au quartier une atmosphère vivante et chaleureuse.

Après leurs achats, quelques amis s'installent à la terrasse d'un café pour profiter du beau temps. Ils parlent de leur semaine, de leurs projets, et des activités culturelles prévues en ville.`,
};

function normalizeWord(word: string) {
  return word
    .toLowerCase()
    .trim()
    .replace(/^[^a-zàâçéèêëîïôûùüÿñæœ'-]+|[^a-zàâçéèêëîïôûùüÿñæœ'-]+$/gi, "");
}

function splitIntoSentences(text: string) {
  return text
    .replace(/\n+/g, " ")
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
}

function findSentenceForWord(text: string, targetWord: string) {
  const sentences = splitIntoSentences(text);

  return (
    sentences.find((sentence) => {
      const words = sentence.split(/\s+/).map(normalizeWord);
      return words.includes(targetWord);
    }) || null
  );
}

export default function Page() {
  const [selectedWord, setSelectedWord] = useState<WordInsight | null>(null);
  const [selectedWordKey, setSelectedWordKey] = useState<string | null>(null);

  const [contentType, setContentType] = useState("news");
  const [level, setLevel] = useState("B1");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  const [article, setArticle] = useState<ArticleData>(initialArticle);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const fallbackInsight = useMemo<WordInsight | null>(() => {
    if (!selectedWordKey) return null;

    return {
      word: selectedWordKey,
      root: selectedWordKey,
      partOfSpeech: "À analyser",
      roleInSentence: "À analyser dans le contexte de la phrase",
      infinitive: "—",
      tense: "—",
      mood: "—",
      conjugation: "À analyser",
      usage:
        "Aucune fiche locale pour ce mot pour l'instant. Plus tard, cette zone sera remplie par l'analyse AI.",
      sentence: findSentenceForWord(article.text, selectedWordKey) || "—",
      francePronunciation: "À venir",
      quebecPronunciation: "À venir",
    };
  }, [selectedWordKey, article.text]);

  async function handleAnalyzeWord(rawWord: string) {
    const cleaned = normalizeWord(rawWord);
    if (!cleaned) return;

    const sentence = findSentenceForWord(article.text, cleaned) || "—";

    setSelectedWordKey(cleaned);

    try {
      const response = await fetch("/api/analyze-word", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          word: cleaned,
          sentence,
          level,
          contentType,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to analyze word.");
      }

      const data = await response.json();
      setSelectedWord(data);
    } catch (error) {
      console.error(error);

      const localInsight = getWordInsight(cleaned);

      setSelectedWord(
        localInsight
          ? {
              ...localInsight,
              sentence: localInsight.sentence || sentence,
            }
          : {
              word: cleaned,
              root: cleaned,
              partOfSpeech: "—",
              roleInSentence: "—",
              infinitive: "—",
              tense: "—",
              mood: "—",
              conjugation: "—",
              usage: "Analysis unavailable right now.",
              sentence,
              francePronunciation: "—",
              quebecPronunciation: "—",
            }
      );
    }
  }

async function handlePlayAudio() {
  try {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudio(null);
      setAudioUrl(null);
      setIsPlayingAudio(false);
      return;
    }

    setIsPlayingAudio(true);

    const response = await fetch("/api/read-passage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: article.text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("read-passage failed:", errorText);
      throw new Error("Failed to generate audio.");
    }

    const blob = await response.blob();
    console.log("Audio blob:", blob.size, blob.type);

    if (!blob.size) {
      throw new Error("Audio response was empty.");
    }

    const url = URL.createObjectURL(blob);
    const newAudio = new Audio(url);

    newAudio.onended = () => {
      URL.revokeObjectURL(url);
      setAudio(null);
      setAudioUrl(null);
      setIsPlayingAudio(false);
    };

    newAudio.onerror = () => {
      URL.revokeObjectURL(url);
      setAudio(null);
      setAudioUrl(null);
      setIsPlayingAudio(false);
      console.error("Audio playback error.");
    };

    setAudio(newAudio);
    setAudioUrl(url);

    await newAudio.play();
  } catch (error) {
    console.error(error);
    setIsPlayingAudio(false);
    alert("Could not play AI reading.");
  }
}
  async function handleGenerateArticle() {
    try {
      setIsGenerating(true);

      const response = await fetch("/api/generate-article", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentType,
          level,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate article.");
      }

      const data = await response.json();

      setArticle({
        title: data.title,
        source: data.source,
        level: data.level,
        text: data.text,
      });

      setSelectedWord(null);
      setSelectedWordKey(null);
    } catch (error) {
      console.error(error);
      alert("Could not generate article.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <AppShell>
      <ArticleHeader article={article} />

      <ReadingSetupBar
  contentType={contentType}
  level={level}
  isPlayingAudio={isPlayingAudio}
  isGenerating={isGenerating}
  onContentTypeChange={setContentType}
  onLevelChange={setLevel}
  onPlayAudio={handlePlayAudio}
  onGenerateArticle={handleGenerateArticle}
/>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div>
          <ArticleTextPanel
            article={article}
            selectedWord={selectedWordKey}
            onWordClick={handleAnalyzeWord}
          />
        </div>

        <div>
          <WordInsightPanel selectedWord={selectedWord ?? fallbackInsight} />
        </div>
      </div>

      <ReadingControls />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <PronunciationSummary />
        <WeakPointsPanel />
      </div>
    </AppShell>
  );
}