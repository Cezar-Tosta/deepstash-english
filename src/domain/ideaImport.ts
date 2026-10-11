/** Título e parágrafos de um texto lido de imagens. */
export interface ImportedIdea {
  title: string;
  cards: string[];
}

/** Aceita o JSON que a IA devolve ao ler os screenshots, mesmo embrulhado em texto. */
export function parseIdeaJSON(raw: string): ImportedIdea {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  let data: unknown = null;
  try {
    data = start >= 0 && end > start ? JSON.parse(raw.slice(start, end + 1)) : null;
  } catch {
    data = null;
  }
  const obj = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const title = obj['title'];
  const cards = obj['cards'];
  return {
    title: typeof title === 'string' ? title.trim() : '',
    cards: Array.isArray(cards) ? cards.flatMap((c) => (typeof c === 'string' && c.trim() ? [c.trim()] : [])) : [],
  };
}
