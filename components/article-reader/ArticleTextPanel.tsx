import type { PracticeUnit } from "@/lib/practice-units";
import { useMemo } from "react";
import { parseTheatreItems } from "@/lib/theatre";
import { isChorusSpeaker } from "@/lib/theatre-speakers";
import { textBlocks } from "@/lib/vocabulary-session";
import type { ArticleData } from "@/lib/types";

type Props = {
  practiceUnits?: PracticeUnit[]; selectedUnitId?: string; onSelectUnit?: (id: string) => void;
  article: ArticleData & { contentType?: string };
  activeItemId?: string;
  practiceItemId?: string;
  onWordClick: (word: string, offset: number) => void;
  selectedWord: string | null;
  weakWords?: string[];
};

function normalizeWord(word: string) {
  return word
    .toLowerCase()
    .trim()
    .replace(/^[^a-zàâçéèêëîïôûùüÿñæœ'-]+|[^a-zàâçéèêëîïôûùüÿñæœ'-]+$/gi, "");
}

export default function ArticleTextPanel({
  article, activeItemId, practiceItemId, practiceUnits, selectedUnitId, onSelectUnit,
  onWordClick,
  selectedWord,
  weakWords = [],
}: Props) {
  const normalizedSelectedWord = selectedWord ? normalizeWord(selectedWord) : null;
  const weakWordSet = new Set(weakWords.map(normalizeWord).filter(Boolean));

  const items = useMemo(() => article.contentType === "theatre" ? parseTheatreItems(article.text) : [], [article.text, article.contentType]);
  const renderWords = (text: string, start: number) => {
    let offset = start;
    return text.split(/(\s+)/u).map((part, i) => {
      const at = offset; offset += part.length;
      if (!part || /^\s+$/u.test(part)) return part;
      const cleaned = normalizeWord(part), selected = cleaned && cleaned === normalizedSelectedWord;
      return <button key={i} type="button" onClick={() => onWordClick(part, at)}
        className={`reading-word inline rounded px-0.5 text-left transition hover:bg-amber-100 ${selected ? "bg-amber-200 font-medium text-slate-900" : weakWordSet.has(cleaned) ? "bg-rose-100 font-medium text-rose-700 ring-1 ring-rose-200" : ""}`}>{part}</button>;
    });
  };
  const rows = useMemo(() => {
    const byLine = new Map(items.flatMap(item => item.sourceLines.map(line => [line, item] as const)));
    let lineOffset = 0;
    return article.text.split("\n").map((text, index) => {
      const offset = lineOffset; lineOffset += text.length + 1;
      return { text, offset, item: byLine.get(index + 1) };
    });
  }, [article.text, items]);
  return <section aria-label="Texte à lire" className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="mb-5 border-b border-slate-100 pb-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Lire et explorer</p>
      <h2 className="text-xl font-semibold text-slate-900">{article.title}</h2>
      <p className="mt-2 text-sm text-slate-600">Cliquez sur un mot pour explorer son sens. Vous pouvez aussi le sélectionner au clavier.</p>
    </div>
    <div className="mx-auto max-w-[68ch] break-words text-base leading-8 text-slate-700">
      {practiceUnits ? <div className="whitespace-pre-wrap">{practiceUnits.map((unit, index) => <span key={unit.id}>
        {renderWords(article.text.slice(index ? practiceUnits[index - 1].end : 0, unit.start), index ? practiceUnits[index - 1].end : 0)}
        <span className={unit.id === selectedUnitId ? "rounded bg-amber-50 ring-2 ring-amber-500" : ""} data-practice-unit={unit.id}>
          <button type="button" aria-label={`Pratiquer l’unité ${index + 1}`} aria-pressed={unit.id === selectedUnitId}
            onClick={() => onSelectUnit?.(unit.id)} className="mr-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-xs font-semibold">{index + 1}</button>
          {renderWords(unit.text, unit.start)}
        </span>
        {index === practiceUnits.length - 1 && renderWords(article.text.slice(unit.end), unit.end)}
      </span>)}</div> : article.contentType === "theatre" ? <div className="space-y-3">{rows.map(({text,offset,item},index)=>{
        if (!text.trim()) return null;
        const label = item?.type === "stage" ? undefined : text.match(/^\s*[^:：]{1,40}[:：]\s*/u)?.[0];
        const chorus = item ? isChorusSpeaker(item.speaker) : isChorusSpeaker(text.replace(/[:：]\s*$/u,""));
        const active = !!item && item.id === activeItemId, practice = !!item && item.id === practiceItemId;
        return <div key={index} data-item-id={item?.id} aria-current={active ? "true" : undefined}
          className={`rounded-xl border-l-4 px-3 py-2 sm:px-4 ${practice ? "border-amber-600 bg-amber-50" : active ? "border-emerald-700 bg-emerald-50" : chorus ? "border-slate-500 bg-slate-100" : item?.type === "stage" ? "border-transparent bg-slate-50 text-sm italic text-slate-600" : "border-slate-200"}`}>
          {(active || practice) && <p className="text-xs font-semibold not-italic">{practice ? "Réplique en pratique" : "Point d’écoute"}</p>}
          {chorus && <p className="text-xs font-semibold uppercase tracking-widest">Chœur · ensemble</p>}
          {item?.type === "stage" && <span className="sr-only">Didascalie. </span>}
          <p className="whitespace-pre-wrap">{label ? <><strong className="mb-1 block text-xs font-bold not-italic uppercase tracking-wider text-slate-900">{renderWords(label,offset)}</strong>{renderWords(text.slice(label.length),offset+label.length)}</> : renderWords(text,offset)}</p>
        </div>;
      })}</div> : <div className="space-y-6">{textBlocks(article.text).map((block,index)=><p key={index} className="whitespace-pre-line">{block.map(({word,offset},i)=><span key={i}>{renderWords(word,offset)}</span>)}</p>)}</div>}
    </div>
  </section>;
}
