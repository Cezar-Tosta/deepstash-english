import { db } from '../data/db';
import { type ChunkFilter, countRecall, matchesFilter, type RecallCount } from '../domain/chunks';
import { formatDate, today } from '../domain/dates';
import type { StatsInput } from '../domain/stats';
import type {
  Chunk,
  ChunkReview,
  ComprehensionVocab,
  Idea,
  ISODate,
  Reflection,
  SourceCard,
  SpeakingSession,
  StudySession,
} from '../domain/types';
import { getCycleStarts } from './cycles';

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function matchesQuery(query: string, ...fields: string[]): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const haystack = normalize(fields.join(' \n '));
  return terms.every((t) => haystack.includes(t));
}

// ---------- MY KNOWLEDGE ----------

export interface IdeaListItem {
  idea: Idea;
  isIdeaOfDay: boolean;
  cardCount: number;
  chunks: string[];
}

/** Pesquisa por título, livro, tema, palavra dos cards, chunk ou data (dd/mm/aaaa ou aaaa-mm-dd). */
export async function searchIdeas(query: string, onlyIdeaOfDay: boolean): Promise<IdeaListItem[]> {
  const [ideas, cards, sessions, chunks] = await Promise.all([
    db.ideas.toArray(),
    db.cards.toArray(),
    db.sessions.toArray(),
    db.chunks.toArray(),
  ]);
  const ideaOfDayIds = new Set(sessions.map((s) => s.ideaOfDayId));
  return ideas
    .filter((idea) => !onlyIdeaOfDay || ideaOfDayIds.has(idea.id))
    .flatMap((idea): IdeaListItem[] => {
      const own = cards.filter((c) => c.ideaId === idea.id);
      const item: IdeaListItem = {
        idea,
        isIdeaOfDay: ideaOfDayIds.has(idea.id),
        cardCount: own.length,
        chunks: chunks.filter((c) => c.sourceIdeaId === idea.id).map((c) => c.text),
      };
      const found = matchesQuery(
        query,
        idea.title,
        idea.bookTitle,
        idea.category,
        idea.mainIdea,
        idea.notes,
        idea.date,
        formatDate(idea.date, 'medium'),
        new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(idea.date)),
        ...own.map((c) => c.content),
        ...item.chunks,
      );
      return found ? [item] : [];
    })
    .sort((a, b) => b.idea.createdAt.localeCompare(a.idea.createdAt));
}

export interface ChunkWithHistory {
  chunk: Chunk;
  reviews: ChunkReview[];
  recall: RecallCount;
  sourceIdea: Idea | null;
}

export interface IdeaDetail {
  idea: Idea;
  /** Na ordem de leitura. */
  cards: SourceCard[];
  session: StudySession | null;
  isIdeaOfDay: boolean;
  vocab: ComprehensionVocab[];
  chunks: ChunkWithHistory[];
  speaking: SpeakingSession[];
  reflection: Reflection | null;
}

async function withHistory(chunk: Chunk, sourceIdea: Idea | null): Promise<ChunkWithHistory> {
  const reviews = await db.reviews.where('chunkId').equals(chunk.id).sortBy('createdAt');
  return { chunk, reviews, recall: countRecall(reviews), sourceIdea };
}

export async function getIdeaDetail(ideaId: string): Promise<IdeaDetail | null> {
  const idea = await db.ideas.get(ideaId);
  if (!idea) return null;
  const session = (await db.sessions.get(idea.sessionId)) ?? null;
  const isIdeaOfDay = session?.ideaOfDayId === idea.id;
  const [cards, vocab, ownChunks, sessionChunks, speaking, reflection] = await Promise.all([
    db.cards.where('ideaId').equals(ideaId).sortBy('position'),
    db.vocab.where('ideaId').equals(ideaId).toArray(),
    db.chunks.where('sourceIdeaId').equals(ideaId).toArray(),
    db.chunks.where('sessionId').equals(idea.sessionId).toArray(),
    db.speaking.where('ideaId').equals(ideaId).toArray(),
    db.reflections.where('ideaId').equals(ideaId).first(),
  ]);
  // A página da Idea of the Day mostra os 3 chunks do dia, que saem do conjunto das ideias lidas.
  const chunks = (isIdeaOfDay ? sessionChunks : ownChunks).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    idea,
    cards,
    session,
    isIdeaOfDay,
    vocab: vocab.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' })),
    chunks: await Promise.all(chunks.map((c) => withHistory(c, idea))),
    speaking,
    reflection: reflection ?? null,
  };
}

// ---------- MY ENGLISH ----------

export async function searchChunks(query: string, filter: ChunkFilter, date: ISODate = today()): Promise<ChunkWithHistory[]> {
  const [chunks, reviews, ideas] = await Promise.all([db.chunks.toArray(), db.reviews.toArray(), db.ideas.toArray()]);
  const ideasById = new Map(ideas.map((i) => [i.id, i]));
  return chunks
    .map((chunk): ChunkWithHistory => {
      const own = reviews.filter((r) => r.chunkId === chunk.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return {
        chunk,
        reviews: own,
        recall: countRecall(own),
        sourceIdea: chunk.sourceIdeaId ? (ideasById.get(chunk.sourceIdeaId) ?? null) : null,
      };
    })
    .filter((item) => matchesFilter(item.chunk, item.reviews, filter, date))
    .filter((item) =>
      matchesQuery(
        query,
        item.chunk.text,
        item.chunk.meaning,
        item.chunk.originalSentence,
        item.chunk.userSentence,
        item.sourceIdea?.title ?? '',
        item.sourceIdea?.bookTitle ?? '',
      ),
    )
    .sort((a, b) => b.chunk.createdAt.localeCompare(a.chunk.createdAt));
}

// ---------- Estatísticas ----------

/** Os dados são locais e pequenos; carregar tudo e calcular no domínio mantém as regras testáveis. */
export async function loadStatsInput(): Promise<StatsInput> {
  const [sessions, ideas, cards, chunks, reviews, speaking, cycleStarts] = await Promise.all([
    db.sessions.toArray(),
    db.ideas.toArray(),
    db.cards.toArray(),
    db.chunks.toArray(),
    db.reviews.toArray(),
    db.speaking.toArray(),
    getCycleStarts(),
  ]);
  return { sessions, ideas, cards, chunks, reviews, speaking, cycleStarts };
}
