import { locateTerm, spokenWords } from './exercises';

/** Hesitações comuns em inglês falado. As de duas palavras vêm primeiro para não serem contadas aos pedaços. */
const FILLERS: readonly string[][] = [['you', 'know'], ['i', 'mean'], ['um'], ['uh'], ['er'], ['erm'], ['hmm'], ['ah']];

export interface Fluency {
  /** Palavras ditas, sem as hesitações. */
  words: number;
  /** Palavras por minuto; null sem fala ou sem duração. */
  wpm: number | null;
  /** Fração de palavras diferentes (0 a 1); null sem fala. */
  variety: number | null;
  /** Quantas hesitações apareceram. */
  fillers: number;
  /** Os chunks que apareceram na fala, na ordem em que foram passados. */
  chunksUsed: string[];
}

/** Métricas de fluência calculadas da transcrição e da duração, sem IA. */
export function fluencyOf(transcript: string, durationSec: number, chunks: readonly string[]): Fluency {
  const all = spokenWords(transcript);
  const kept: string[] = [];
  let fillers = 0;
  for (let i = 0; i < all.length;) {
    const filler = FILLERS.find((f) => f.every((w, k) => all[i + k] === w));
    if (filler) {
      fillers += 1;
      i += filler.length;
    } else {
      kept.push(all[i] ?? '');
      i += 1;
    }
  }
  const words = kept.length;
  return {
    words,
    wpm: words > 0 && durationSec > 0 ? Math.round((words / durationSec) * 60) : null,
    variety: words > 0 ? new Set(kept).size / words : null,
    fillers,
    chunksUsed: chunks.filter((c) => locateTerm(transcript, c) !== null),
  };
}
