import { diffDays } from './dates';
import type { Chunk, ChunkReview, ISODate } from './types';

export type ChunkFilter = 'all' | 'new' | 'learning' | 'due' | 'learned' | 'difficult';

export function isActive(chunk: Chunk): boolean {
  return chunk.status === 'new' || chunk.status === 'learning';
}

export function isDue(chunk: Chunk, today: ISODate): boolean {
  return isActive(chunk) && chunk.nextReviewDate !== null && chunk.nextReviewDate <= today;
}

/** Dias de atraso; 0 quando a revisão é de hoje ou ainda está no futuro. */
export function overdueDays(chunk: Chunk, today: ISODate): number {
  if (!isDue(chunk, today) || chunk.nextReviewDate === null) return 0;
  return Math.max(0, diffDays(chunk.nextReviewDate, today));
}

export interface RecallCount {
  recalled: number;
  missed: number;
}

/** DIFÍCIL ainda é uma recuperação bem-sucedida; só AGAIN conta como erro. */
export function countRecall(reviews: readonly ChunkReview[]): RecallCount {
  let recalled = 0;
  let missed = 0;
  for (const r of reviews) {
    if (r.rating === 'AGAIN') missed += 1;
    else recalled += 1;
  }
  return { recalled, missed };
}

/** Difícil: esqueceu duas vezes ou mais, ou a última tentativa foi AGAIN/HARD. */
export function isDifficult(chunk: Chunk, reviews: readonly ChunkReview[]): boolean {
  if (!isActive(chunk) || reviews.length === 0) return false;
  const last = reviews.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  return countRecall(reviews).missed >= 2 || last.rating === 'AGAIN' || last.rating === 'HARD';
}

export function matchesFilter(
  chunk: Chunk,
  reviews: readonly ChunkReview[],
  filter: ChunkFilter,
  today: ISODate,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'new':
      return chunk.status === 'new';
    case 'learning':
      return chunk.status === 'learning';
    case 'due':
      return isDue(chunk, today);
    case 'learned':
      return chunk.status === 'learned' || chunk.status === 'retired';
    case 'difficult':
      return isDifficult(chunk, reviews);
  }
}
