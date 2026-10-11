import type { Idea, ISODate, SourceCard } from './types';

/** Chave estável de uma fonte: o nome sem acentos, caixa ou espaços sobrando. */
export function bookKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export const NO_BOOK_TITLE = 'Sem fonte';

export interface BookSummary {
  key: string;
  title: string;
  /** Na ordem em que foram lidas. */
  ideas: Idea[];
  cardCount: number;
  firstDate: ISODate;
  lastDate: ISODate;
}

/**
 * Fonte → textos → parágrafos. A fonte é o nome informado em cada texto; textos com a
 * mesma fonte (ignorando caixa e acentos) ficam juntos. As mais recentes vêm primeiro.
 */
export function groupByBook(ideas: readonly Idea[], cards: readonly SourceCard[]): BookSummary[] {
  const cardsPerIdea = new Map<string, number>();
  for (const c of cards) cardsPerIdea.set(c.ideaId, (cardsPerIdea.get(c.ideaId) ?? 0) + 1);

  const books = new Map<string, BookSummary>();
  for (const idea of [...ideas].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const key = bookKey(idea.bookTitle);
    const book = books.get(key) ?? {
      key,
      title: idea.bookTitle.trim() || NO_BOOK_TITLE,
      ideas: [],
      cardCount: 0,
      firstDate: idea.date,
      lastDate: idea.date,
    };
    book.ideas.push(idea);
    book.cardCount += cardsPerIdea.get(idea.id) ?? 0;
    if (idea.date < book.firstDate) book.firstDate = idea.date;
    if (idea.date > book.lastDate) book.lastDate = idea.date;
    books.set(key, book);
  }
  return [...books.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}
