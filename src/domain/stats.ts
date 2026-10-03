import { addDays, startOfWeek, weekDates } from './dates';
import type { Chunk, ChunkReview, ISODate, SourceCard, SpeakingSession, StudySession } from './types';

export interface StatsInput {
  sessions: readonly StudySession[];
  cards: readonly SourceCard[];
  chunks: readonly Chunk[];
  reviews: readonly ChunkReview[];
  speaking: readonly SpeakingSession[];
}

export interface DayStats {
  date: ISODate;
  cards: number;
  cardOfDayTitle: string | null;
  chunks: string[];
  speakingSec: number;
  reviews: number;
  sessionCompleted: boolean;
  studied: boolean;
}

export interface WeekStats {
  weekStart: ISODate;
  cardsRead: number;
  cardsStudied: number;
  chunksCreated: number;
  reviewsDone: number;
  /** Fração de revisões lembradas (qualquer nota diferente de AGAIN); null sem revisões. */
  recallRate: number | null;
  speakingSec: number;
  studyDays: number;
  days: DayStats[];
}

/** Um dia conta como estudado quando houve leitura de card ou revisão concluída. */
export function weekStats(input: StatsInput, weekStart: ISODate): WeekStats {
  const cardsById = new Map(input.cards.map((c) => [c.id, c]));
  let recalled = 0;

  const days = weekDates(weekStart).map((date): DayStats => {
    const session = input.sessions.find((s) => s.date === date);
    const cards = input.cards.filter((c) => c.date === date).length;
    const reviews = input.reviews.filter((r) => r.completedDate === date);
    recalled += reviews.filter((r) => r.rating !== 'AGAIN').length;
    const cardOfDay = session?.cardOfDayId ? cardsById.get(session.cardOfDayId) : undefined;
    return {
      date,
      cards,
      cardOfDayTitle: cardOfDay?.title ?? null,
      chunks: input.chunks.filter((c) => c.createdDate === date).map((c) => c.text),
      speakingSec: input.speaking
        .filter((s) => s.date === date)
        .reduce((sum, s) => sum + s.durationSec, 0),
      reviews: reviews.length,
      sessionCompleted: session?.status === 'completed',
      studied: cards > 0 || reviews.length > 0,
    };
  });

  const reviewsDone = days.reduce((sum, d) => sum + d.reviews, 0);
  return {
    weekStart,
    cardsRead: days.reduce((sum, d) => sum + d.cards, 0),
    cardsStudied: days.filter((d) => d.cardOfDayTitle !== null).length,
    chunksCreated: days.reduce((sum, d) => sum + d.chunks.length, 0),
    reviewsDone,
    recallRate: reviewsDone === 0 ? null : recalled / reviewsDone,
    speakingSec: days.reduce((sum, d) => sum + d.speakingSec, 0),
    studyDays: days.filter((d) => d.studied).length,
    days,
  };
}

/** As `weeks` semanas que terminam em `lastWeekStart`, da mais antiga para a mais recente. */
export function weeklyHistory(input: StatsInput, lastWeekStart: ISODate, weeks: number): WeekStats[] {
  return Array.from({ length: weeks }, (_, i) =>
    weekStats(input, addDays(lastWeekStart, -7 * (weeks - 1 - i))),
  );
}

export interface Totals {
  cardsRead: number;
  cardsStudied: number;
  chunksCreated: number;
  chunksLearned: number;
  reviewsDone: number;
  recallRate: number | null;
  speakingSec: number;
  studyDays: number;
  completeWeeks: number;
}

export function totals(input: StatsInput): Totals {
  const studied = new Set<ISODate>();
  for (const c of input.cards) studied.add(c.date);
  for (const r of input.reviews) studied.add(r.completedDate);

  const perWeek = new Map<ISODate, number>();
  for (const date of studied) {
    const week = startOfWeek(date);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }

  const cardIds = new Set(input.cards.map((c) => c.id));
  const recalled = input.reviews.filter((r) => r.rating !== 'AGAIN').length;
  return {
    cardsRead: input.cards.length,
    cardsStudied: input.sessions.filter((s) => s.cardOfDayId && cardIds.has(s.cardOfDayId)).length,
    chunksCreated: input.chunks.length,
    chunksLearned: input.chunks.filter((c) => c.status === 'learned' || c.status === 'retired')
      .length,
    reviewsDone: input.reviews.length,
    recallRate: input.reviews.length === 0 ? null : recalled / input.reviews.length,
    speakingSec: input.speaking.reduce((sum, s) => sum + s.durationSec, 0),
    studyDays: studied.size,
    completeWeeks: [...perWeek.values()].filter((n) => n === 7).length,
  };
}
