export interface Token {
  text: string;
  /** Palavras são clicáveis; espaços e pontuação não. */
  isWord: boolean;
}

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/** Separa o texto em palavras e no que fica entre elas, sem perder nenhum caractere. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of text.matchAll(WORD)) {
    if (match.index > last) tokens.push({ text: text.slice(last, match.index), isWord: false });
    tokens.push({ text: match[0], isWord: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last), isWord: false });
  return tokens;
}

export interface Selection {
  /** Índices de token (inclusive) da primeira e da última palavra escolhidas. */
  start: number;
  end: number;
}

/**
 * Clicar numa palavra a seleciona; clicar em outra estende a seleção até ela, para
 * pegar expressões inteiras. Clicar na única palavra selecionada desfaz.
 */
export function extendSelection(current: Selection | null, index: number): Selection | null {
  if (!current) return { start: index, end: index };
  if (current.start === index && current.end === index) return null;
  if (index < current.start) return { start: index, end: current.end };
  if (index > current.end) return { start: current.start, end: index };
  return { start: index, end: index };
}

export function selectionText(tokens: readonly Token[], selection: Selection): string {
  return tokens
    .slice(selection.start, selection.end + 1)
    .map((t) => t.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const SENTENCE_END = /[.!?…]["”’)]*\s/;

/** A frase em que a seleção está: é o contexto enviado junto com o termo. */
export function sentenceAround(tokens: readonly Token[], selection: Selection): string {
  let start = selection.start;
  while (start > 0 && !SENTENCE_END.test(`${tokens[start - 1]?.text ?? ''} `.replace(/\n/g, '. '))) {
    start -= 1;
  }
  let end = selection.end;
  while (end < tokens.length - 1) {
    const next = tokens[end + 1];
    if (!next) break;
    end += 1;
    if (!next.isWord && /[.!?…\n]/.test(next.text)) break;
  }
  return tokens
    .slice(start, end + 1)
    .map((t) => t.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Divide um texto em frases. Usado para montar exercícios a partir dos cards. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- Termos conhecidos dentro do texto ----------

export interface Annotation<T> {
  /** Índices de token (inclusive) cobertos pelo termo. */
  start: number;
  end: number;
  entry: T;
}

const normalizeWord = (word: string): string => word.toLowerCase().replace(/[’`]/g, "'");

/** As palavras de um termo, prontas para comparar. Reticências de chunks abertos ("before you...") são ignoradas. */
export function termWords(term: string): string[] {
  return tokenize(term)
    .filter((t) => t.isWord)
    .map((t) => normalizeWord(t.text));
}

/**
 * Localiza no texto os termos já conhecidos (dicionário e chunks), inclusive
 * expressões de várias palavras. Quando dois termos disputam o mesmo trecho, vence
 * o mais longo: "out of your head" tem prioridade sobre "head".
 */
export function annotate<T extends { term: string }>(
  tokens: readonly Token[],
  entries: readonly T[],
): Annotation<T>[] {
  const wordAt: number[] = [];
  tokens.forEach((t, i) => {
    if (t.isWord) wordAt.push(i);
  });
  const words = wordAt.map((i) => normalizeWord(tokens[i]?.text ?? ''));

  const candidates = entries
    .map((entry) => ({ entry, words: termWords(entry.term) }))
    .filter((c) => c.words.length > 0)
    .sort((a, b) => b.words.length - a.words.length);

  const taken = Array.from({ length: words.length }, () => false);
  const found: Annotation<T>[] = [];
  for (const candidate of candidates) {
    const size = candidate.words.length;
    for (let i = 0; i + size <= words.length; i += 1) {
      let fits = true;
      for (let k = 0; k < size && fits; k += 1) {
        fits = !taken[i + k] && words[i + k] === candidate.words[k];
      }
      if (!fits) continue;
      for (let k = 0; k < size; k += 1) taken[i + k] = true;
      found.push({ start: wordAt[i] ?? 0, end: wordAt[i + size - 1] ?? 0, entry: candidate.entry });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}
