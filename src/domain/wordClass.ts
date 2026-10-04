import type { ComprehensionVocab } from './types';

/** Sem classe registrada e de uma palavra só: não dá para saber o tipo. */
export const NO_CLASS = 'Sem classe';

/**
 * Tipos em que os termos do dicionário são agrupados. A IA descreve a classe em texto
 * livre ("verbo (gerúndio)", "phrasal verb", "noun"); aqui ela vira um tipo estável.
 * A ordem importa: "advérbio" contém "verb", e "phrasal verb" também.
 */
const RULES: readonly [RegExp, string][] = [
  [/phrasal|frasal/u, 'Phrasal verb'],
  [/express|idiom|locu[cç]|colloc|coloca[cç]|chunk|frase/u, 'Expressão'],
  [/adv[eé]rb/u, 'Advérbio'],
  [/verb/u, 'Verbo'],
  [/substantiv|noun/u, 'Substantivo'],
  [/adjetiv|adjectiv/u, 'Adjetivo'],
  [/preposi/u, 'Preposição'],
  [/conjun|conect|connect/u, 'Conjunção'],
  [/pronom|pronoun/u, 'Pronome'],
];

/** Ordem em que os tipos aparecem no filtro; os demais vêm depois, em ordem alfabética. */
const ORDER = ['Substantivo', 'Verbo', 'Phrasal verb', 'Adjetivo', 'Advérbio', 'Expressão', 'Preposição', 'Conjunção', 'Pronome'];

type Classed = Pick<ComprehensionVocab, 'term' | 'wordClass'>;

/** O tipo de um termo do dicionário: substantivo, verbo, expressão… */
export function wordCategory(entry: Classed): string {
  const described = (entry.wordClass ?? '').trim().toLowerCase();
  for (const [pattern, category] of RULES) {
    if (pattern.test(described)) return category;
  }
  // Mais de uma palavra sem classe reconhecida é uma expressão.
  if (entry.term.trim().split(/\s+/u).length > 1) return 'Expressão';
  if (described) return described.replace(/^./u, (c) => c.toUpperCase());
  return NO_CLASS;
}

export interface CategoryCount {
  category: string;
  count: number;
}

/** Os tipos presentes numa lista de termos, com quantos há de cada um. */
export function wordCategories(entries: readonly Classed[]): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const category = wordCategory(entry);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const rank = (category: string): number => {
    if (category === NO_CLASS) return ORDER.length + 1;
    const index = ORDER.indexOf(category);
    return index < 0 ? ORDER.length : index;
  };
  return [...counts]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => rank(a.category) - rank(b.category) || a.category.localeCompare(b.category, 'pt-BR'));
}
