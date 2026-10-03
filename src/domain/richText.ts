export interface Span {
  text: string;
  style: 'plain' | 'bold' | 'italic' | 'code';
}

export type Block =
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'heading'; spans: Span[] }
  | { kind: 'list'; ordered: boolean; items: Span[][] };

// **negrito**, __negrito__, *itálico* e `código`. O itálico exige texto colado aos
// asteriscos, para não confundir com um asterisco solto no meio da frase.
const INLINE = /\*\*(.+?)\*\*|__(.+?)__|\*(?!\s)([^*\n]+?)(?<!\s)\*|`([^`\n]+?)`/g;

/** Separa uma linha em trechos comuns, em negrito, em itálico e em código. */
export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) spans.push({ text: text.slice(last, match.index), style: 'plain' });
    const [, strong, strongAlt, em, code] = match;
    if (strong ?? strongAlt) spans.push({ text: strong ?? strongAlt ?? '', style: 'bold' });
    else if (em) spans.push({ text: em, style: 'italic' });
    else if (code) spans.push({ text: code, style: 'code' });
    last = match.index + match[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last), style: 'plain' });
  return spans;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

/**
 * Interpreta o Markdown simples que os modelos de IA costumam devolver (tópicos,
 * listas numeradas, títulos, negrito e itálico) para exibir formatado, sem símbolos
 * sobrando. Não é um Markdown completo: o que não for reconhecido aparece como texto.
 */
export function parseRichText(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (!line.trim()) continue;

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet?.[1] ?? numbered?.[1];
    if (item !== undefined) {
      const ordered = numbered !== null;
      const previous = blocks.at(-1);
      if (previous?.kind === 'list' && previous.ordered === ordered) previous.items.push(parseInline(item));
      else blocks.push({ kind: 'list', ordered, items: [parseInline(item)] });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) blocks.push({ kind: 'heading', spans: parseInline(heading[1] ?? '') });
    else blocks.push({ kind: 'paragraph', spans: parseInline(line.trim()) });
  }
  return blocks;
}

/** O mesmo texto sem os símbolos de formatação. Para campos editáveis e textos de uma linha só. */
export function stripMarkdown(text: string): string {
  return parseInline(text)
    .map((span) => span.text)
    .join('');
}
