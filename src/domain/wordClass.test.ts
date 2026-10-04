import { describe, expect, it } from 'vitest';
import { NO_CLASS, wordCategories, wordCategory } from './wordClass';

const entry = (term: string, wordClass?: string) => (wordClass === undefined ? { term } : { term, wordClass });

describe('tipo de cada termo do dicionário', () => {
  it('reconhece a classe descrita em português ou em inglês, com detalhes', () => {
    expect(wordCategory(entry('holding', 'verbo (gerúndio)'))).toBe('Verbo');
    expect(wordCategory(entry('mind', 'substantivo'))).toBe('Substantivo');
    expect(wordCategory(entry('habit', 'Noun'))).toBe('Substantivo');
    expect(wordCategory(entry('useful', 'adjetivo'))).toBe('Adjetivo');
    expect(wordCategory(entry('into', 'preposição'))).toBe('Preposição');
    expect(wordCategory(entry('however', 'conjunção / conector'))).toBe('Conjunção');
  });

  it('não confunde advérbio nem phrasal verb com verbo', () => {
    expect(wordCategory(entry('quickly', 'advérbio'))).toBe('Advérbio');
    expect(wordCategory(entry('quickly', 'adverb'))).toBe('Advérbio');
    expect(wordCategory(entry('give up', 'phrasal verb'))).toBe('Phrasal verb');
    expect(wordCategory(entry('give up', 'verbo frasal'))).toBe('Phrasal verb');
  });

  it('expressões: pela classe ou, na falta dela, por ter mais de uma palavra', () => {
    expect(wordCategory(entry('one thing at a time', 'expressão idiomática'))).toBe('Expressão');
    expect(wordCategory(entry('having ideas', 'locução verbal'))).toBe('Expressão');
    expect(wordCategory(entry('out of your head'))).toBe('Expressão');
    expect(wordCategory(entry('out of your head', ''))).toBe('Expressão');
  });

  it('palavra sem classe fica em "Sem classe"; classe desconhecida é mantida', () => {
    expect(wordCategory(entry('mind'))).toBe(NO_CLASS);
    expect(wordCategory(entry('wow', 'interjeição'))).toBe('Interjeição');
  });

  it('lista os tipos presentes com a contagem, na ordem do filtro', () => {
    const entries = [
      entry('mind'),
      entry('holding', 'verbo'),
      entry('out of your head'),
      entry('habit', 'substantivo'),
      entry('keep', 'verb'),
      entry('wow', 'interjeição'),
    ];
    expect(wordCategories(entries)).toEqual([
      { category: 'Substantivo', count: 1 },
      { category: 'Verbo', count: 2 },
      { category: 'Expressão', count: 1 },
      { category: 'Interjeição', count: 1 },
      { category: NO_CLASS, count: 1 },
    ]);
  });
});
