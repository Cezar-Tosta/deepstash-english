import { db } from '../data/db';
import { periodOf, phaseOf } from '../domain/periods';
import { nowISO, today } from '../domain/dates';
import { newId } from '../domain/ids';
import { canAddChunk } from '../domain/session';
import { scheduler } from '../domain/srs';
import type {
  Chunk,
  ComprehensionVocab,
  Idea,
  ISODate,
  Reflection,
  SourceCard,
  SpeakingSession,
  StepId,
  StudySession,
} from '../domain/types';
import { ChunkLimitError, DomainError } from './errors';
import { ensureCycle } from './cycles';
import { getSettings } from './settings';

export interface IdeaWithCards {
  idea: Idea;
  /** Na ordem em que são lidos. */
  cards: SourceCard[];
}

export interface SessionBundle {
  session: StudySession;
  ideas: IdeaWithCards[];
  ideaOfDay: IdeaWithCards | null;
  vocab: ComprehensionVocab[];
  chunks: Chunk[];
  speaking: SpeakingSession[];
  reflection: Reflection | null;
}

const byCreatedAt = <T extends { createdAt: string }>(a: T, b: T): number => a.createdAt.localeCompare(b.createdAt);

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

    // Um dia fora de qualquer ciclo começa um ciclo novo de 7 dias.
    const starts = await ensureCycle(date);
    const period = periodOf(starts, date);
    const settings = await getSettings();
    const { cycle, week } = period ? phaseOf(starts, period, settings.cycleStartDate) : { cycle: 1, week: 1 };
    const session: StudySession = {
      id: newId(),
      date,
      cycleNumber: cycle,
      cycleWeek: week,
      startedAt: nowISO(),
      completedAt: null,
      ideaOfDayId: null,
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
  const [ideas, cards, vocab, chunks, speaking] = await Promise.all([
    db.ideas.where('sessionId').equals(session.id).toArray(),
    db.cards.where('sessionId').equals(session.id).toArray(),
    db.vocab.where('sessionId').equals(session.id).toArray(),
    db.chunks.where('sessionId').equals(session.id).toArray(),
    db.speaking.where('sessionId').equals(session.id).toArray(),
  ]);
  const withCards = ideas.sort(byCreatedAt).map((idea): IdeaWithCards => ({
    idea,
    cards: cards.filter((c) => c.ideaId === idea.id).sort((a, b) => a.position - b.position),
  }));
  const ideaOfDay = withCards.find((i) => i.idea.id === session.ideaOfDayId) ?? null;
  const reflection = ideaOfDay ? ((await db.reflections.where('ideaId').equals(ideaOfDay.idea.id).first()) ?? null) : null;
  return {
    session,
    ideas: withCards,
    ideaOfDay,
    vocab: vocab.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' })),
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

// ---------- Ideias ----------

export interface IdeaInput {
  title: string;
  bookTitle?: string | undefined;
  mainIdea?: string | undefined;
  category?: string | undefined;
  notes?: string | undefined;
  /** Texto dos cards, na ordem de leitura. */
  cards?: readonly string[] | undefined;
}

/** Texto colado → um card por bloco. Os blocos são separados por uma linha em branco. */
export function splitIntoCards(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function buildCards(idea: Idea, contents: readonly string[], firstPosition: number): SourceCard[] {
  return contents.map((content, i) => ({
    id: newId(),
    ideaId: idea.id,
    sessionId: idea.sessionId,
    date: idea.date,
    position: firstPosition + i,
    content: content.trim(),
    createdAt: nowISO(),
  }));
}

export function addIdea(sessionId: string, input: IdeaInput): Promise<Idea> {
  return db.transaction('rw', db.sessions, db.ideas, db.cards, async () => {
    const session = await mustGetSession(sessionId);
    const idea: Idea = {
      id: newId(),
      sessionId,
      date: session.date,
      bookTitle: input.bookTitle?.trim() ?? '',
      title: required(input.title, 'Título da ideia'),
      mainIdea: input.mainIdea?.trim() ?? '',
      category: input.category?.trim() ?? '',
      notes: input.notes?.trim() ?? '',
      createdAt: nowISO(),
    };
    await db.ideas.add(idea);
    await db.cards.bulkAdd(buildCards(idea, input.cards ?? [], 0));
    return idea;
  });
}

export async function updateIdea(
  ideaId: string,
  patch: Partial<Pick<Idea, 'title' | 'bookTitle' | 'mainIdea' | 'category' | 'notes'>>,
): Promise<void> {
  if (patch.title !== undefined) required(patch.title, 'Título da ideia');
  await db.ideas.update(ideaId, patch);
}

/** Remove a ideia e o que só existe por causa dela. Os chunks ficam, sem ideia de origem. */
export function deleteIdea(ideaId: string): Promise<void> {
  return db.transaction(
    'rw',
    [db.ideas, db.cards, db.sessions, db.vocab, db.chunks, db.reflections, db.ideaChats, db.verbs, db.practiceStats],
    async () => {
      const idea = await db.ideas.get(ideaId);
      if (!idea) return;
      await db.sessions
        .where('id')
        .equals(idea.sessionId)
        .modify((s) => {
          if (s.ideaOfDayId === ideaId) s.ideaOfDayId = null;
        });
      await db.cards.where('ideaId').equals(ideaId).delete();
      await db.ideaChats.where('ideaId').equals(ideaId).delete();
      const verbs = await db.verbs.where('ideaId').equals(ideaId).toArray();
      const verbKeys = verbs.flatMap((v) => v.drills.map((_, i) => `verb:${v.id}:${i}`));
      await db.practiceStats.bulkDelete(verbKeys);
      await db.verbs.bulkDelete(verbs.map((v) => v.id));
      await db.vocab.where('ideaId').equals(ideaId).delete();
      await db.reflections.where('ideaId').equals(ideaId).delete();
      await db.chunks.where('sourceIdeaId').equals(ideaId).modify({ sourceIdeaId: null });
      await db.ideas.delete(ideaId);
    },
  );
}

/** Só uma ideia por sessão recebe o aprofundamento; escolher outra substitui a anterior. */
export function setIdeaOfDay(sessionId: string, ideaId: string): Promise<void> {
  return db.transaction('rw', db.sessions, db.ideas, async () => {
    const idea = await db.ideas.get(ideaId);
    if (!idea || idea.sessionId !== sessionId) {
      throw new DomainError('Esta ideia não pertence à sessão de hoje.');
    }
    await db.sessions.update(sessionId, { ideaOfDayId: ideaId });
  });
}

/** Título do livro usado por último, para não redigitar ao registrar a próxima ideia. */
export async function lastBookTitle(): Promise<string> {
  const ideas = await db.ideas.toArray();
  return ideas.sort(byCreatedAt).findLast((i) => i.bookTitle)?.bookTitle ?? '';
}

// ---------- Cards de uma ideia ----------

/** Acrescenta cards ao fim da ideia, preservando a ordem de leitura. */
export function addCards(ideaId: string, contents: readonly string[]): Promise<void> {
  return db.transaction('rw', db.ideas, db.cards, async () => {
    const idea = await db.ideas.get(ideaId);
    if (!idea) throw new DomainError('Ideia não encontrada.');
    const count = await db.cards.where('ideaId').equals(ideaId).count();
    await db.cards.bulkAdd(buildCards(idea, contents, count));
  });
}

export async function updateCard(cardId: string, content: string): Promise<void> {
  await db.cards.update(cardId, { content });
}

/** Remove o card e renumera os seguintes para a sequência continuar sem buracos. */
export function deleteCard(cardId: string): Promise<void> {
  return db.transaction('rw', db.cards, async () => {
    const card = await db.cards.get(cardId);
    if (!card) return;
    await db.cards.delete(cardId);
    const rest = await db.cards.where('ideaId').equals(card.ideaId).sortBy('position');
    await Promise.all(rest.map((c, position) => db.cards.update(c.id, { position })));
  });
}

// ---------- Vocabulário de compreensão ----------

export async function addVocab(sessionId: string, ideaId: string, term: string, meaning: string): Promise<void> {
  await db.vocab.add({
    id: newId(),
    sessionId,
    ideaId,
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
  sourceIdeaId?: string | null | undefined;
}

function buildChunk(session: StudySession, input: ChunkInput): Chunk {
  return {
    id: newId(),
    sessionId: session.id,
    sourceIdeaId: input.sourceIdeaId ?? session.ideaOfDayId,
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
  patch: Partial<Pick<Chunk, 'text' | 'meaning' | 'originalSentence' | 'userSentence' | 'sourceIdeaId'>>,
): Promise<void> {
  if (patch.text !== undefined) required(patch.text, 'Expressão');
  await db.chunks.update(chunkId, patch);
}

/** Guarda mais uma frase escrita com o chunk. As anteriores são mantidas. */
export function addChunkSentence(chunkId: string, sentence: string): Promise<void> {
  return db.transaction('rw', db.chunks, async () => {
    const text = sentence.trim();
    const chunk = await db.chunks.get(chunkId);
    if (!chunk || !text) return;
    const all = [chunk.userSentence, ...(chunk.extraSentences ?? [])];
    if (all.includes(text)) return;
    // A primeira frase do chunk ocupa o campo principal; as demais vão para a lista.
    if (!chunk.userSentence.trim()) await db.chunks.update(chunkId, { userSentence: text });
    else await db.chunks.update(chunkId, { extraSentences: [...(chunk.extraSentences ?? []), text] });
  });
}

/**
 * Chunks de dias anteriores para treinar de novo: primeiro os mais difíceis nas
 * revisões, depois os que têm menos frases escritas.
 */
export async function chunksToPractice(sessionId: string, count: number, skip: readonly string[] = []): Promise<Chunk[]> {
  const [chunks, reviews] = await Promise.all([db.chunks.toArray(), db.reviews.toArray()]);
  const trouble = (id: string): number =>
    reviews.filter((r) => r.chunkId === id).reduce((n, r) => n + (r.rating === 'AGAIN' ? 2 : r.rating === 'HARD' ? 1 : 0), 0);
  const written = (c: Chunk): number => (c.userSentence.trim() ? 1 : 0) + (c.extraSentences?.length ?? 0);
  return chunks
    .filter((c) => c.sessionId !== sessionId && c.status !== 'retired' && !skip.includes(c.id))
    .sort((a, b) => trouble(b.id) - trouble(a.id) || written(a) - written(b) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, count);
}

export function deleteChunk(chunkId: string): Promise<void> {
  return db.transaction('rw', db.chunks, db.reviews, async () => {
    await db.reviews.where('chunkId').equals(chunkId).delete();
    await db.chunks.delete(chunkId);
  });
}

// ---------- Speaking ----------

export interface SpeakingInput {
  kind: 'daily' | 'weekly' | 'book';
  sessionId: string | null;
  ideaId: string | null;
  date: ISODate;
  durationSec: number;
  targetSec: number;
  /** Livro explicado, quando `kind` é 'book'. */
  bookKey?: string | undefined;
}

/** Registra a fala e devolve o id, ou null se foi curta demais para contar. */
export async function recordSpeaking({ bookKey, ...input }: SpeakingInput): Promise<string | null> {
  if (input.durationSec < 1) return null;
  const id = newId();
  await db.speaking.add({
    ...input,
    ...(bookKey ? { bookKey } : {}),
    id,
    durationSec: Math.round(input.durationSec),
    transcript: null,
    audioPath: null,
    createdAt: nowISO(),
  });
  return id;
}

export async function saveTranscript(speakingId: string, transcript: string): Promise<void> {
  await db.speaking.update(speakingId, { transcript });
}

// ---------- Reflection ----------

export function saveReflection(
  sessionId: string,
  ideaId: string,
  patch: Partial<Pick<Reflection, 'userOpinion' | 'soWhat' | 'opinionPt' | 'soWhatPt'>>,
): Promise<void> {
  return db.transaction('rw', db.reflections, async () => {
    const existing = await db.reflections.where('ideaId').equals(ideaId).first();
    const now = nowISO();
    if (existing) {
      await db.reflections.update(existing.id, { ...patch, updatedAt: now });
      return;
    }
    await db.reflections.add({
      id: newId(),
      sessionId,
      ideaId,
      userOpinion: '',
      soWhat: '',
      // Qualquer campo pode ser o primeiro a ser escrito, inclusive os rascunhos.
      ...patch,
      createdAt: now,
      updatedAt: now,
    });
  });
}

// ---------- Encerramento ----------

/** A única exigência para encerrar é ter lido ao menos uma ideia. */
export function finishSession(sessionId: string): Promise<void> {
  return db.transaction('rw', db.sessions, db.ideas, async () => {
    await mustGetSession(sessionId);
    const ideas = await db.ideas.where('sessionId').equals(sessionId).count();
    if (ideas === 0) {
      throw new DomainError('Registre pelo menos uma ideia antes de finalizar a sessão.');
    }
    await db.sessions.update(sessionId, {
      status: 'completed',
      completedAt: nowISO(),
      currentStep: 'schedule',
    });
  });
}
