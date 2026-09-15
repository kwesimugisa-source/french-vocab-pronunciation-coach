"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ReadingPlaybackSession } from "@/lib/reading-playback";
import { PronunciationSession } from "@/lib/pronunciation-session";
import { getWordInsight } from "@/lib/getWordInsight";
import ArticleHeader from "@/components/article-reader/ArticleHeader";
import ArticleTextPanel from "@/components/article-reader/ArticleTextPanel";
import ReadingControls from "@/components/article-reader/ReadingControls";
import ReadingSetupBar from "@/components/article-reader/ReadingSetupBar";
import TheatreControls from "@/components/article-reader/TheatreControls";
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

  const [playback] = useState(() => new ReadingPlaybackSession());
  const [pronunciation] = useState(() => new PronunciationSession());
  const playbackState = useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot);
  const pronunciationState = useSyncExternalStore(pronunciation.subscribe, pronunciation.getSnapshot, pronunciation.getSnapshot);
  const articleRequest = useRef<AbortController | null>(null);
  const isRecording = pronunciationState.status === "recording";
  const recordingBusy = pronunciation.isBusy();

  const [contentType, setContentType] = useState("news");
  const [level, setLevel] = useState("B1");
  const [readingSpeed, setReadingSpeed] = useState("normal");

  const [article, setArticle] = useState<ArticleData>(initialArticle);
  const [isGenerating, setIsGenerating] = useState(false);

  const [showImportBox, setShowImportBox] = useState(false);
  const [importedText, setImportedText] = useState("");

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

  useEffect(() => () => {
    articleRequest.current?.abort();
    playback.stop();
    pronunciation.reset();
  }, [playback, pronunciation]);

  useEffect(() => {
    const feedback = pronunciationState.feedback;
    setPronunciationSummary(feedback?.summary ?? null);
    setPronunciationScore(feedback?.score ?? null);
    setPronunciationWeakPoints(feedback?.weakPoints ?? []);
    if (feedback) {
      setLearningWords((previous) => [...new Set([...previous, ...feedback.weakPoints.map((item) => item.word)])]);
    }
  }, [pronunciationState.feedback]);

  const analysisText = playbackState.theatre.practiceTarget?.text ?? article.text;

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
      sentence: findSentenceForWord(analysisText, selectedWordKey) || "—",
      francePronunciation: "À venir",
      quebecPronunciation: "À venir",
    };
  }, [selectedWordKey, analysisText]);

  function countWords(text: string) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function handleImportText() {
    const wordCount = countWords(importedText);

    if (wordCount < 50 || wordCount > 2500) {
      alert("Le texte doit contenir entre 50 et 2 500 mots.");
      return;
    }

    articleRequest.current?.abort();
    articleRequest.current = null;
    setIsGenerating(false);
    playback.stop();
    pronunciation.reset();
    setArticle({
      title: "Texte importé",
      source: "Utilisateur",
      level: "Personnalisé",
      text: importedText.trim(),
    });

    setSelectedWord(null);
    setSelectedWordKey(null);
    setPronunciationSummary(null);
    setPronunciationScore(null);
    setPronunciationWeakPoints([]);

    setImportedText("");
    setShowImportBox(false);
  }

  async function handleAnalyzeWord(rawWord: string) {
    const cleaned = normalizeWord(rawWord);
    if (!cleaned) return;

    const sentence = findSentenceForWord(analysisText, cleaned) || "—";

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

  function handleStopPlayback() {
    playback.stop();
    pronunciation.reset();
  }

  function handlePlayAudio() {
    if (pronunciation.isBusy()) return;
    if (playback.getSnapshot().busy) handleStopPlayback();
    else {
      pronunciation.reset();
      void playback.start(article.text, readingSpeed);
    }
  }

  function handlePractise(itemId: string) {
    if (pronunciation.isBusy()) return;
    if (playback.theatre.enterPractice(itemId)) {
      pronunciation.reset();
      setSelectedWord(null);
      setSelectedWordKey(null);
    }
  }

  function handleFinishPractice() {
    if (pronunciation.isBusy()) return;
    pronunciation.reset();
    playback.theatre.finishPractice();
    setSelectedWord(null);
    setSelectedWordKey(null);
  }

  function handleReplay() {
    if (!pronunciation.isBusy()) playback.theatre.replay();
  }

  function handleStartReading() {
    if (pronunciation.isBusy()) return;
    const target = playback.theatre.getSnapshot().practiceTarget;
    playback.theatre.pause();
    void pronunciation.start(target ? {
      text: target.text, itemId: target.itemId,
      speaker: target.speaker, sessionId: target.sessionId,
    } : { text: article.text });
  }

  function handleStopReading() { pronunciation.stop(); }
  function handleAnalyzePronunciation() { void pronunciation.analyze(); }
  async function handleGenerateArticle() {
    articleRequest.current?.abort();
    const request = new AbortController();
    articleRequest.current = request;
    playback.stop();
    pronunciation.reset();
    try {
      setIsGenerating(true);

      const response = await fetch("/api/generate-article", {
        signal: request.signal,
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

      if (articleRequest.current !== request || request.signal.aborted) return;
      playback.stop();
      pronunciation.reset();

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
      if (!request.signal.aborted) alert("Impossible de générer le texte.");
    } finally {
      if (articleRequest.current === request) {
        articleRequest.current = null;
        setIsGenerating(false);
      }
    }
  }

  return (
    <AppShell>
      <ArticleHeader article={article} />

      <ReadingSetupBar
        contentType={contentType}
        level={level}
        isPlayingAudio={playbackState.busy}
        audioLabel={playbackState.mode === "pending" && playbackState.busy ? "Annuler la préparation audio" : undefined}
        audioDisabled={recordingBusy || isGenerating}
        isGenerating={isGenerating}
        onContentTypeChange={setContentType}
        onLevelChange={setLevel}
        onPlayAudio={handlePlayAudio}
        onGenerateArticle={handleGenerateArticle}
        readingSpeed={readingSpeed}
        onReadingSpeedChange={setReadingSpeed}
      />
      {playbackState.error && <p role="alert" className="mb-4 text-sm text-red-700">{playbackState.error}</p>}
      {playbackState.mode === "theatre" && <TheatreControls
        playback={playbackState.theatre}
        recordingBusy={recordingBusy}
        onPause={() => playback.theatre.pause()}
        onResume={() => { if (!pronunciation.isBusy()) playback.theatre.resume(); }}
        onReplay={handleReplay}
        onStop={handleStopPlayback}
        onPractise={handlePractise}
        onFinishPractice={handleFinishPractice}
      />}
<div className="mb-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
  <button
    type="button"
    onClick={() => setShowImportBox((value) => !value)}
    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
  >
    {showImportBox ? "Fermer l’importation" : "Importer un texte"}
  </button>

  {showImportBox && (
    <div className="mt-4 space-y-3">
      <textarea
        value={importedText}
        onChange={(e) => setImportedText(e.target.value)}
        placeholder="Collez ici votre texte en français..."
        className="min-h-[220px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-500"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <span>{countWords(importedText)} / 2 500 mots</span>
        <span>Minimum : 50 mots</span>
      </div>

      <button
        type="button"
        onClick={handleImportText}
        className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:opacity-90"
      >
        Charger le texte
      </button>
    </div>
  )}
</div>
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
        hasRecording={!!pronunciationState.recording}
        isBusy={recordingBusy}
        isAnalyzing={pronunciationState.status === "analyzing"}
        targetLabel={playbackState.theatre.practiceTarget
          ? `Pratique — ${playbackState.theatre.practiceTarget.speaker}, réplique ${playbackState.theatre.practiceTarget.index + 1}`
          : undefined}
        statusMessage={pronunciationState.status === "requesting-microphone" ? "Autorisation du microphone en attente…"
          : pronunciationState.status === "stopping" ? "Finalisation de l’enregistrement…"
          : pronunciationState.status === "analyzing" ? "Analyse de votre enregistrement…"
          : pronunciationState.status === "analyzed" ? "Analyse terminée. Vous pouvez enregistrer un nouvel essai."
          : undefined}
        error={pronunciationState.error}
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
