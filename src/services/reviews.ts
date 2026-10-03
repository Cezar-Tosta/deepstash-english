import { db } from '../data/db';
import { isDue } from '../domain/chunks';
import { addDays, nowISO, today } from '../domain/dates';
import { newId } from '../domain/ids';
import { scheduler } from '../domain/srs';
import type { Chunk, ChunkReview, Idea, ISODate, Rating } from '../domain/types';
import { DomainError } from './errors';

export interface DueItem {
  chunk: Chunk;
  sourceIdea: Idea | null;
  /** Última frase que o usuário criou numa revisão, se houver. */
  lastReviewSentence: string;
}

/** Chunks com revisão para hoje ou atrasada, os mais atrasados primeiro. */
export async function getDueChunks(date: ISODate = today()): Promise<Chunk[]> {
  const candidates = await db.chunks.where('nextReviewDate').belowOrEqual(date).toArray();
  return candidates
    .filter((c) => isDue(c, date))
    .sort(
      (a, b) =>
        (a.nextReviewDate ?? '').localeCompare(b.nextReviewDate ?? '') ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

export async function getDueItems(date: ISODate = today()): Promise<DueItem[]> {
  const chunks = await getDueChunks(date);
  return Promise.all(
    chunks.map(async (chunk): Promise<DueItem> => {
      const reviews = await db.reviews.where('chunkId').equals(chunk.id).sortBy('createdAt');
      const lastWithSentence = reviews.reverse().find((r) => r.userSentence);
      return {
        chunk,
        sourceIdea: chunk.sourceIdeaId ? ((await db.ideas.get(chunk.sourceIdeaId)) ?? null) : null,
        lastReviewSentence: lastWithSentence?.userSentence ?? '',
      };
    }),
  );
}

/** Registra a tentativa (sem nunca apagar as anteriores) e reagenda o chunk. */
export function rateChunk(
  chunkId: string,
  rating: Rating,
  userSentence = '',
  date: ISODate = today(),
): Promise<ChunkReview> {
  return db.transaction('rw', db.chunks, db.reviews, async () => {
    const chunk = await db.chunks.get(chunkId);
    if (!chunk) throw new DomainError('Expressão não encontrada.');
    if (chunk.nextReviewDate === null) {
      throw new DomainError('Esta expressão não tem revisão agendada.');
    }
    const review: ChunkReview = {
      id: newId(),
      chunkId,
      scheduledDate: chunk.nextReviewDate,
      completedDate: date,
      stage: chunk.stage,
      rating,
      userSentence: userSentence.trim(),
      createdAt: nowISO(),
    };
    await db.reviews.add(review);
    const next = scheduler.next(chunk, rating, date);
    await db.chunks.update(chunkId, { stage: next.stage, nextReviewDate: next.nextReviewDate, status: next.status });
    return review;
  });
}

/** "Já consigo usar espontaneamente": tira o chunk da revisão ativa sem perder o histórico. */
export async function retireChunk(chunkId: string): Promise<void> {
  await db.chunks.update(chunkId, { status: 'retired', nextReviewDate: null });
}

/** Devolve o chunk à revisão, a partir de amanhã, no estágio em que estava. */
export async function reactivateChunk(chunkId: string, date: ISODate = today()): Promise<void> {
  const chunk = await db.chunks.get(chunkId);
  if (!chunk) return;
  const lastStage = scheduler.plan(chunk.createdDate).length - 1;
  await db.chunks.update(chunkId, {
    status: 'learning',
    stage: Math.min(chunk.stage, lastStage),
    nextReviewDate: addDays(date, 1),
  });
}

export interface UpcomingDay {
  date: ISODate;
  inDays: number;
  count: number;
}

/** Revisões já agendadas para os próximos `days` dias (sem contar hoje). */
export async function getUpcoming(date: ISODate = today(), days = 30): Promise<UpcomingDay[]> {
  const chunks = await db.chunks
    .where('nextReviewDate')
    .between(addDays(date, 1), addDays(date, days), true, true)
    .toArray();
  const counts = new Map<ISODate, number>();
  for (const c of chunks) {
    if (c.nextReviewDate) counts.set(c.nextReviewDate, (counts.get(c.nextReviewDate) ?? 0) + 1);
  }
  const result: UpcomingDay[] = [];
  for (let i = 1; i <= days; i += 1) {
    const d = addDays(date, i);
    const count = counts.get(d);
    if (count) result.push({ date: d, inDays: i, count });
  }
  return result;
}
