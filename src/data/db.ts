import Dexie, { type EntityTable } from 'dexie';
import type {
  AIFeedback,
  Chunk,
  ChunkReview,
  ComprehensionVocab,
  Reflection,
  SourceCard,
  SpeakingSession,
  StudySession,
  UserSettings,
  WeeklyReview,
  WritingExercise,
} from '../domain/types';

export const DB_NAME = 'deepstash-english';

/**
 * Banco local (IndexedDB). Toda mudança de esquema entra como uma nova
 * `this.version(n).stores(...)` com `.upgrade(...)` quando precisar migrar dados;
 * versões anteriores nunca são editadas.
 */
export class AppDB extends Dexie {
  settings!: EntityTable<UserSettings, 'id'>;
  sessions!: EntityTable<StudySession, 'id'>;
  cards!: EntityTable<SourceCard, 'id'>;
  vocab!: EntityTable<ComprehensionVocab, 'id'>;
  chunks!: EntityTable<Chunk, 'id'>;
  reviews!: EntityTable<ChunkReview, 'id'>;
  speaking!: EntityTable<SpeakingSession, 'id'>;
  reflections!: EntityTable<Reflection, 'id'>;
  weeklyReviews!: EntityTable<WeeklyReview, 'id'>;
  writings!: EntityTable<WritingExercise, 'id'>;
  aiFeedback!: EntityTable<AIFeedback, 'id'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      settings: 'id',
      sessions: 'id, &date, status',
      cards: 'id, sessionId, date',
      vocab: 'id, cardId, sessionId',
      chunks: 'id, sessionId, sourceCardId, createdDate, nextReviewDate, status',
      reviews: 'id, chunkId, completedDate',
      speaking: 'id, sessionId, cardId, date',
      reflections: 'id, &cardId, sessionId',
      weeklyReviews: 'id',
      writings: 'id, weekStart',
      aiFeedback: 'id, [targetType+targetId], createdAt',
    });
  }
}

export const db = new AppDB();

/** Nomes das tabelas que entram no backup, na ordem em que são restauradas. */
export const DATA_TABLES = [
  'sessions',
  'cards',
  'vocab',
  'chunks',
  'reviews',
  'speaking',
  'reflections',
  'weeklyReviews',
  'writings',
  'aiFeedback',
] as const;
export type DataTableName = (typeof DATA_TABLES)[number];
