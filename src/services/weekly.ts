import { db } from '../data/db';
import { addDays, nowISO } from '../domain/dates';
import { newId } from '../domain/ids';
import type {
  Chunk,
  ISODate,
  Reflection,
  Idea,
  SpeakingSession,
  WeeklyReview,
  WritingExercise,
} from '../domain/types';
import { DomainError } from './errors';

export const TOP_IDEAS = 3;

export interface WeekIdea {
  idea: Idea;
  reflection: Reflection | null;
}

export interface WeekBundle {
  weekStart: ISODate;
  /** As Ideas of the Day da semana, em ordem de data. */
  ideas: WeekIdea[];
  chunks: Chunk[];
  review: WeeklyReview;
  writing: WritingExercise | null;
  speaking: SpeakingSession[];
}

function emptyReview(weekStart: ISODate): WeeklyReview {
  return {
    id: weekStart,
    weekStart,
    recalls: {},
    topIdeaIds: [],
    speakingIdeaId: null,
    wentWell: '',
    difficulty: '',
    consistency: null,
    completedAt: null,
    updatedAt: nowISO(),
  };
}

export async function loadWeekBundle(weekStart: ISODate): Promise<WeekBundle> {
  const weekEnd = addDays(weekStart, 6);
  const [sessions, chunks, review, writing, speaking] = await Promise.all([
    db.sessions.where('date').between(weekStart, weekEnd, true, true).sortBy('date'),
    db.chunks.where('createdDate').between(weekStart, weekEnd, true, true).sortBy('createdAt'),
    db.weeklyReviews.get(weekStart),
    db.writings.where('weekStart').equals(weekStart).first(),
    db.speaking.where('date').between(weekStart, weekEnd, true, true).toArray(),
  ]);

  const ideas: WeekIdea[] = [];
  for (const session of sessions) {
    if (!session.ideaOfDayId) continue;
    const idea = await db.ideas.get(session.ideaOfDayId);
    if (!idea) continue;
    const reflection = (await db.reflections.where('ideaId').equals(idea.id).first()) ?? null;
    ideas.push({ idea, reflection });
  }

  return {
    weekStart,
    ideas,
    chunks,
    review: review ?? emptyReview(weekStart),
    writing: writing ?? null,
    speaking: speaking.filter((s) => s.kind === 'weekly'),
  };
}

export function saveWeeklyReview(
  weekStart: ISODate,
  patch: Partial<Omit<WeeklyReview, 'id' | 'weekStart' | 'updatedAt'>>,
): Promise<void> {
  return db.transaction('rw', db.weeklyReviews, async () => {
    const current = (await db.weeklyReviews.get(weekStart)) ?? emptyReview(weekStart);
    if (patch.topIdeaIds && patch.topIdeaIds.length > TOP_IDEAS) {
      throw new DomainError(`Escolha no máximo ${TOP_IDEAS} ideias.`);
    }
    await db.weeklyReviews.put({ ...current, ...patch, updatedAt: nowISO() });
  });
}

export function saveRecall(weekStart: ISODate, ideaId: string, text: string): Promise<void> {
  return db.transaction('rw', db.weeklyReviews, async () => {
    const current = (await db.weeklyReviews.get(weekStart)) ?? emptyReview(weekStart);
    await db.weeklyReviews.put({
      ...current,
      recalls: { ...current.recalls, [ideaId]: text },
      updatedAt: nowISO(),
    });
  });
}

/** Rascunho da primeira versão. Depois de finalizado o texto original não muda mais. */
export function saveWritingDraft(
  weekStart: ISODate,
  patch: { text?: string; ideaId?: string | null },
): Promise<void> {
  return db.transaction('rw', db.writings, async () => {
    const existing = await db.writings.where('weekStart').equals(weekStart).first();
    const now = nowISO();
    if (!existing) {
      await db.writings.add({
        id: newId(),
        weekStart,
        ideaId: patch.ideaId ?? null,
        text: patch.text ?? '',
        finalizedAt: null,
        revisedText: '',
        createdAt: now,
        updatedAt: now,
      });
      return;
    }
    if (existing.finalizedAt && patch.text !== undefined) {
      throw new DomainError('O texto já foi finalizado. Use a revisão para alterá-lo.');
    }
    await db.writings.update(existing.id, { ...patch, updatedAt: now });
  });
}

export function finalizeWriting(weekStart: ISODate): Promise<void> {
  return db.transaction('rw', db.writings, async () => {
    const existing = await db.writings.where('weekStart').equals(weekStart).first();
    if (!existing?.text.trim()) throw new DomainError('Escreva o texto antes de finalizar.');
    if (existing.finalizedAt) return;
    const now = nowISO();
    await db.writings.update(existing.id, {
      finalizedAt: now,
      revisedText: existing.text,
      updatedAt: now,
    });
  });
}

export function saveWritingRevision(weekStart: ISODate, revisedText: string): Promise<void> {
  return db.transaction('rw', db.writings, async () => {
    const existing = await db.writings.where('weekStart').equals(weekStart).first();
    if (!existing?.finalizedAt) throw new DomainError('Finalize o texto antes de revisar.');
    await db.writings.update(existing.id, { revisedText, updatedAt: nowISO() });
  });
}
