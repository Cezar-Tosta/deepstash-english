import { describe, expect, it } from 'vitest';
import { weekPlan } from './cycle';
import { startOfWeek } from './dates';
import { skillStats, type StatsInput, totals, weeklyHistory, weekStats } from './stats';
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
  sessions: [session('2026-09-28', 'a1'), session('2026-09-29', 'b1', false), session('2026-10-05', 'c1')],
  ideas: [idea('a1', '2026-09-28'), idea('a2', '2026-09-28'), idea('b1', '2026-09-29'), idea('c1', '2026-10-05')],
  // Cada ideia tem uma quantidade diferente de cards.
  cards: [
    ...cards('a1', '2026-09-28', 4),
    ...cards('a2', '2026-09-28', 6),
    ...cards('b1', '2026-09-29', 3),
    ...cards('c1', '2026-10-05', 5),
  ],
  chunks: [chunk('k1', '2026-09-28'), chunk('k2', '2026-09-28', 'learned'), chunk('k3', '2026-10-05')],
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
    // Só 28 e 29 tiveram sessão; o dia 30 foi apenas de revisão.
    expect(stats.sessionDays).toBe(2);
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

  it('histórico vem do ciclo mais antigo para o mais recente e só tem ciclos que existem', () => {
    const history = weeklyHistory(input, '2026-10-05', 3);
    expect(history.map((w) => [w.weekStart, w.weekEnd, w.ideasRead])).toEqual([
      ['2026-09-28', '2026-10-04', 3],
      ['2026-10-05', '2026-10-11', 1],
    ]);
    expect(weeklyHistory(input, '2026-10-05', 1).map((w) => w.weekStart)).toEqual(['2026-10-05']);
  });

  it('ciclo iniciado na terça: o histórico vai até a segunda, e os dias entre ciclos ficam fora', () => {
    const cycles: StatsInput = {
      sessions: [session('2026-10-06', 'i1'), session('2026-10-13', 'i2'), session('2026-10-15', 'i3')],
      ideas: [idea('i1', '2026-10-06'), idea('i2', '2026-10-13'), idea('i3', '2026-10-15')],
      cards: [],
      chunks: [],
      reviews: [{ id: 'r1', chunkId: 'c', stage: 1, completedDate: '2026-10-12', rating: 'GOOD', userSentence: '' } as ChunkReview],
      speaking: [],
      cycleStarts: ['2026-10-06', '2026-10-15'],
    };
    const first = weekStats(cycles, '2026-10-06');
    expect(first.days.map((d) => d.date)).toEqual([
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
    ]);
    // A revisão de segunda (dia 7) conta; a sessão de terça 13/10 não pertence a ciclo nenhum.
    expect(first).toMatchObject({ weekEnd: '2026-10-12', ideasRead: 1, reviewsDone: 1 });
    const history = weeklyHistory(cycles, '2026-10-15', 8);
    expect(history.map((w) => [w.weekStart, w.ideasRead])).toEqual([
      ['2026-10-06', 1],
      ['2026-10-15', 1],
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

  it('a meta de speaking cresce a cada semana', () => {
    expect([1, 2, 3, 4].map((w) => weekPlan(w).speakingMaxSec)).toEqual([60, 120, 120, 180]);
  });
});

describe('as quatro habilidades no ciclo', () => {
  const day = '2026-09-28';
  const text: SourceCard[] = [
    { ...(cards('t1', day, 1)[0] as SourceCard), content: 'Sleep is vital for memory.' },
    { ...(cards('t1', day, 2)[1] as SourceCard), content: 'We dream every night.' },
  ];
  const withListening: StudySession = {
    ...session(day, 't1'),
    listenGist: 'About sleep.',
    listenAnswers: [
      { sentence: 'Sleep is vital for memory.', answer: 'sleep is vital', score: 0.6 },
      { sentence: 'We dream every night.', answer: 'we dream every night', score: 1 },
    ],
  };
  const skillInput: StatsInput = {
    sessions: [withListening, session('2026-09-29', null)],
    ideas: [idea('t1', day)],
    cards: text,
    chunks: [{ ...chunk('k1', day), userSentence: 'I need to sleep more.' }],
    reviews: [],
    speaking: [
      { ...speaking('a1', day, 20), kind: 'aloud', cardId: 't1-0', transcript: 'sleep is vital for memory' },
      { ...speaking('a2', day, 10), kind: 'aloud', cardId: 't1-1', transcript: 'we dream every' },
      speaking('r1', day, 60),
      // Fora do ciclo: não conta.
      { ...speaking('a3', '2026-10-06', 30), kind: 'aloud', cardId: 't1-0', transcript: 'x' },
    ],
    reflections: [
      {
        id: 'f1',
        ideaId: 't1',
        sessionId: `s-${day}`,
        userOpinion: 'I agree with the author.',
        soWhat: "I'll sleep earlier.",
        createdAt: `${day}T10:00:00.000Z`,
        updatedAt: `${day}T10:00:00.000Z`,
      },
    ],
    writings: [
      {
        id: 'w1',
        weekStart: WEEK,
        ideaId: null,
        text: 'Sleep matters a lot.',
        finalizedAt: null,
        revisedText: '',
        createdAt: `${day}T10:00:00.000Z`,
        updatedAt: `${day}T10:00:00.000Z`,
      },
    ],
    cycleStarts: [WEEK],
  };

  it('listening: dias com escuta e acerto médio no ditado', () => {
    expect(skillStats(skillInput, WEEK).listening).toEqual({ days: 1, sentences: 2, score: 0.8 });
  });

  it('reading: textos e palavras lidas', () => {
    expect(skillStats(skillInput, WEEK).reading).toEqual({ texts: 1, words: 9 });
  });

  it('speaking: tempo lendo em voz alta, tempo recontando e palavras reconhecidas na leitura', () => {
    // 5 de 5 palavras no primeiro parágrafo e 3 de 4 no segundo.
    expect(skillStats(skillInput, WEEK).speaking).toEqual({ aloudSec: 30, retellSec: 60, aloudScore: 0.875 });
  });

  it('writing: palavras escritas nas frases, na reflexão, na ação e no texto do ciclo', () => {
    // 5 (frase) + 5 (opinião) + 3 (ação) + 4 (texto do ciclo).
    expect(skillStats(skillInput, WEEK).writing).toEqual({ words: 17 });
  });

  it('sem atividade, as médias ficam vazias', () => {
    expect(skillStats(input, WEEK)).toMatchObject({
      listening: { days: 0, sentences: 0, score: null },
      speaking: { aloudSec: 0, aloudScore: null },
    });
  });
});
