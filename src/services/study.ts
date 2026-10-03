import { db } from '../data/db';
import { type BookSummary, bookKey, groupByBook } from '../domain/books';
import { isDue, overdueDays } from '../domain/chunks';
import { cyclePosition, weekPlan } from '../domain/cycle';
import { addDays, diffDays, nowISO, startOfWeek, today } from '../domain/dates';
import { coreTerm, hardest, type PracticeMaterial, questionsFor, studyItems } from '../domain/exercises';
import { stepIndex, STEPS } from '../domain/session';
import { type Suggestion, suggestToday } from '../domain/suggestion';
import { newId } from '../domain/ids';
import type {
  BookNote,
  Chunk,
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
  phonetic?: string | undefined;
  wordClass?: string | undefined;
}

const sameText = (a: string | undefined, b: string | undefined): boolean =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** Ordem alfabética ignorando maiúsculas e acentos. */
export const byTerm = (a: { term: string }, b: { term: string }): number =>
  a.term.localeCompare(b.term, 'en', { sensitivity: 'base' });

/**
 * O dicionário é o vocabulário de compreensão: guarda o que foi consultado, com o
 * contexto, mas não entra na repetição espaçada (isso é papel dos chunks).
 *
 * A mesma palavra pode ter sentidos diferentes em frases diferentes, então cada
 * par termo + frase é uma entrada própria. Repetir o mesmo par atualiza a entrada.
 */
export function addToDictionary(input: DictionaryInput): Promise<ComprehensionVocab> {
  return db.transaction('rw', db.vocab, db.ideas, async () => {
    const term = input.term.trim();
    if (!term) throw new DomainError('Selecione uma palavra ou expressão.');
    const idea = await db.ideas.get(input.ideaId);
    if (!idea) throw new DomainError('Ideia não encontrada.');

    const existing = (await db.vocab.where('ideaId').equals(idea.id).toArray()).find(
      (v) => sameText(v.term, term) && sameText(v.context, input.context),
    );
    const entry: ComprehensionVocab = {
      id: existing?.id ?? newId(),
      ideaId: idea.id,
      sessionId: idea.sessionId,
      term,
      meaning: input.meaning.trim(),
      ...(input.context?.trim() ? { context: input.context.trim() } : {}),
      ...(input.explanation?.trim() ? { explanation: input.explanation.trim() } : {}),
      ...(input.phonetic?.trim() ? { phonetic: input.phonetic.trim() } : {}),
      ...(input.wordClass?.trim() ? { wordClass: input.wordClass.trim() } : {}),
      createdAt: existing?.createdAt ?? nowISO(),
    };
    await db.vocab.put(entry);
    return entry;
  });
}

/**
 * Entrada já salva para este termo nesta mesma frase. Em outra frase o sentido pode
 * ser outro, então a análise é refeita no novo contexto.
 */
export async function findInDictionary(term: string, context: string): Promise<ComprehensionVocab | null> {
  const all = await db.vocab.toArray();
  return all.find((v) => sameText(v.term, term) && sameText(v.context, context) && v.meaning) ?? null;
}

/** Todas as entradas salvas para este termo, em qualquer ideia ou frase. */
export async function findEntries(term: string): Promise<ComprehensionVocab[]> {
  const all = await db.vocab.toArray();
  return all.filter((v) => sameText(v.term, term)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Chunks cujo texto é este termo (as reticências de chunks abertos não contam). */
export async function findChunks(term: string): Promise<Chunk[]> {
  const all = await db.chunks.toArray();
  return all.filter((c) => sameText(coreTerm(c.text), term)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Exclui o termo do dicionário por inteiro: todos os registros dele, de qualquer
 * ideia ou frase. Com isso ele deixa de aparecer destacado em todos os textos.
 */
export function deleteTerm(term: string): Promise<number> {
  return db.transaction('rw', db.vocab, db.practiceStats, async () => {
    const entries = (await db.vocab.toArray()).filter((v) => sameText(v.term, term));
    await db.practiceStats.bulkDelete(entries.map((e) => `vocab:${e.id}`));
    await db.vocab.bulkDelete(entries.map((e) => e.id));
    return entries.length;
  });
}

export async function updateDictionaryEntry(
  id: string,
  patch: { meaning: string; explanation?: string | undefined },
): Promise<void> {
  const meaning = patch.meaning.trim();
  if (!meaning) throw new DomainError('Informe a tradução.');
  await db.vocab.update(id, { meaning, explanation: patch.explanation?.trim() ?? '' });
}

export interface DictionaryItem {
  entry: ComprehensionVocab;
  idea: Idea | null;
}

/** Em ordem alfabética. */
export async function searchDictionary(query: string): Promise<DictionaryItem[]> {
  const [entries, ideas] = await Promise.all([db.vocab.toArray(), db.ideas.toArray()]);
  const ideasById = new Map(ideas.map((i) => [i.id, i]));
  const q = query.trim().toLowerCase();
  return entries
    .filter((e) => !q || `${e.term} ${e.meaning} ${e.context ?? ''}`.toLowerCase().includes(q))
    .sort(byTerm)
    .map((entry) => ({ entry, idea: ideasById.get(entry.ideaId) ?? null }));
}

// ---------- Glossário: o que já é conhecido, para sublinhar nos textos ----------

export interface Sense {
  meaning: string;
  phonetic: string;
  explanation: string;
  /** Frase em que este sentido foi registrado. */
  context: string;
  source: 'dictionary' | 'chunk';
}

export interface GlossaryEntry {
  term: string;
  /** Um termo pode ter sido registrado em mais de uma frase, com sentidos diferentes. */
  senses: Sense[];
}

/** Dicionário e chunks de todas as ideias, agrupados por termo. */
export async function loadGlossary(): Promise<GlossaryEntry[]> {
  const [vocab, chunks] = await Promise.all([db.vocab.toArray(), db.chunks.toArray()]);
  const byKey = new Map<string, GlossaryEntry>();
  const add = (term: string, sense: Sense) => {
    const clean = term.replace(/[.…]+$/, '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    const entry = byKey.get(key) ?? { term: clean, senses: [] };
    if (!entry.senses.some((s) => sameText(s.meaning, sense.meaning) && sameText(s.context, sense.context))) {
      entry.senses.push(sense);
    }
    byKey.set(key, entry);
  };
  for (const v of vocab) {
    add(v.term, {
      meaning: v.meaning.trim(),
      phonetic: v.phonetic ?? '',
      explanation: v.explanation ?? '',
      context: v.context ?? '',
      source: 'dictionary',
    });
  }
  for (const c of chunks) {
    add(c.text, {
      meaning: c.meaning.trim(),
      phonetic: '',
      explanation: '',
      context: c.originalSentence,
      source: 'chunk',
    });
  }
  return [...byKey.values()].sort(byTerm);
}

// ---------- Exercícios ----------

export async function loadPracticeMaterial(): Promise<PracticeMaterial> {
  const [vocab, chunks, stats, reviews, verbs] = await Promise.all([
    db.vocab.toArray(),
    db.chunks.toArray(),
    db.practiceStats.toArray(),
    db.reviews.toArray(),
    db.verbs.toArray(),
  ]);
  return { vocab, chunks, stats, reviews, verbs };
}

// ---------- Sugestão de estudo para o dia ----------

/** Junta o estado atual (revisões, sessão, ações, treino, semana) e monta o plano de hoje. */
export async function loadSuggestion(date: ISODate = today()): Promise<Suggestion[]> {
  const weekStart = startOfWeek(date);
  const [session, dueCandidates, actions, material, weekSessions, weekly, settings] = await Promise.all([
    db.sessions.where('date').equals(date).first(),
    db.chunks.where('nextReviewDate').belowOrEqual(date).toArray(),
    getPendingActions(date),
    loadPracticeMaterial(),
    db.sessions.where('date').between(weekStart, addDays(weekStart, 6), true, true).toArray(),
    db.weeklyReviews.get(weekStart),
    db.settings.get('settings'),
  ]);

  const due = dueCandidates.filter((c) => isDue(c, date));
  const items = studyItems(material);
  const lastPractice = material.stats.reduce((latest, s) => (s.lastAt > latest ? s.lastAt : latest), '');
  const index = session ? stepIndex(session.currentStep) : 0;
  const cycleStart = settings?.cycleStartDate ?? weekStart;

  return suggestToday({
    date,
    weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
    dueReviews: due.length,
    overdueReviews: due.filter((c) => overdueDays(c, date) > 0).length,
    session: !session ? 'none' : session.status === 'completed' ? 'completed' : 'in_progress',
    currentStepLabel: STEPS[index]?.label ?? '',
    remainingMinutes: STEPS.slice(index).reduce((sum, s) => sum + s.minutes, 0),
    sessionMinutes: STEPS.reduce((sum, s) => sum + s.minutes, 0),
    speakingLabel: weekPlan(session?.cycleWeek ?? cyclePosition(cycleStart, date).week).speakingLabel,
    pendingActions: actions.length,
    trainableItems: items.filter((i) => questionsFor(i).length > 0).length,
    hardItems: hardest(items, 99).length,
    daysSincePractice: lastPractice ? diffDays(lastPractice.slice(0, 10), date) : null,
    weekIdeas: weekSessions.filter((s) => s.ideaOfDayId).length,
    weeklyDone: Boolean(weekly?.completedAt),
  });
}
