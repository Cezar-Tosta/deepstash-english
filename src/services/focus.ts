import { db } from '../data/db';
import { toISODate } from '../domain/dates';
import { hardest, hardestVerbs, studyItems } from '../domain/exercises';
import { type Correction, collectCorrections } from '../domain/feedback';
import { type Period, periodOf, periods } from '../domain/periods';
import type { ISODate } from '../domain/types';
import { getCycleStarts } from './cycles';

const MAX_TERMS = 10;

export interface FocusCorrection extends Correction {
  date: ISODate;
}

export interface FocusCycle {
  /** O ciclo em que as correções aconteceram; null para as feitas entre ciclos. */
  period: Period | null;
  corrections: FocusCorrection[];
}

/** Tudo o que os estudos mostraram de mais crítico, juntando todos os ciclos. */
export interface FocusData {
  /** As correções da IA, uma por texto, da mais recente para a mais antiga. */
  corrections: FocusCorrection[];
  /** As mesmas correções, por ciclo, do mais recente para o mais antigo. */
  cycles: FocusCycle[];
  hardTerms: { term: string; meaning: string; right: number; wrong: number }[];
  hardVerbs: { base: string; right: number; wrong: number }[];
  /** Chunks mais esquecidos nas revisões ("não lembrei" ou "difícil"). */
  forgotten: { text: string; meaning: string; missed: number }[];
}

export function isFocusEmpty(data: FocusData): boolean {
  return data.corrections.length + data.hardTerms.length + data.hardVerbs.length + data.forgotten.length === 0;
}

export async function loadFocusData(): Promise<FocusData> {
  const starts = await getCycleStarts();
  const [feedback, vocab, chunks, stats, reviews, verbs] = await Promise.all([
    db.aiFeedback.toArray(),
    db.vocab.toArray(),
    db.chunks.toArray(),
    db.practiceStats.toArray(),
    db.reviews.toArray(),
    db.verbs.toArray(),
  ]);

  const corrections = collectCorrections(feedback)
    .map((c): FocusCorrection => ({ ...c, date: toISODate(new Date(c.at)) }))
    .sort((a, b) => b.at.localeCompare(a.at));

  const all = periods(starts);
  const byStart = new Map<string, FocusCorrection[]>();
  for (const correction of corrections) {
    const key = periodOf(starts, correction.date)?.start ?? '';
    byStart.set(key, [...(byStart.get(key) ?? []), correction]);
  }
  const cycles: FocusCycle[] = [...byStart]
    .map(([start, list]) => ({ period: all.find((p) => p.start === start) ?? null, corrections: list }))
    .sort((a, b) => (b.period?.start ?? '').localeCompare(a.period?.start ?? ''));

  const missed = new Map<string, number>();
  for (const review of reviews) {
    if (review.rating === 'AGAIN' || review.rating === 'HARD') missed.set(review.chunkId, (missed.get(review.chunkId) ?? 0) + 1);
  }
  const chunkById = new Map(chunks.map((c) => [c.id, c]));

  return {
    corrections,
    cycles,
    hardTerms: hardest(studyItems({ vocab, chunks, stats, reviews, verbs }), MAX_TERMS).map((i) => ({
      term: i.term,
      meaning: i.meaning,
      right: i.right,
      wrong: i.wrong,
    })),
    hardVerbs: hardestVerbs(verbs, stats, MAX_TERMS),
    forgotten: [...missed]
      .flatMap(([id, count]) => {
        const chunk = chunkById.get(id);
        return chunk ? [{ text: chunk.text, meaning: chunk.meaning, missed: count }] : [];
      })
      .sort((a, b) => b.missed - a.missed || a.text.localeCompare(b.text))
      .slice(0, MAX_TERMS),
  };
}
