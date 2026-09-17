"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ReadingPlaybackSession } from "@/lib/reading-playback";
import { PronunciationSession } from "@/lib/pronunciation-session";
import { CONTENT_LABELS, CONTENT_TYPES, ContentDocument, EffectiveType, generatedDocument, validateDocument } from "@/lib/content-document";
import { importDocument } from "@/lib/smart-import";
import { VocabularySession, sentenceAt } from "@/lib/vocabulary-session";
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
  level: "B1",
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

export default function Page() {
  const [vocabulary] = useState(() => new VocabularySession());
  const [selectedOffset, setSelectedOffset] = useState(0);
  const [selectedWord, setSelectedWord] = useState<WordInsight | null>(null);
  const [selectedWordKey, setSelectedWordKey] = useState<string | null>(null);

  const [playback] = useState(() => new ReadingPlaybackSession());
  const [pronunciation] = useState(() => new PronunciationSession(undefined, playback.beginMicrophoneCapture));
  const playbackState = useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot);
  const pronunciationState = useSyncExternalStore(pronunciation.subscribe, pronunciation.getSnapshot, pronunciation.getSnapshot);
  const articleRequest = useRef<AbortController | null>(null);
  const isRecording = pronunciationState.status === "recording";
  const recordingBusy = pronunciation.isBusy();

  const [contentType, setContentType] = useState("news");
  const [level, setLevel] = useState("B1");
  const [readingSpeed, setReadingSpeed] = useState("normal");

  const [article, setArticle] = useState<ContentDocument>(() => generatedDocument(initialArticle, "news", "B1", "demo"));
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
    fluency: number | null;
    intonation: number | null;
  } | null>(null);

  const [pronunciationWeakPoints, setPronunciationWeakPoints] = useState<
    { word: string; note: string; severity: "low" | "medium" | "high" }[]
  >([]);

  const [learningWords, setLearningWords] = useState<string[]>([]);

  useEffect(() => () => {
    articleRequest.current?.abort();
    vocabulary.cancel();
    playback.stop();
    pronunciation.reset();
  }, [playback, pronunciation, vocabulary]);

  useEffect(() => {
    const feedback = pronunciationState.feedback;
    setPronunciationSummary(feedback?.summary ?? null);
    setPronunciationScore(feedback?.score ?? null);
    setPronunciationWeakPoints(feedback?.weakPoints ?? []);
    if (feedback) {
      setLearningWords((previous) => [...new Set([...previous, ...feedback.weakPoints.map((item) => item.word)])]);
    }
  }, [pronunciationState.feedback]);

  const analysisText = article.text;

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
        "Analyse du mot dans la phrase sélectionnée…",
      sentence: sentenceAt(analysisText, selectedOffset) || "—",
      francePronunciation: "À venir",
      quebecPronunciation: "À venir",
    };
  }, [selectedWordKey, analysisText, selectedOffset]);

  function countWords(text: string) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function handleImportText() {
    let document: ContentDocument;
    try { document = importDocument(importedText, crypto.randomUUID()); }
    catch (error) { alert(error instanceof Error ? error.message : "Import impossible."); return; }
    articleRequest.current?.abort();
    articleRequest.current = null;
    setIsGenerating(false);
    playback.stop();
    pronunciation.reset();
    vocabulary.cancel();
    setArticle(document);

    setSelectedWord(null);
    setSelectedWordKey(null);
    setPronunciationSummary(null);
    setPronunciationScore(null);
    setPronunciationWeakPoints([]);

    setImportedText("");
    setShowImportBox(false);
  }

  async function handleAnalyzeWord(rawWord: string, offset: number) {
    const cleaned = normalizeWord(rawWord);
    if (!cleaned) return;
    setSelectedWord(null); setSelectedWordKey(cleaned); setSelectedOffset(offset);
    const result = await vocabulary.analyze(article, cleaned, offset);
    if (result) setSelectedWord(result);
  }

  function handleReinterpret(type: EffectiveType) {
    if (article.origin !== "imported") return;
    try {
      const document = importDocument(article.originalText, article.documentId, type, article.revision + 1);
      articleRequest.current?.abort(); articleRequest.current = null; setIsGenerating(false);
      playback.stop(); pronunciation.reset(); vocabulary.cancel();
      setSelectedWord(null); setSelectedWordKey(null); setArticle(document);
    } catch { alert("Impossible de réinterpréter ce texte."); }
  }

  function handleStopPlayback() {
    playback.stop();
  }

  function handlePlayAudio() {
    if (pronunciation.isBusy()) return;
    if (playback.getSnapshot().busy) handleStopPlayback();
    else {
      void playback.start(article.text, readingSpeed, article);
    }
  }

  function handlePractise(itemId: string) {
    if (pronunciation.isBusy()) return;
    if (playback.theatre.enterPractice(itemId)) {
      pronunciation.reset();
      vocabulary.cancel();
      setSelectedWord(null);
      setSelectedWordKey(null);
    }
  }

  function handleFinishPractice() {
    if (pronunciation.isBusy()) return;
    pronunciation.reset();
    playback.theatre.finishPractice();
    vocabulary.cancel();
    setSelectedWord(null);
    setSelectedWordKey(null);
  }

  function handleReplay() {
    if (!pronunciation.isBusy()) playback.theatre.replay();
  }

  function handleStartReading() {
    if (pronunciation.isBusy()) return;
    const target = playback.theatre.getSnapshot().practiceTarget;
    void pronunciation.start(target ? {
      documentId: article.documentId, revision: article.revision, text: target.text, itemId: target.itemId,
      speaker: target.speaker, sessionId: target.sessionId,
    } : { text: article.text, documentId: article.documentId, revision: article.revision });
  }

  function handleStopReading() { pronunciation.stop(); }
  function handleAnalyzePronunciation() { void pronunciation.analyze(); }
  async function handleGenerateArticle() {
    articleRequest.current?.abort();
    const request = new AbortController();
    articleRequest.current = request;
    vocabulary.cancel();
    setSelectedWord(null); setSelectedWordKey(null);
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

      validateDocument(data);
      if (data.origin !== "generated" || data.typeSource !== "generated" || data.contentType !== contentType || data.level !== level)
        throw new Error("Identité du texte généré invalide.");
      vocabulary.cancel();
      setArticle(data);

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

      <section className="mb-4 text-sm text-slate-600" aria-label="Identité du texte">
        <p>Texte actuel : {CONTENT_LABELS[article.contentType]} · Niveau : {article.level ?? "non évalué"} ·
          {({ generated: " Type choisi à la génération", detected: " Type détecté", "learner-override": " Choix manuel", unknown: " Genre incertain" })[article.typeSource]}</p>
        {article.origin === "imported" && <>
          <label>Réinterpréter ce texte : <select aria-label="Type du texte importé" value={article.contentType}
            onChange={e => handleReinterpret(e.target.value as EffectiveType)}>
            {(["unknown", ...CONTENT_TYPES] as EffectiveType[]).map(type => <option key={type} value={type}>{CONTENT_LABELS[type]}</option>)}
          </select></label>
          <p>Confiance : {({ high: "élevée", medium: "moyenne", low: "faible" })[article.detection.confidence]} ·
            Genres possibles : {article.detection.candidates.map(type => CONTENT_LABELS[type]).join(", ")}</p>
          <details><summary>Source et préparation du texte ({article.normalization.length} ajustements)</summary>
            <p>{article.detection.evidence.join(" · ")}</p>
            {article.normalization.map((a, i) => <p key={i}>Lignes {a.originalLines.join(", ")} : {a.detail}</p>)}
            {article.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
            <pre className="whitespace-pre-wrap">{article.originalText}</pre>
          </details>
        </>}
        <p className="mt-2">Les sélecteurs de type et de niveau ci-dessous concernent le prochain texte généré.</p>
      </section>
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
      {article.contentType === "theatre" && playbackState.mode !== "theatre" && <section className="mb-4 rounded-xl border p-4">
        <h2>Lecture théâtrale</h2>
        <p>Lancez la lecture IA pour préparer les voix. Pause, reprise, réécoute et pratique des répliques seront ensuite disponibles.</p>
      </section>}
      {article.contentType === "theatre" && playbackState.mode === "theatre" && <TheatreControls
        ambience={playbackState.ambience}
        onAmbienceChange={(level) => playback.setAmbienceLevel(level)}
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
        <span>Textes courts acceptés · maximum 60 000 caractères</span>
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
        {pronunciationScore && <div className="rounded-xl border bg-white p-4">
          <p>Correspondance estimée entre transcription et texte : {pronunciationScore.overall}/100</p>
          <p className="text-sm text-slate-600">La reconnaissance vocale peut se tromper. Ce résultat ne mesure ni les sons, ni la fluidité, ni l’intonation.</p>
        </div>}

        <div className="grid gap-6 lg:grid-cols-2">
          <PronunciationSummary summary={pronunciationSummary} />
          <WeakPointsPanel weakPoints={pronunciationWeakPoints} />
        </div>
      </div>
    </AppShell>
  );
}
