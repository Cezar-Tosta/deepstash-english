import Dexie, { type EntityTable } from 'dexie';
import type {
  AIFeedback,
  Chunk,
  ChunkReview,
  ComprehensionVocab,
  Idea,
  Reflection,
  SourceCard,
  SpeakingSession,
  StudySession,
  UserSettings,
  WeeklyReview,
  WritingExercise,
} from '../domain/types';
import { migrateV1toV2, type Tables } from './migrations';

export const DB_NAME = 'deepstash-english';

/** Tabelas cujo conteúdo muda na migração 1 → 2. */
const V2_MIGRATED = [
  'sessions',
  'cards',
  'vocab',
  'chunks',
  'speaking',
  'reflections',
  'weeklyReviews',
  'writings',
] as const;

/**
 * Banco local (IndexedDB). Toda mudança de esquema entra como uma nova
 * `this.version(n).stores(...)` com `.upgrade(...)` quando precisar migrar dados;
 * versões anteriores nunca são editadas.
 */
export class AppDB extends Dexie {
  settings!: EntityTable<UserSettings, 'id'>;
  sessions!: EntityTable<StudySession, 'id'>;
  ideas!: EntityTable<Idea, 'id'>;
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

    // v1: o card era a unidade de estudo (título, ideia principal e texto no próprio card).
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

    // v2: a ideia (de um livro) é a unidade; os cards são a sequência dentro dela.
    this.version(2)
      .stores({
        ideas: 'id, sessionId, date',
        cards: 'id, ideaId, sessionId, date',
        vocab: 'id, ideaId, sessionId',
        chunks: 'id, sessionId, sourceIdeaId, createdDate, nextReviewDate, status',
        speaking: 'id, sessionId, ideaId, date',
        reflections: 'id, &ideaId, sessionId',
      })
      .upgrade(async (tx) => {
        const before: Tables = {};
        for (const name of V2_MIGRATED) {
          before[name] = (await tx.table(name).toArray()) as Record<string, unknown>[];
        }
        const after = migrateV1toV2(before);
        for (const name of [...V2_MIGRATED, 'ideas']) {
          await tx.table(name).clear();
          await tx.table(name).bulkAdd(after[name] ?? []);
        }
      });
  }
}

export const db = new AppDB();

/** Nomes das tabelas que entram no backup, na ordem em que são restauradas. */
export const DATA_TABLES = [
  'sessions',
  'ideas',
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
