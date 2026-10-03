import { db } from '../data/db';
import { cyclePosition } from '../domain/cycle';
import { nowISO, startOfWeek, today } from '../domain/dates';
import { newId } from '../domain/ids';
import { canAddChunk } from '../domain/session';
import { scheduler } from '../domain/srs';
import type {
  Chunk,
  ComprehensionVocab,
  ISODate,
  Reflection,
  SourceCard,
  SpeakingSession,
  StepId,
  StudySession,
} from '../domain/types';
import { ChunkLimitError, DomainError } from './errors';
import { getSettings } from './settings';

export interface SessionBundle {
  session: StudySession;
  cards: SourceCard[];
  cardOfDay: SourceCard | null;
  vocab: ComprehensionVocab[];
  chunks: Chunk[];
  speaking: SpeakingSession[];
  reflection: Reflection | null;
}

const byCreatedAt = <T extends { createdAt: string }>(a: T, b: T): number =>
  a.createdAt.localeCompare(b.createdAt);

function required(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new DomainError(`Preencha o campo "${field}".`);
  return trimmed;
}

async function mustGetSession(id: string): Promise<StudySession> {
  const session = await db.sessions.get(id);
  if (!session) throw new DomainError('Sessão não encontrada.');
  return session;
}

/** Abre a sessão do dia. Idempotente: existe no máximo uma sessão por data. */
export function startSession(date: ISODate = today()): Promise<StudySession> {
  return db.transaction('rw', db.sessions, db.settings, async () => {
    const existing = await db.sessions.where('date').equals(date).first();
    if (existing) return existing;

    const settings = await getSettings();
    const cycleStart = settings.cycleStartDate ?? startOfWeek(date);
    if (!settings.cycleStartDate) await db.settings.put({ ...settings, cycleStartDate: cycleStart });

    const { cycle, week } = cyclePosition(cycleStart, date);
    const session: StudySession = {
      id: newId(),
      date,
      cycleNumber: cycle,
      cycleWeek: week,
      startedAt: nowISO(),
      completedAt: null,
      cardOfDayId: null,
      currentStep: 'review',
      status: 'in_progress',
      misunderstood: '',
      retellNotes: '',
    };
    await db.sessions.add(session);
    return session;
  });
}

export async function loadSessionBundle(date: ISODate): Promise<SessionBundle | null> {
  const session = await db.sessions.where('date').equals(date).first();
  if (!session) return null;
  const [cards, vocab, chunks, speaking] = await Promise.all([
    db.cards.where('sessionId').equals(session.id).toArray(),
    db.vocab.where('sessionId').equals(session.id).toArray(),
    db.chunks.where('sessionId').equals(session.id).toArray(),
    db.speaking.where('sessionId').equals(session.id).toArray(),
  ]);
  const cardOfDay = cards.find((c) => c.id === session.cardOfDayId) ?? null;
  const reflection = cardOfDay
    ? ((await db.reflections.where('cardId').equals(cardOfDay.id).first()) ?? null)
    : null;
  return {
    session,
    cards: cards.sort(byCreatedAt),
    cardOfDay,
    vocab: vocab.sort(byCreatedAt),
    chunks: chunks.sort(byCreatedAt),
    speaking: speaking.sort(byCreatedAt),
    reflection,
  };
}

export async function setStep(sessionId: string, step: StepId): Promise<void> {
  await db.sessions.update(sessionId, { currentStep: step });
}

export async function updateSessionNotes(
  sessionId: string,
  patch: Partial<Pick<StudySession, 'misunderstood' | 'retellNotes'>>,
): Promise<void> {
  await db.sessions.update(sessionId, patch);
}

// ---------- Cards ----------

export interface CardInput {
  title: string;
  content?: string | undefined;
  mainIdea?: string | undefined;
  category?: string | undefined;
  notes?: string | undefined;
}

export async function addCard(sessionId: string, input: CardInput): Promise<SourceCard> {
  const session = await mustGetSession(sessionId);
  const card: SourceCard = {
    id: newId(),
    sessionId,
    date: session.date,
    title: required(input.title, 'Título'),
    content: input.content?.trim() ?? '',
    mainIdea: input.mainIdea?.trim() ?? '',
    category: input.category?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
    createdAt: nowISO(),
  };
  await db.cards.add(card);
  return card;
}

export async function updateCard(
  cardId: string,
  patch: Partial<Pick<SourceCard, 'title' | 'content' | 'mainIdea' | 'category' | 'notes'>>,
): Promise<void> {
  if (patch.title !== undefined) required(patch.title, 'Título');
  await db.cards.update(cardId, patch);
}

/** Remove o card e o que só existe por causa dele. Os chunks ficam, sem card de origem. */
export function deleteCard(cardId: string): Promise<void> {
  return db.transaction(
    'rw',
    [db.cards, db.sessions, db.vocab, db.chunks, db.reflections],
    async () => {
      const card = await db.cards.get(cardId);
      if (!card) return;
      await db.sessions
        .where('id')
        .equals(card.sessionId)
        .modify((s) => {
          if (s.cardOfDayId === cardId) s.cardOfDayId = null;
        });
      await db.vocab.where('cardId').equals(cardId).delete();
      await db.reflections.where('cardId').equals(cardId).delete();
      await db.chunks.where('sourceCardId').equals(cardId).modify({ sourceCardId: null });
      await db.cards.delete(cardId);
    },
  );
}

/** Só um card por sessão recebe o aprofundamento; escolher outro substitui o anterior. */
export function setCardOfDay(sessionId: string, cardId: string): Promise<void> {
  return db.transaction('rw', db.sessions, db.cards, async () => {
    const card = await db.cards.get(cardId);
    if (!card || card.sessionId !== sessionId) {
      throw new DomainError('Este card não pertence à sessão de hoje.');
    }
    await db.sessions.update(sessionId, { cardOfDayId: cardId });
  });
}

// ---------- Vocabulário de compreensão ----------

export async function addVocab(
  sessionId: string,
  cardId: string,
  term: string,
  meaning: string,
): Promise<void> {
  await db.vocab.add({
    id: newId(),
    sessionId,
    cardId,
    term: required(term, 'Palavra ou expressão'),
    meaning: meaning.trim(),
    createdAt: nowISO(),
  });
}

export async function deleteVocab(id: string): Promise<void> {
  await db.vocab.delete(id);
}

// ---------- Chunks ----------

export interface ChunkInput {
  text: string;
  meaning?: string | undefined;
  originalSentence?: string | undefined;
  sourceCardId?: string | null | undefined;
}

function buildChunk(session: StudySession, input: ChunkInput): Chunk {
  return {
    id: newId(),
    sessionId: session.id,
    sourceCardId: input.sourceCardId ?? session.cardOfDayId,
    text: required(input.text, 'Expressão'),
    meaning: input.meaning?.trim() ?? '',
    originalSentence: input.originalSentence?.trim() ?? '',
    userSentence: '',
    createdAt: nowISO(),
    createdDate: session.date,
    // O agendamento nasce com o chunk: mesmo sem finalizar a sessão, a revisão aparece.
    ...scheduler.initial(session.date),
  };
}

export function addChunk(sessionId: string, input: ChunkInput): Promise<Chunk> {
  return db.transaction('rw', db.chunks, db.sessions, async () => {
    const session = await mustGetSession(sessionId);
    const count = await db.chunks.where('sessionId').equals(sessionId).count();
    if (!canAddChunk(count)) throw new ChunkLimitError();
    const chunk = buildChunk(session, input);
    await db.chunks.add(chunk);
    return chunk;
  });
}

/** Troca um dos chunks do dia por outro, mantendo o limite de três. */
export function replaceChunk(oldChunkId: string, input: ChunkInput): Promise<Chunk> {
  return db.transaction('rw', db.chunks, db.sessions, db.reviews, async () => {
    const old = await db.chunks.get(oldChunkId);
    if (!old) throw new DomainError('Expressão não encontrada.');
    const chunk = buildChunk(await mustGetSession(old.sessionId), input);
    await db.reviews.where('chunkId').equals(oldChunkId).delete();
    await db.chunks.delete(oldChunkId);
    await db.chunks.add(chunk);
    return chunk;
  });
}

export async function updateChunk(
  chunkId: string,
  patch: Partial<Pick<Chunk, 'text' | 'meaning' | 'originalSentence' | 'userSentence' | 'sourceCardId'>>,
): Promise<void> {
  if (patch.text !== undefined) required(patch.text, 'Expressão');
  await db.chunks.update(chunkId, patch);
}

export function deleteChunk(chunkId: string): Promise<void> {
  return db.transaction('rw', db.chunks, db.reviews, async () => {
    await db.reviews.where('chunkId').equals(chunkId).delete();
    await db.chunks.delete(chunkId);
  });
}

// ---------- Speaking ----------

export interface SpeakingInput {
  kind: 'daily' | 'weekly';
  sessionId: string | null;
  cardId: string | null;
  date: ISODate;
  durationSec: number;
  targetSec: number;
}

export async function recordSpeaking(input: SpeakingInput): Promise<void> {
  if (input.durationSec < 1) return;
  await db.speaking.add({
    ...input,
    id: newId(),
    durationSec: Math.round(input.durationSec),
    transcript: null,
    audioPath: null,
    createdAt: nowISO(),
  });
}

// ---------- Reflection ----------

export function saveReflection(
  sessionId: string,
  cardId: string,
  patch: Partial<Pick<Reflection, 'userOpinion' | 'soWhat'>>,
): Promise<void> {
  return db.transaction('rw', db.reflections, async () => {
    const existing = await db.reflections.where('cardId').equals(cardId).first();
    const now = nowISO();
    if (existing) {
      await db.reflections.update(existing.id, { ...patch, updatedAt: now });
      return;
    }
    await db.reflections.add({
      id: newId(),
      sessionId,
      cardId,
      userOpinion: patch.userOpinion ?? '',
      soWhat: patch.soWhat ?? '',
      createdAt: now,
      updatedAt: now,
    });
  });
}

// ---------- Encerramento ----------

/** A única exigência para encerrar é ter lido ao menos um card. */
export function finishSession(sessionId: string): Promise<void> {
  return db.transaction('rw', db.sessions, db.cards, async () => {
    await mustGetSession(sessionId);
    const cards = await db.cards.where('sessionId').equals(sessionId).count();
    if (cards === 0) {
      throw new DomainError('Registre pelo menos um card antes de finalizar a sessão.');
    }
    await db.sessions.update(sessionId, {
      status: 'completed',
      completedAt: nowISO(),
      currentStep: 'schedule',
    });
  });
}
