import { db } from '../data/db';
import { type BookSummary, bookKey, groupByBook } from '../domain/books';
import { addDays, nowISO, today } from '../domain/dates';
import type { PracticeMaterial } from '../domain/exercises';
import { newId } from '../domain/ids';
import type {
  BookNote,
  ComprehensionVocab,
  FollowUpStatus,
  Idea,
  ISODate,
  Reflection,
} from '../domain/types';
import { DomainError } from './errors';

// ---------- Livros ----------

export async function listBooks(): Promise<BookSummary[]> {
  const [ideas, cards] = await Promise.all([db.ideas.toArray(), db.cards.toArray()]);
  return groupByBook(ideas, cards);
}

export interface BookDetail {
  book: BookSummary;
  note: BookNote | null;
  /** Ideias do livro escolhidas como Idea of the Day em alguma sessão. */
  studiedIdeaIds: Set<string>;
}

export async function getBook(key: string): Promise<BookDetail | null> {
  const book = (await listBooks()).find((b) => b.key === key);
  if (!book) return null;
  const [note, sessions] = await Promise.all([db.bookNotes.get(key), db.sessions.toArray()]);
  return {
    book,
    note: note ?? null,
    studiedIdeaIds: new Set(sessions.flatMap((s) => (s.ideaOfDayId ? [s.ideaOfDayId] : []))),
  };
}

export function saveBookNote(
  key: string,
  title: string,
  patch: Partial<Pick<BookNote, 'takeaway' | 'finishedAt'>>,
): Promise<void> {
  return db.transaction('rw', db.bookNotes, async () => {
    const current = (await db.bookNotes.get(key)) ?? { id: key, title, takeaway: '', finishedAt: null };
    await db.bookNotes.put({ ...current, ...patch, title, updatedAt: nowISO() });
  });
}

/** Ideia anterior e seguinte dentro do mesmo livro, para ler o livro em sequência. */
export async function getNeighbors(idea: Idea): Promise<{ prev: Idea | null; next: Idea | null }> {
  const book = (await listBooks()).find((b) => b.key === bookKey(idea.bookTitle));
  const index = book?.ideas.findIndex((i) => i.id === idea.id) ?? -1;
  return {
    prev: (index > 0 ? book?.ideas[index - 1] : null) ?? null,
    next: (index >= 0 ? book?.ideas[index + 1] : null) ?? null,
  };
}

// ---------- Ações do "So What?" ----------

/** Dias entre registrar a ação e a pergunta "Did you do it?". */
export const FOLLOW_UP_DAYS = 3;

export interface PendingAction {
  reflection: Reflection;
  idea: Idea;
}

/** Ações registradas há pelo menos FOLLOW_UP_DAYS e ainda sem acompanhamento. */
export async function getPendingActions(date: ISODate = today()): Promise<PendingAction[]> {
  const reflections = await db.reflections.toArray();
  const pending: PendingAction[] = [];
  for (const reflection of reflections) {
    if (!reflection.soWhat.trim() || reflection.followUpStatus) continue;
    const idea = await db.ideas.get(reflection.ideaId);
    if (idea && addDays(idea.date, FOLLOW_UP_DAYS) <= date) pending.push({ reflection, idea });
  }
  return pending.sort((a, b) => a.idea.date.localeCompare(b.idea.date));
}

export async function saveFollowUp(
  reflectionId: string,
  patch: { status?: FollowUpStatus; text?: string },
): Promise<void> {
  await db.reflections.update(reflectionId, {
    ...(patch.status ? { followUpStatus: patch.status, followUpAt: nowISO() } : {}),
    ...(patch.text !== undefined ? { followUp: patch.text } : {}),
    updatedAt: nowISO(),
  });
}

// ---------- Dicionário ----------

export interface DictionaryInput {
  ideaId: string;
  term: string;
  meaning: string;
  context?: string | undefined;
  explanation?: string | undefined;
}

/**
 * O dicionário é o vocabulário de compreensão: guarda o que foi consultado, com o
 * contexto, mas não entra na repetição espaçada (isso é papel dos chunks).
 */
export function addToDictionary(input: DictionaryInput): Promise<ComprehensionVocab> {
  return db.transaction('rw', db.vocab, db.ideas, async () => {
    const term = input.term.trim();
    if (!term) throw new DomainError('Selecione uma palavra ou expressão.');
    const idea = await db.ideas.get(input.ideaId);
    if (!idea) throw new DomainError('Ideia não encontrada.');

    const existing = (await db.vocab.where('ideaId').equals(idea.id).toArray()).find(
      (v) => v.term.toLowerCase() === term.toLowerCase(),
    );
    const entry: ComprehensionVocab = {
      id: existing?.id ?? newId(),
      ideaId: idea.id,
      sessionId: idea.sessionId,
      term,
      meaning: input.meaning.trim(),
      ...(input.context?.trim() ? { context: input.context.trim() } : {}),
      ...(input.explanation?.trim() ? { explanation: input.explanation.trim() } : {}),
      createdAt: existing?.createdAt ?? nowISO(),
    };
    await db.vocab.put(entry);
    return entry;
  });
}

/** Entrada já salva para este termo, em qualquer ideia: evita consultar a IA de novo. */
export async function findInDictionary(term: string): Promise<ComprehensionVocab | null> {
  const wanted = term.trim().toLowerCase();
  const all = await db.vocab.toArray();
  return all.find((v) => v.term.toLowerCase() === wanted && v.meaning) ?? null;
}

export interface DictionaryItem {
  entry: ComprehensionVocab;
  idea: Idea | null;
}

export async function searchDictionary(query: string): Promise<DictionaryItem[]> {
  const [entries, ideas] = await Promise.all([db.vocab.toArray(), db.ideas.toArray()]);
  const ideasById = new Map(ideas.map((i) => [i.id, i]));
  const q = query.trim().toLowerCase();
  return entries
    .filter((e) => !q || `${e.term} ${e.meaning} ${e.context ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((entry) => ({ entry, idea: ideasById.get(entry.ideaId) ?? null }));
}

// ---------- Exercícios ----------

export async function loadPracticeMaterial(): Promise<PracticeMaterial> {
  const [vocab, chunks, cards] = await Promise.all([
    db.vocab.toArray(),
    db.chunks.toArray(),
    db.cards.toArray(),
  ]);
  return { vocab, chunks, cards };
}
