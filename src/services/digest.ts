import { db } from '../data/db';
import { toISODate } from '../domain/dates';
import { type Correction, collectCorrections } from '../domain/feedback';
import { hardest, hardestVerbs, locateTerm, studyItems } from '../domain/exercises';
import type { AIFeedback, ISODate } from '../domain/types';

/** Quantos itens de cada tipo entram no resumo: o bastante para orientar, sem virar lista. */
const MAX_CORRECTIONS = 12;
const MAX_TERMS = 6;

export interface DigestTerm {
  term: string;
  meaning: string;
  right: number;
  wrong: number;
}

/** O que o dia mostrou que precisa de estudo: correções da IA, erros nos exercícios e revisões esquecidas. */
export interface DayDigest {
  date: ISODate;
  /** Retornos da IA de hoje em que houve correção de fato. */
  corrections: Correction[];
  /** Retornos de hoje em que o texto já estava certo. */
  cleanFeedback: number;
  /** Termos do dicionário e chunks em que o usuário mais erra nos exercícios. */
  hardTerms: DigestTerm[];
  hardVerbs: { base: string; right: number; wrong: number }[];
  /** Chunks que o usuário não lembrou (ou achou difícil) nas revisões de hoje. */
  forgotten: { text: string; meaning: string }[];
  /** Chunks de hoje que não apareceram em nenhuma fala transcrita. Vazio se não houve transcrição. */
  unusedChunks: string[];
}

export function isDigestEmpty(digest: DayDigest): boolean {
  return (
    digest.corrections.length + digest.hardTerms.length + digest.hardVerbs.length + digest.forgotten.length + digest.unusedChunks.length ===
    0
  );
}

/** Um retorno pertence ao dia se foi pedido naquela data ou se é sobre algo escrito ou falado na sessão. */
function fromSession(feedback: AIFeedback, date: ISODate, targets: ReadonlySet<string>): boolean {
  return targets.has(feedback.targetId) || toISODate(new Date(feedback.createdAt)) === date;
}

export async function loadDayDigest(sessionId: string): Promise<DayDigest | null> {
  const session = await db.sessions.get(sessionId);
  if (!session) return null;
  const [ideas, chunks, speaking, reflections, feedback, reviews, vocab, allChunks, stats, allReviews, verbs] = await Promise.all([
    db.ideas.where('sessionId').equals(sessionId).toArray(),
    db.chunks.where('sessionId').equals(sessionId).toArray(),
    db.speaking.where('date').equals(session.date).toArray(),
    db.reflections.where('sessionId').equals(sessionId).toArray(),
    db.aiFeedback.toArray(),
    db.reviews.where('completedDate').equals(session.date).toArray(),
    db.vocab.toArray(),
    db.chunks.toArray(),
    db.practiceStats.toArray(),
    db.reviews.toArray(),
    db.verbs.toArray(),
  ]);

  const targets = new Set<string>([...ideas, ...chunks, ...speaking, ...reflections].map((x) => x.id));
  targets.add(sessionId);
  const today = feedback.filter((f) => fromSession(f, session.date, targets)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const corrections = collectCorrections(today).slice(-MAX_CORRECTIONS);

  const chunkById = new Map(allChunks.map((c) => [c.id, c]));
  const forgottenIds = new Set(reviews.filter((r) => r.rating === 'AGAIN' || r.rating === 'HARD').map((r) => r.chunkId));
  const transcripts = speaking.map((s) => s.transcript ?? '').filter((t) => t.trim());

  return {
    date: session.date,
    corrections,
    cleanFeedback: new Set(today.map((f) => `${f.targetType}:${f.targetId}`)).size - corrections.length,
    hardTerms: hardest(studyItems({ vocab, chunks: allChunks, stats, reviews: allReviews, verbs }), MAX_TERMS).map((i) => ({
      term: i.term,
      meaning: i.meaning,
      right: i.right,
      wrong: i.wrong,
    })),
    hardVerbs: hardestVerbs(verbs, stats, MAX_TERMS),
    forgotten: [...forgottenIds].flatMap((id) => {
      const chunk = chunkById.get(id);
      return chunk ? [{ text: chunk.text, meaning: chunk.meaning }] : [];
    }),
    unusedChunks: transcripts.length === 0 ? [] : chunks.filter((c) => !transcripts.some((t) => locateTerm(t, c.text))).map((c) => c.text),
  };
}
