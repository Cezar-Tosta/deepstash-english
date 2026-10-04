export interface ImportedIdea {
  title: string;
  cards: string[];
}

/**
 * Texto colado de uma ideia inteira → título e cards. A primeira linha é o título;
 * cada bloco seguinte, separado por uma linha em branco, é um card. Se o texto vier
 * num bloco só, cada linha depois do título vira um card.
 */
export function parseIdeaText(text: string): ImportedIdea {
  const blocks = text
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const first = blocks[0];
  if (!first) return { title: '', cards: [] };

  const [title = '', ...restOfFirst] = first.split('\n').map((l) => l.trim());
  const tail = restOfFirst.filter(Boolean);
  if (blocks.length === 1) return { title, cards: tail };
  return { title, cards: [...(tail.length ? [tail.join('\n')] : []), ...blocks.slice(1)] };
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
