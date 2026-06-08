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
  source: "Texte de démonstration",
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
  return text.replace(/\n+/g, " ").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
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

  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const [contentType, setContentType] = useState("news");
  const [level, setLevel] = useState("B1");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [readingSpeed, setReadingSpeed] = useState("normal");

  const [article, setArticle] = useState<ArticleData>(initialArticle);
  const [isGenerating, setIsGenerating] = useState(false);

  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [pronunciationSummary, setPronunciationSummary] = useState<{
    overall: string;
    clarity: string;
    rhythm: string;
    priority: string;
  } | null>(null);

  const [pronunciationScore, setPronunciationScore] = useState<{
    overall: number;
    pronunciation: number;
    fluency: number;
    intonation: number;
  } | null>(null);

  const [pronunciationWeakPoints, setPronunciationWeakPoints] = useState<
    { word: string; note: string; severity: "low" | "medium" | "high" }[]
  >([]);

  const [learningWords, setLearningWords] = useState<string[]>([]);

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
        throw new Error("Échec de l’analyse du mot.");
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
              usage: "Analyse indisponible pour le moment.",
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
          speed: readingSpeed,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("read-passage failed:", errorText);
        throw new Error("Échec de la génération audio.");
      }

      const contentType = response.headers.get("Content-Type") || "";

      if (contentType.includes("application/json")) {
        const data = await response.json();

        if (data.mode !== "theatre" || !Array.isArray(data.clips)) {
          throw new Error("Réponse audio de théâtre inattendue.");
        }

        for (const clip of data.clips) {
          const binary = atob(clip.audioBase64);
          const bytes = new Uint8Array(binary.length);

          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          const clipBlob = new Blob([bytes], { type: "audio/mpeg" });
          const clipUrl = URL.createObjectURL(clipBlob);
          const clipAudio = new Audio(clipUrl);

          setAudio(clipAudio);
          setAudioUrl(clipUrl);

          await new Promise<void>((resolve, reject) => {
            clipAudio.onended = () => {
              URL.revokeObjectURL(clipUrl);
              resolve();
            };

            clipAudio.onerror = () => {
              URL.revokeObjectURL(clipUrl);
              reject(new Error("Échec de la lecture du segment théâtral."));
            };

            clipAudio.play().catch(reject);
          });
        }

        setAudio(null);
        setAudioUrl(null);
        setIsPlayingAudio(false);
        return;
      }

      const blob = await response.blob();

      if (!blob.size) {
        throw new Error("La réponse audio est vide.");
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
        console.error("Erreur de lecture audio.");
      };

      setAudio(newAudio);
      setAudioUrl(url);

      await newAudio.play();
    } catch (error) {
      console.error(error);
      setIsPlayingAudio(false);
      alert("Impossible de lancer la lecture IA.");
    }
  }

  async function handleStartReading() {
    try {
      if (isRecording) return;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setRecordedAudioBlob(blob);
        setIsRecording(false);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setRecordedAudioBlob(null);
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error(error);
      alert("Impossible d’accéder au microphone.");
    }
  }

  function handleStopReading() {
    if (!mediaRecorder || !isRecording) return;
    mediaRecorder.stop();
    setMediaRecorder(null);
  }

  async function handleAnalyzePronunciation() {
    try {
      if (!recordedAudioBlob) {
        alert("Veuillez d’abord enregistrer votre lecture.");
        return;
      }

      const formData = new FormData();
      formData.append("audio", recordedAudioBlob, "reading.webm");
      formData.append("text", article.text);

      const response = await fetch("/api/analyze-pronunciation", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("analyze-pronunciation failed:", errorText);
        throw new Error("Échec de l’analyse de la prononciation.");
      }

      const data = await response.json();

      console.log("Pronunciation analysis payload:", data);
      console.log("Summary received:", data.summary);
      console.log("Weak points received:", data.weakPoints);

      setPronunciationSummary(data.summary ?? null);
      setPronunciationScore(data.score ?? null);
      setPronunciationWeakPoints(data.weakPoints || []);

      const newWords = (data.weakPoints || []).map(
        (item: { word: string }) => item.word
      );

      setLearningWords((prev) => {
        const merged = [...prev, ...newWords];
        return [...new Set(merged)];
      });

      alert("Analyse de la prononciation reçue.");
      console.log("Transcript:", data.transcript);
    } catch (error) {
      console.error(error);
      alert("Impossible d’analyser la prononciation.");
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
          seed: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error("Échec de la génération du texte.");
      }

      const data = await response.json();

      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      setAudio(null);
      setAudioUrl(null);
      setIsPlayingAudio(false);

      setRecordedAudioBlob(null);
      setIsRecording(false);
      setMediaRecorder(null);

      setArticle({
        title: data.title,
        source: data.source,
        level: data.level,
        text: data.text,
      });

      setSelectedWord(null);
      setSelectedWordKey(null);
      setPronunciationSummary(null);
      setPronunciationScore(null);
      setPronunciationWeakPoints([]);
    } catch (error) {
      console.error(error);
      alert("Impossible de générer le texte.");
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
        readingSpeed={readingSpeed}
        onReadingSpeedChange={setReadingSpeed}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div>
          <ArticleTextPanel
            article={article}
            selectedWord={selectedWordKey}
            onWordClick={handleAnalyzeWord}
            weakWords={pronunciationWeakPoints.map((item) => item.word)}
          />
        </div>

        <div>
          <WordInsightPanel selectedWord={selectedWord ?? fallbackInsight} />
        </div>
      </div>

      <ReadingControls
        isRecording={isRecording}
        hasRecording={!!recordedAudioBlob}
        onStartReading={handleStartReading}
        onStopReading={handleStopReading}
        onAnalyzePronunciation={handleAnalyzePronunciation}
      />

      <div className="mt-6 space-y-6">
        {pronunciationScore && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs text-slate-500">Évaluation générale</div>
              <div className="text-2xl font-bold">
                {pronunciationScore.overall}/100
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs text-slate-500">Prononciation</div>
              <div className="text-2xl font-bold">
                {pronunciationScore.pronunciation}/100
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs text-slate-500">Fluidité</div>
              <div className="text-2xl font-bold">
                {pronunciationScore.fluency}/100
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs text-slate-500">Intonation</div>
              <div className="text-2xl font-bold">
                {pronunciationScore.intonation}/100
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <PronunciationSummary summary={pronunciationSummary} />
          <WeakPointsPanel weakPoints={pronunciationWeakPoints} />
        </div>
      </div>
    </AppShell>
  );
}