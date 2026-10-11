import { splitSentences } from './reader';
import { countWords } from './session';

/** Faixa de tamanho, em palavras, de uma frase boa para ditar: nem trivial, nem longa demais para lembrar. */
const MIN_WORDS = 6;
const MAX_WORDS = 30;

/**
 * Frases do texto para o ditado da etapa LISTEN: de tamanho bom para ditar (até `maxWords`, que cresce com a fase), espalhadas
 * do começo ao fim do texto e na ordem em que aparecem. Sem nenhuma frase nessa faixa,
 * ficam as mais longas que houver.
 */
export function listeningSentences(paragraphs: readonly string[], count: number, maxWords = MAX_WORDS): string[] {
  const all = paragraphs.flatMap(splitSentences);
  const good = all.filter((s) => {
    const words = countWords(s);
    return words >= MIN_WORDS && words <= maxWords;
  });
  if (good.length === 0) {
    const longest = new Set([...all].sort((a, b) => countWords(b) - countWords(a)).slice(0, count));
    return all.filter((s) => longest.has(s));
  }
  if (good.length <= count) return good;
  // Uma frase do meio de cada fatia do texto.
  return Array.from({ length: count }, (_, i) => good[Math.floor(((i + 0.5) * good.length) / count)] ?? '').filter(Boolean);
}
