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
