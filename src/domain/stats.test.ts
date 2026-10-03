import { describe, expect, it } from 'vitest';
import { cyclePosition, weekPlan } from './cycle';
import { startOfWeek } from './dates';
import { type StatsInput, totals, weeklyHistory, weekStats } from './stats';
import type { Chunk, ChunkReview, Idea, SourceCard, SpeakingSession, StudySession } from './types';

const WEEK = '2026-09-28'; // segunda-feira

function session(date: string, ideaOfDayId: string | null, completed = true): StudySession {
  return {
    id: `s-${date}`,
    date,
    cycleNumber: 1,
    cycleWeek: 1,
    startedAt: `${date}T10:00:00.000Z`,
    completedAt: completed ? `${date}T10:30:00.000Z` : null,
    ideaOfDayId,
    currentStep: 'schedule',
    status: completed ? 'completed' : 'in_progress',
    misunderstood: '',
    retellNotes: '',
  };
}

function idea(id: string, date: string): Idea {
  return {
    id,
    sessionId: `s-${date}`,
    date,
    bookTitle: '',
    title: `Idea ${id}`,
    mainIdea: '',
    category: '',
    notes: '',
    createdAt: `${date}T10:00:00.000Z`,
  };
}

function cards(ideaId: string, date: string, count: number): SourceCard[] {
  return Array.from({ length: count }, (_, position) => ({
    id: `${ideaId}-${position}`,
    ideaId,
    sessionId: `s-${date}`,
    date,
    position,
    content: '',
    createdAt: `${date}T10:00:00.000Z`,
  }));
}

function chunk(id: string, date: string, status: Chunk['status'] = 'new'): Chunk {
  return {
    id,
    sessionId: `s-${date}`,
    sourceIdeaId: null,
    text: `chunk ${id}`,
    meaning: '',
    originalSentence: '',
    userSentence: '',
    createdAt: `${date}T10:00:00.000Z`,
    createdDate: date,
    status,
    stage: 0,
    nextReviewDate: null,
  };
}

function review(id: string, date: string, rating: ChunkReview['rating']): ChunkReview {
  return {
    id,
    chunkId: 'x',
    scheduledDate: date,
    completedDate: date,
    stage: 0,
    rating,
    userSentence: '',
    createdAt: `${date}T10:00:00.000Z`,
  };
}

function speaking(id: string, date: string, durationSec: number): SpeakingSession {
  return {
    id,
    kind: 'daily',
    sessionId: `s-${date}`,
    ideaId: null,
    date,
    durationSec,
    targetSec: 60,
    transcript: null,
    audioPath: null,
    createdAt: `${date}T10:00:00.000Z`,
  };
}

const input: StatsInput = {
  sessions: [
    session('2026-09-28', 'a1'),
    session('2026-09-29', 'b1', false),
    session('2026-10-05', 'c1'),
  ],
  ideas: [
    idea('a1', '2026-09-28'),
    idea('a2', '2026-09-28'),
    idea('b1', '2026-09-29'),
    idea('c1', '2026-10-05'),
  ],
  // Cada ideia tem uma quantidade diferente de cards.
  cards: [
    ...cards('a1', '2026-09-28', 4),
    ...cards('a2', '2026-09-28', 6),
    ...cards('b1', '2026-09-29', 3),
    ...cards('c1', '2026-10-05', 5),
  ],
  chunks: [
    chunk('k1', '2026-09-28'),
    chunk('k2', '2026-09-28', 'learned'),
    chunk('k3', '2026-10-05'),
  ],
  reviews: [
    review('r1', '2026-09-29', 'GOOD'),
    review('r2', '2026-09-30', 'AGAIN'),
    review('r3', '2026-09-30', 'HARD'),
    review('r4', '2026-10-06', 'EASY'),
  ],
  speaking: [speaking('p1', '2026-09-28', 70), speaking('p2', '2026-09-29', 50)],
};

describe('estatísticas semanais', () => {
  const stats = weekStats(input, WEEK);

  it('soma só o que aconteceu na semana', () => {
    expect(stats).toMatchObject({
      ideasRead: 3,
      cardsRead: 13,
      ideasStudied: 2,
      chunksCreated: 2,
      reviewsDone: 3,
      speakingSec: 120,
    });
  });

  it('conta como dia estudado o dia com ideia lida ou revisão feita', () => {
    // 28 e 29 têm ideias; 30 só teve revisão.
    expect(stats.studyDays).toBe(3);
  });

  it('taxa de recuperação: tudo que não é AGAIN conta como lembrado', () => {
    expect(stats.recallRate).toBeCloseTo(2 / 3);
  });

  it('detalha os sete dias, de segunda a domingo', () => {
    expect(stats.days).toHaveLength(7);
    expect(stats.days[0]).toMatchObject({
      date: '2026-09-28',
      ideas: 2,
      cards: 10,
      ideaOfDayTitle: 'Idea a1',
      chunks: ['chunk k1', 'chunk k2'],
      speakingSec: 70,
      sessionCompleted: true,
    });
    expect(stats.days[1]?.sessionCompleted).toBe(false);
    expect(stats.days[6]).toMatchObject({ date: '2026-10-04', studied: false });
  });

  it('semana vazia não tem taxa de recuperação', () => {
    expect(weekStats(input, '2026-01-05')).toMatchObject({
      ideasRead: 0,
      cardsRead: 0,
      studyDays: 0,
      recallRate: null,
    });
  });

  it('histórico vem da semana mais antiga para a mais recente', () => {
    const history = weeklyHistory(input, '2026-10-05', 3);
    expect(history.map((w) => [w.weekStart, w.ideasRead])).toEqual([
      ['2026-09-21', 0],
      ['2026-09-28', 3],
      ['2026-10-05', 1],
    ]);
  });

  it('totais gerais', () => {
    expect(totals(input)).toMatchObject({
      ideasRead: 4,
      cardsRead: 18,
      ideasStudied: 3,
      chunksCreated: 3,
      chunksLearned: 1,
      reviewsDone: 4,
      speakingSec: 120,
      studyDays: 5,
      completeWeeks: 0,
    });
  });
});

describe('semana e ciclo', () => {
  it('a semana começa na segunda-feira', () => {
    expect(startOfWeek('2026-10-03')).toBe('2026-09-28'); // sábado
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28'); // domingo
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05'); // segunda
  });

  it('ciclos de 4 semanas se repetem mantendo a contagem', () => {
    expect(cyclePosition(WEEK, '2026-10-04')).toEqual({ cycle: 1, week: 1 });
    expect(cyclePosition(WEEK, '2026-10-25')).toEqual({ cycle: 1, week: 4 });
    expect(cyclePosition(WEEK, '2026-10-26')).toEqual({ cycle: 2, week: 1 });
  });

  it('a meta de speaking cresce a cada semana', () => {
    expect([1, 2, 3, 4].map((w) => weekPlan(w).speakingMaxSec)).toEqual([60, 120, 120, 180]);
  });
});
