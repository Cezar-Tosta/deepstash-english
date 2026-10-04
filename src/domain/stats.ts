import { legacyStarts, periodDates, periodOf, periods, periodStarting } from './periods';
import { SESSION_DAYS_PER_WEEK } from './session';
import type { Chunk, ChunkReview, Idea, ISODate, SourceCard, SpeakingSession, StudySession } from './types';

export interface StatsInput {
  sessions: readonly StudySession[];
  ideas: readonly Idea[];
  cards: readonly SourceCard[];
  chunks: readonly Chunk[];
  reviews: readonly ChunkReview[];
  speaking: readonly SpeakingSession[];
  /** Inícios dos ciclos de 7 dias. Ausente: valem as semanas de calendário em que houve estudo. */
  cycleStarts?: readonly ISODate[];
}

function startsOf(input: StatsInput): readonly ISODate[] {
  return input.cycleStarts ?? legacyStarts([...input.sessions.map((s) => s.date), ...input.ideas.map((i) => i.date)]);
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
  /** Último dia do ciclo, inclusive. */
  weekEnd: ISODate;
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
  /** Dias em que houve leitura de ideia (sessão). A meta são os 5 primeiros dias do ciclo. */
  sessionDays: number;
  days: DayStats[];
}

/**
 * Os números do ciclo que começa em `weekStart`. Um dia conta como estudado quando
 * houve leitura de ideia ou revisão concluída.
 */
export function weekStats(input: StatsInput, weekStart: ISODate): WeekStats {
  const period = periodStarting(startsOf(input), weekStart);
  const ideasById = new Map(input.ideas.map((i) => [i.id, i]));
  let recalled = 0;

  const days = periodDates(period).map((date): DayStats => {
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
      speakingSec: input.speaking.filter((s) => s.date === date).reduce((sum, s) => sum + s.durationSec, 0),
      reviews: reviews.length,
      sessionCompleted: session?.status === 'completed',
      studied: ideas > 0 || reviews.length > 0,
    };
  });

  const sum = (pick: (d: DayStats) => number): number => days.reduce((n, d) => n + pick(d), 0);
  const reviewsDone = sum((d) => d.reviews);
  return {
    weekStart,
    weekEnd: period.end,
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

/**
 * Os últimos `count` ciclos até o que começa em `lastStart`, do mais antigo para o mais
 * recente. Só entram ciclos que existem: os dias entre um ciclo e outro não têm histórico.
 */
export function weeklyHistory(input: StatsInput, lastStart: ISODate, count: number): WeekStats[] {
  return periods(startsOf(input))
    .filter((p) => p.start <= lastStart)
    .slice(-count)
    .map((p) => weekStats(input, p.start));
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

  // Ciclo completo: sessão em cinco dias dele. Revisões dos dias 6 e 7 não entram na conta.
  const starts = startsOf(input);
  const perWeek = new Map<ISODate, number>();
  for (const date of new Set(input.ideas.map((i) => i.date))) {
    const week = periodOf(starts, date)?.start;
    if (week !== undefined) perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }

  const ideaIds = new Set(input.ideas.map((i) => i.id));
  const recalled = input.reviews.filter((r) => r.rating !== 'AGAIN').length;
  return {
    ideasRead: input.ideas.length,
    cardsRead: input.cards.length,
    ideasStudied: input.sessions.filter((s) => s.ideaOfDayId && ideaIds.has(s.ideaOfDayId)).length,
    chunksCreated: input.chunks.length,
    chunksLearned: input.chunks.filter((c) => c.status === 'learned' || c.status === 'retired').length,
    reviewsDone: input.reviews.length,
    recallRate: input.reviews.length === 0 ? null : recalled / input.reviews.length,
    speakingSec: input.speaking.reduce((sum, s) => sum + s.durationSec, 0),
    studyDays: studied.size,
    completeWeeks: [...perWeek.values()].filter((n) => n >= SESSION_DAYS_PER_WEEK).length,
  };
}
