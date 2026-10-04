/** Um pedaço de texto e se ele difere da outra versão. */
export interface DiffSegment {
  text: string;
  changed: boolean;
}

export interface TextDiff {
  /** O texto original, com o que foi retirado ou trocado marcado. */
  before: DiffSegment[];
  /** O texto corrigido, com o que foi acrescentado ou trocado marcado. */
  after: DiffSegment[];
  /** Há alguma diferença entre as duas versões? */
  changed: boolean;
}

/** Palavras e espaços, alternados, na ordem do texto. */
function pieces(text: string): string[] {
  return text.split(/(\s+)/u).filter((piece) => piece !== '');
}

const isSpace = (piece: string): boolean => /^\s+$/u.test(piece);

/** Marca, em cada lista, as palavras que fazem parte da maior sequência comum às duas. */
function commonWords(a: readonly string[], b: readonly string[]): [Set<number>, Set<number>] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        a[i] === b[j] ? (table[(i + 1) * cols + j + 1] ?? 0) + 1 : Math.max(table[(i + 1) * cols + j] ?? 0, table[i * cols + j + 1] ?? 0);
    }
  }
  const keptA = new Set<number>();
  const keptB = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      keptA.add(i);
      keptB.add(j);
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * cols + j] ?? 0) >= (table[i * cols + j + 1] ?? 0)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return [keptA, keptB];
}

/** Remonta o texto em trechos, juntando palavras vizinhas com a mesma marcação. */
function segments(all: readonly string[], kept: ReadonlySet<number>): DiffSegment[] {
  const out: DiffSegment[] = [];
  let word = 0;
  for (const piece of all) {
    const space = isSpace(piece);
    const changed = !space && !kept.has(word);
    if (!space) word += 1;
    const last = out.at(-1);
    // O espaço entre duas palavras marcadas fica dentro da marca; os outros, fora.
    if (last && (space || last.changed === changed)) {
      if (space && last.changed) out.push({ text: piece, changed: false });
      else last.text += piece;
    } else {
      out.push({ text: piece, changed });
    }
  }
  // Une "marcado + espaço + marcado" num trecho só, para o destaque não ficar picotado.
  const merged: DiffSegment[] = [];
  for (const [index, segment] of out.entries()) {
    const previous = merged.at(-1);
    const next = out[index + 1];
    if (previous?.changed && !segment.changed && isSpace(segment.text) && next?.changed) {
      previous.text += segment.text;
    } else if (previous?.changed && segment.changed) {
      previous.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

/**
 * Compara duas versões de um texto, palavra por palavra, para mostrar onde a
 * correção mexeu. Diferença só de espaços não conta.
 */
export function diffText(original: string, corrected: string): TextDiff {
  const a = pieces(original);
  const b = pieces(corrected);
  const wordsA = a.filter((piece) => !isSpace(piece));
  const wordsB = b.filter((piece) => !isSpace(piece));
  const [keptA, keptB] = commonWords(wordsA, wordsB);
  return {
    before: segments(a, keptA),
    after: segments(b, keptB),
    changed: keptA.size !== wordsA.length || keptB.size !== wordsB.length,
  };
}

export interface InlinePart {
  text: string;
  kind: 'same' | 'removed' | 'added';
}

/**
 * Original e correção numa sequência só: o que saiu e o que entrou aparecem no ponto
 * em que a mudança aconteceu, sem repetir o resto da frase.
 */
export function inlineDiff(original: string, corrected: string): InlinePart[] {
  const a = pieces(original).filter((piece) => !isSpace(piece));
  const b = pieces(corrected).filter((piece) => !isSpace(piece));
  const [keptA, keptB] = commonWords(a, b);
  const out: InlinePart[] = [];
  const push = (text: string, kind: InlinePart['kind']) => {
    const last = out.at(-1);
    if (last?.kind === kind) last.text += ` ${text}`;
    else {
      if (last) out.push({ text: ' ', kind: 'same' });
      out.push({ text, kind });
    }
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    while (i < a.length && !keptA.has(i)) push(a[i++] ?? '', 'removed');
    while (j < b.length && !keptB.has(j)) push(b[j++] ?? '', 'added');
    if (i < a.length && j < b.length) {
      push(b[j] ?? '', 'same');
      i += 1;
      j += 1;
    }
  }
  // Junta "igual + espaço + igual" que o separador acima deixou em pedaços.
  const merged: InlinePart[] = [];
  for (const part of out) {
    const last = merged.at(-1);
    if (last && last.kind === 'same' && part.kind === 'same') last.text += part.text;
    else merged.push({ ...part });
  }
  return merged;
}
