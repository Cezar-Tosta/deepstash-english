import { spokenWords } from './exercises';
import { splitSentences } from './reader';
import { countWords } from './session';

/** Faixa de tamanho recomendada para o texto de uma sessão, em palavras. */
export const TEXT_MIN_WORDS = 80;
export const TEXT_MAX_WORDS = 400;

export type TextLevel = 'A1–A2' | 'B1' | 'B2' | 'C1–C2';

export interface TextProfile {
  words: number;
  sentences: number;
  /** Palavras por frase, em média. */
  wordsPerSentence: number;
  /** Nível aproximado; null para texto vazio. */
  level: TextLevel | null;
}

/** Sílabas de uma palavra em inglês, por grupos de vogais. É uma aproximação, boa o bastante para estimar o nível. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  const groups = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 0);
}

/**
 * O nível vem do índice Flesch–Kincaid (frases longas e palavras de muitas sílabas sobem
 * o nível), convertido numa faixa aproximada do Quadro Europeu (CEFR). Não conhece o
 * vocabulário: serve para orientar a escolha do texto, não para classificá-lo com rigor.
 */
export function textProfile(text: string): TextProfile {
  const words = spokenWords(text);
  const sentences = Math.max(1, splitSentences(text).length);
  if (words.length === 0) return { words: 0, sentences: 0, wordsPerSentence: 0, level: null };
  const wordsPerSentence = words.length / sentences;
  const syllablesPerWord = words.reduce((sum, w) => sum + syllables(w), 0) / words.length;
  const grade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
  const level: TextLevel = grade <= 4 ? 'A1–A2' : grade <= 8 ? 'B1' : grade <= 12 ? 'B2' : 'C1–C2';
  return { words: words.length, sentences, wordsPerSentence, level };
}

/** Os primeiros parágrafos que cabem em `maxWords`: o trecho sugerido quando o texto é longo demais para uma sessão. */
export function firstParagraphsWithin(paragraphs: readonly string[], maxWords: number): string[] {
  const out: string[] = [];
  let total = 0;
  for (const p of paragraphs) {
    const words = countWords(p);
    if (out.length > 0 && total + words > maxWords) break;
    out.push(p);
    total += words;
  }
  return out;
}
