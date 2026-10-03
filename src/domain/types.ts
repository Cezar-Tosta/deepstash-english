/** Dia local no formato yyyy-mm-dd. Todo o agendamento trabalha em dias, nunca em horas. */
export type ISODate = string;
export type ISODateTime = string;

export type Rating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
export type ChunkStatus = 'new' | 'learning' | 'learned' | 'retired';
export type SessionStatus = 'in_progress' | 'completed';
export type ThemePref = 'system' | 'light' | 'dark';
export type AIProviderKind = 'none' | 'anthropic' | 'groq' | 'openai-compatible';

export type StepId =
  | 'review'
  | 'read'
  | 'focus'
  | 'check'
  | 'mine'
  | 'retell'
  | 'personalize'
  | 'reflect'
  | 'sowhat'
  | 'schedule';

export interface AISettings {
  provider: AIProviderKind;
  baseUrl: string;
  model: string;
  /** Fica só neste aparelho (IndexedDB). Nunca entra no backup nem no código-fonte. */
  apiKey: string;
}

export interface UserSettings {
  id: 'settings';
  theme: ThemePref;
  /** Segunda-feira em que o ciclo de 4 semanas atual começou. */
  cycleStartDate: ISODate | null;
  ai: AISettings;
  lastBackupAt: ISODateTime | null;
}

export interface StudySession {
  id: string;
  date: ISODate;
  cycleNumber: number;
  cycleWeek: number;
  startedAt: ISODateTime;
  completedAt: ISODateTime | null;
  ideaOfDayId: string | null;
  currentStep: StepId;
  status: SessionStatus;
  /** CHECK: o que entendi errado ou não sabia. */
  misunderstood: string;
  /** RETELL: palavras de apoio para a fala. */
  retellNotes: string;
}

/**
 * Uma ideia de um livro, como o Deepstash a apresenta. É a unidade de leitura e de
 * aprofundamento: a "Idea of the Day" é uma ideia inteira, não um card isolado.
 */
export interface Idea {
  id: string;
  sessionId: string;
  date: ISODate;
  bookTitle: string;
  title: string;
  mainIdea: string;
  category: string;
  notes: string;
  createdAt: ISODateTime;
}

/** Um card da ideia. Os cards de uma ideia são lidos em sequência, como uma história. */
export interface SourceCard {
  id: string;
  ideaId: string;
  sessionId: string;
  date: ISODate;
  /** Ordem do card dentro da ideia, começando em 0. */
  position: number;
  content: string;
  createdAt: ISODateTime;
}

/** Vocabulário só para entender o card. Nunca entra na repetição espaçada. */
export interface ComprehensionVocab {
  id: string;
  ideaId: string;
  sessionId: string;
  term: string;
  meaning: string;
  createdAt: ISODateTime;
}

export interface Chunk {
  id: string;
  sessionId: string;
  sourceIdeaId: string | null;
  text: string;
  meaning: string;
  originalSentence: string;
  userSentence: string;
  createdAt: ISODateTime;
  /** D0. */
  createdDate: ISODate;
  status: ChunkStatus;
  /** Índice da próxima revisão no calendário do scheduler. */
  stage: number;
  nextReviewDate: ISODate | null;
}

/** Uma tentativa de revisão. Registro só de inclusão: o histórico nunca é apagado. */
export interface ChunkReview {
  id: string;
  chunkId: string;
  scheduledDate: ISODate;
  completedDate: ISODate;
  stage: number;
  rating: Rating;
  userSentence: string;
  createdAt: ISODateTime;
}

export interface SpeakingSession {
  id: string;
  kind: 'daily' | 'weekly';
  sessionId: string | null;
  ideaId: string | null;
  date: ISODate;
  durationSec: number;
  targetSec: number;
  /** Reservados para gravação/transcrição (v0.6). */
  transcript: string | null;
  audioPath: string | null;
  createdAt: ISODateTime;
}

export interface Reflection {
  id: string;
  ideaId: string;
  sessionId: string;
  /** MY VIEW — Do I agree? Why? */
  userOpinion: string;
  /** SO WHAT? — What will I do differently? */
  soWhat: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface WeeklyReview {
  /** Igual a weekStart: existe no máximo um fechamento por semana. */
  id: ISODate;
  weekStart: ISODate;
  /** ideaId → o que o usuário lembrou antes de revelar. */
  recalls: Record<string, string>;
  topIdeaIds: string[];
  speakingIdeaId: string | null;
  wentWell: string;
  difficulty: string;
  consistency: number | null;
  completedAt: ISODateTime | null;
  updatedAt: ISODateTime;
}

export interface WritingExercise {
  id: string;
  weekStart: ISODate;
  ideaId: string | null;
  /** Primeira versão. Congelada ao finalizar. */
  text: string;
  finalizedAt: ISODateTime | null;
  revisedText: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type FeedbackKind = 'grammar' | 'improve' | 'natural';
export type FeedbackTarget = 'mainIdea' | 'chunkSentence' | 'opinion' | 'soWhat' | 'writing';

/** Retorno da IA. Guarda o original ao lado da correção; nada é sobrescrito. */
export interface AIFeedback {
  id: string;
  kind: FeedbackKind;
  targetType: FeedbackTarget;
  targetId: string;
  original: string;
  corrected: string;
  explanation: string;
  moreNatural: string | null;
  provider: string;
  model: string;
  createdAt: ISODateTime;
}
