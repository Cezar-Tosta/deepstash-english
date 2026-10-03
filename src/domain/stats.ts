import { addDays, startOfWeek, weekDates } from './dates';
import { SESSION_DAYS_PER_WEEK } from './session';
import type {
  Chunk,
  ChunkReview,
  Idea,
  ISODate,
  SourceCard,
  SpeakingSession,
  StudySession,
} from './types';

export interface StatsInput {
  sessions: readonly StudySession[];
  ideas: readonly Idea[];
  cards: readonly SourceCard[];
  chunks: readonly Chunk[];
  reviews: readonly ChunkReview[];
  speaking: readonly SpeakingSession[];
}

export interface DayStats {
  date: ISODate;
  ideas: number;
  cards: number;
  ideaOfDayTitle: string | null;
  chunks: string[];
  speakingSec: number;
  reviews: number;
  sessionCompleted: boolean;
  studied: boolean;
}

export interface WeekStats {
  weekStart: ISODate;
  ideasRead: number;
  cardsRead: number;
  /** Ideias aprofundadas (Idea of the Day). */
  ideasStudied: number;
  chunksCreated: number;
  reviewsDone: number;
  /** Fração de revisões lembradas (qualquer nota diferente de AGAIN); null sem revisões. */
  recallRate: number | null;
  speakingSec: number;
  studyDays: number;
  /** Dias em que houve leitura de ideia (sessão). A meta é de segunda a sexta. */
  sessionDays: number;
  days: DayStats[];
}

/** Um dia conta como estudado quando houve leitura de ideia ou revisão concluída. */
export function weekStats(input: StatsInput, weekStart: ISODate): WeekStats {
  const ideasById = new Map(input.ideas.map((i) => [i.id, i]));
  let recalled = 0;

  const days = weekDates(weekStart).map((date): DayStats => {
    const session = input.sessions.find((s) => s.date === date);
    const ideas = input.ideas.filter((i) => i.date === date).length;
    const reviews = input.reviews.filter((r) => r.completedDate === date);
    recalled += reviews.filter((r) => r.rating !== 'AGAIN').length;
    const ideaOfDay = session?.ideaOfDayId ? ideasById.get(session.ideaOfDayId) : undefined;
    return {
      date,
      ideas,
      cards: input.cards.filter((c) => c.date === date).length,
      ideaOfDayTitle: ideaOfDay?.title ?? null,
      chunks: input.chunks.filter((c) => c.createdDate === date).map((c) => c.text),
      speakingSec: input.speaking
        .filter((s) => s.date === date)
        .reduce((sum, s) => sum + s.durationSec, 0),
      reviews: reviews.length,
      sessionCompleted: session?.status === 'completed',
      studied: ideas > 0 || reviews.length > 0,
    };
  });

  const sum = (pick: (d: DayStats) => number): number => days.reduce((n, d) => n + pick(d), 0);
  const reviewsDone = sum((d) => d.reviews);
  return {
    weekStart,
    ideasRead: sum((d) => d.ideas),
    cardsRead: sum((d) => d.cards),
    ideasStudied: days.filter((d) => d.ideaOfDayTitle !== null).length,
    chunksCreated: sum((d) => d.chunks.length),
    reviewsDone,
    recallRate: reviewsDone === 0 ? null : recalled / reviewsDone,
    speakingSec: sum((d) => d.speakingSec),
    studyDays: days.filter((d) => d.studied).length,
    sessionDays: days.filter((d) => d.ideas > 0).length,
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
  ideasRead: number;
  cardsRead: number;
  ideasStudied: number;
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
  for (const i of input.ideas) studied.add(i.date);
  for (const r of input.reviews) studied.add(r.completedDate);

  // Semana completa: sessão nos cinco dias úteis. Revisões de fim de semana não entram na conta.
  const perWeek = new Map<ISODate, number>();
  for (const date of new Set(input.ideas.map((i) => i.date))) {
    const week = startOfWeek(date);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }

  const ideaIds = new Set(input.ideas.map((i) => i.id));
  const recalled = input.reviews.filter((r) => r.rating !== 'AGAIN').length;
  return {
    ideasRead: input.ideas.length,
    cardsRead: input.cards.length,
    ideasStudied: input.sessions.filter((s) => s.ideaOfDayId && ideaIds.has(s.ideaOfDayId)).length,
    chunksCreated: input.chunks.length,
    chunksLearned: input.chunks.filter((c) => c.status === 'learned' || c.status === 'retired')
      .length,
    reviewsDone: input.reviews.length,
    recallRate: input.reviews.length === 0 ? null : recalled / input.reviews.length,
    speakingSec: input.speaking.reduce((sum, s) => sum + s.durationSec, 0),
    studyDays: studied.size,
    completeWeeks: [...perWeek.values()].filter((n) => n >= SESSION_DAYS_PER_WEEK).length,
  };
}
