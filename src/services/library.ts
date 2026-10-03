import { db } from '../data/db';
import { type ChunkFilter, countRecall, matchesFilter, type RecallCount } from '../domain/chunks';
import { formatDate, today } from '../domain/dates';
import type { StatsInput } from '../domain/stats';
import type {
  Chunk,
  ChunkReview,
  ComprehensionVocab,
  ISODate,
  Reflection,
  SourceCard,
  SpeakingSession,
  StudySession,
} from '../domain/types';

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function matchesQuery(query: string, ...fields: string[]): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const haystack = normalize(fields.join(' \n '));
  return terms.every((t) => haystack.includes(t));
}

// ---------- MY KNOWLEDGE ----------

export interface CardListItem {
  card: SourceCard;
  isCardOfDay: boolean;
  chunks: string[];
}

/** Pesquisa por título, tema, palavra do texto, chunk ou data (dd/mm/aaaa ou aaaa-mm-dd). */
export async function searchCards(query: string, onlyCardOfDay: boolean): Promise<CardListItem[]> {
  const [cards, sessions, chunks] = await Promise.all([
    db.cards.toArray(),
    db.sessions.toArray(),
    db.chunks.toArray(),
  ]);
  const cardOfDayIds = new Set(sessions.map((s) => s.cardOfDayId));
  return cards
    .map((card): CardListItem => ({
      card,
      isCardOfDay: cardOfDayIds.has(card.id),
      chunks: chunks.filter((c) => c.sourceCardId === card.id).map((c) => c.text),
    }))
    .filter((item) => !onlyCardOfDay || item.isCardOfDay)
    .filter((item) =>
      matchesQuery(
        query,
        item.card.title,
        item.card.category,
        item.card.content,
        item.card.mainIdea,
        item.card.notes,
        item.card.date,
        formatDate(item.card.date, 'medium'),
        new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(item.card.date)),
        ...item.chunks,
      ),
    )
    .sort((a, b) => b.card.createdAt.localeCompare(a.card.createdAt));
}

export interface ChunkWithHistory {
  chunk: Chunk;
  reviews: ChunkReview[];
  recall: RecallCount;
  sourceCard: SourceCard | null;
}

export interface CardDetail {
  card: SourceCard;
  session: StudySession | null;
  isCardOfDay: boolean;
  vocab: ComprehensionVocab[];
  chunks: ChunkWithHistory[];
  speaking: SpeakingSession[];
  reflection: Reflection | null;
}

async function withHistory(chunk: Chunk, sourceCard: SourceCard | null): Promise<ChunkWithHistory> {
  const reviews = await db.reviews.where('chunkId').equals(chunk.id).sortBy('createdAt');
  return { chunk, reviews, recall: countRecall(reviews), sourceCard };
}

export async function getCardDetail(cardId: string): Promise<CardDetail | null> {
  const card = await db.cards.get(cardId);
  if (!card) return null;
  const session = (await db.sessions.get(card.sessionId)) ?? null;
  const isCardOfDay = session?.cardOfDayId === card.id;
  const [vocab, ownChunks, sessionChunks, speaking, reflection] = await Promise.all([
    db.vocab.where('cardId').equals(cardId).toArray(),
    db.chunks.where('sourceCardId').equals(cardId).toArray(),
    db.chunks.where('sessionId').equals(card.sessionId).toArray(),
    db.speaking.where('cardId').equals(cardId).toArray(),
    db.reflections.where('cardId').equals(cardId).first(),
  ]);
  // A página do Card of the Day mostra os 3 chunks do dia, que saem do conjunto dos cards.
  const chunks = (isCardOfDay ? sessionChunks : ownChunks).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  return {
    card,
    session,
    isCardOfDay,
    vocab,
    chunks: await Promise.all(chunks.map((c) => withHistory(c, card))),
    speaking,
    reflection: reflection ?? null,
  };
}

// ---------- MY ENGLISH ----------

export async function searchChunks(
  query: string,
  filter: ChunkFilter,
  date: ISODate = today(),
): Promise<ChunkWithHistory[]> {
  const [chunks, reviews, cards] = await Promise.all([
    db.chunks.toArray(),
    db.reviews.toArray(),
    db.cards.toArray(),
  ]);
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  return chunks
    .map((chunk): ChunkWithHistory => {
      const own = reviews
        .filter((r) => r.chunkId === chunk.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return {
        chunk,
        reviews: own,
        recall: countRecall(own),
        sourceCard: chunk.sourceCardId ? (cardsById.get(chunk.sourceCardId) ?? null) : null,
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
        item.sourceCard?.title ?? '',
      ),
    )
    .sort((a, b) => b.chunk.createdAt.localeCompare(a.chunk.createdAt));
}

// ---------- Estatísticas ----------

/** Os dados são locais e pequenos; carregar tudo e calcular no domínio mantém as regras testáveis. */
export async function loadStatsInput(): Promise<StatsInput> {
  const [sessions, cards, chunks, reviews, speaking] = await Promise.all([
    db.sessions.toArray(),
    db.cards.toArray(),
    db.chunks.toArray(),
    db.reviews.toArray(),
    db.speaking.toArray(),
  ]);
  return { sessions, cards, chunks, reviews, speaking };
}
