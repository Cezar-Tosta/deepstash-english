import { describe, expect, it } from 'vitest';
import { bookKey, groupByBook } from './books';
import { blankOut, buildExercises, buildFlashcards, dictationScore, isCorrect, pickFlashcards } from './exercises';
import { extendSelection, selectionText, sentenceAround, splitSentences, tokenize } from './reader';
import type { Chunk, ComprehensionVocab, Idea, SourceCard } from './types';

function idea(id: string, bookTitle: string, date: string): Idea {
  return {
    id,
    sessionId: `s-${date}`,
    date,
    bookTitle,
    title: `Idea ${id}`,
    mainIdea: '',
    category: '',
    notes: '',
    createdAt: `${date}T10:00:0${id.length}.000Z`,
  };
}

function card(id: string, ideaId: string, content: string): SourceCard {
  return { id, ideaId, sessionId: 's', date: '2026-10-03', position: 0, content, createdAt: '' };
}

describe('livro → ideias → cards', () => {
  const ideas = [
    idea('a', 'Atomic Habits', '2026-10-01'),
    idea('bb', 'atomic habits ', '2026-10-03'),
    idea('ccc', 'Deep Work', '2026-10-02'),
    idea('dddd', '', '2026-09-30'),
  ];
  const cards = [card('1', 'a', 'x'), card('2', 'a', 'y'), card('3', 'bb', 'z'), card('4', 'ccc', 'w')];
  const books = groupByBook(ideas, cards);

  it('junta no mesmo livro títulos que só diferem em caixa, acento ou espaços', () => {
    expect(bookKey('  Atômic   HABITS ')).toBe('atomic habits');
    const atomic = books.find((b) => b.key === 'atomic habits');
    expect(atomic?.ideas.map((i) => i.id)).toEqual(['a', 'bb']);
    expect(atomic?.title).toBe('Atomic Habits');
  });

  it('cada livro tem uma quantidade própria de ideias e de cards', () => {
    expect(books.map((b) => [b.title, b.ideas.length, b.cardCount])).toEqual([
      ['Atomic Habits', 2, 3],
      ['Deep Work', 1, 1],
      ['Sem livro', 1, 0],
    ]);
  });

  it('o livro lido mais recentemente vem primeiro', () => {
    expect(books[0]).toMatchObject({ firstDate: '2026-10-01', lastDate: '2026-10-03' });
  });
});

describe('leitura com clique nas palavras', () => {
  const text = "Your mind is for having ideas, not holding them. Don't keep it in your head!";
  const tokens = tokenize(text);
  const indexOf = (word: string) => tokens.findIndex((t) => t.text === word);

  it('separa palavras de pontuação sem perder nenhum caractere', () => {
    expect(tokens.map((t) => t.text).join('')).toBe(text);
    expect(tokens.filter((t) => t.isWord).map((t) => t.text)).toContain("Don't");
    expect(tokens.find((t) => t.text === ', ')?.isWord).toBe(false);
  });

  it('um clique seleciona a palavra; outro clique estende até formar a expressão', () => {
    const first = extendSelection(null, indexOf('in'));
    const range = extendSelection(first, indexOf('head'));
    expect(selectionText(tokens, range!)).toBe('in your head');
  });

  it('estende também para trás, e clicar de novo na palavra única desfaz', () => {
    const start = extendSelection(null, indexOf('holding'));
    expect(selectionText(tokens, extendSelection(start, indexOf('not'))!)).toBe('not holding');
    expect(extendSelection(start, indexOf('holding'))).toBeNull();
  });

  it('o contexto é a frase em que a seleção está, não o card inteiro', () => {
    const selection = { start: indexOf('in'), end: indexOf('head') };
    expect(sentenceAround(tokens, selection)).toBe("Don't keep it in your head!");
    const other = { start: indexOf('holding'), end: indexOf('holding') };
    expect(sentenceAround(tokens, other)).toBe('Your mind is for having ideas, not holding them.');
  });

  it('divide um card em frases', () => {
    expect(splitSentences(text)).toEqual([
      'Your mind is for having ideas, not holding them.',
      "Don't keep it in your head!",
    ]);
  });
});

describe('exercícios', () => {
  it('troca a expressão por uma lacuna, ignorando caixa e reticências do chunk', () => {
    expect(blankOut('I do One Thing at a time.', 'one thing at a time')).toBe('I do _____.');
    expect(blankOut('Think before you speak.', 'before you...')).toBe('Think _____ speak.');
    expect(blankOut('Nothing to see here.', 'in your head')).toBeNull();
  });

  it('não confunde o termo com um pedaço de outra palavra', () => {
    expect(blankOut('The rutabaga is a root.', 'rut')).toBeNull();
    expect(blankOut('Stuck in a rut.', 'rut')).toBe('Stuck in a _____.');
  });

  it('aceita a resposta sem exigir caixa nem pontuação', () => {
    expect(isCorrect('  One thing at a time! ', 'one thing at a time')).toBe(true);
    expect(isCorrect('don’t', "don't")).toBe(true);
    expect(isCorrect('one thing', 'one thing at a time')).toBe(false);
    expect(isCorrect('', '')).toBe(false);
  });

  it('o ditado dá crédito parcial pelas palavras certas na ordem', () => {
    const original = 'Keep it out of your head.';
    expect(dictationScore('keep it out of your head', original)).toBe(1);
    expect(dictationScore('keep it of your head', original)).toBeCloseTo(5 / 6);
    expect(dictationScore('', original)).toBe(0);
  });

  const vocab: ComprehensionVocab[] = [
    { id: 'v1', ideaId: 'a', sessionId: 's', term: 'rut', meaning: 'rotina sem saída', context: 'Stuck in a rut.', createdAt: '' },
    { id: 'v2', ideaId: 'a', sessionId: 's', term: 'grit', meaning: '', createdAt: '' },
  ];
  const chunks = [
    { id: 'k1', text: 'in your head', meaning: 'na sua cabeça', userSentence: 'It lives in your head.', originalSentence: '' },
  ] as Chunk[];
  const material = { vocab, chunks, cards: [card('1', 'a', 'Do one thing at a time. Ok. Keep it out of your head, always.')] };

  it('dicionário PT → EN usa só entradas com significado', () => {
    expect(buildExercises('dictionary', material)).toEqual([
      expect.objectContaining({ hint: 'rotina sem saída', answer: 'rut', prompt: 'Stuck in a _____.' }),
    ]);
  });

  it('completar a frase usa as frases dos chunks e o contexto do dicionário', () => {
    expect(buildExercises('gap', material).map((e) => [e.prompt, e.answer])).toEqual([
      ['It lives _____.', 'in your head'],
      ['Stuck in a _____.', 'rut'],
    ]);
  });

  it('o ditado usa frases dos cards de tamanho razoável', () => {
    expect(buildExercises('dictation', material).map((e) => e.answer)).toEqual([
      'Do one thing at a time.',
      'Keep it out of your head, always.',
    ]);
  });

  it('escrever com a expressão oferece chunks e palavras do dicionário', () => {
    expect(buildExercises('write', material).map((e) => e.prompt)).toEqual(['in your head', 'rut', 'grit']);
  });
});

describe('flashcards', () => {
  const vocab: ComprehensionVocab[] = [
    { id: 'v1', ideaId: 'a', sessionId: 's', term: 'rut', meaning: 'rotina sem saída', context: 'Stuck in a rut.', createdAt: '' },
    { id: 'v2', ideaId: 'a', sessionId: 's', term: 'grit', meaning: '', createdAt: '' },
  ];
  const chunks = [
    { id: 'k1', text: 'in your head', meaning: 'na sua cabeça', userSentence: 'It lives in your head.', originalSentence: '' },
    { id: 'k2', text: 'it turns out that', meaning: '', userSentence: '', originalSentence: 'It turns out that focus wins.' },
  ] as Chunk[];
  const material = { vocab, chunks, cards: [] };

  it('monta a partir do dicionário, dos chunks ou dos dois', () => {
    expect(buildFlashcards(material, 'dictionary').map((c) => c.front)).toEqual(['rut']);
    expect(buildFlashcards(material, 'chunks').map((c) => c.front)).toEqual(['in your head', 'it turns out that']);
    expect(buildFlashcards(material, 'both')).toHaveLength(3);
  });

  it('deixa de fora o que não tem nada para mostrar no verso', () => {
    expect(buildFlashcards(material, 'both').some((c) => c.front === 'grit')).toBe(false);
    expect(buildFlashcards(material, 'chunks')[1]).toMatchObject({ back: '', context: 'It turns out that focus wins.' });
  });

  it('respeita a quantidade pedida, sem repetir e sem passar do que existe', () => {
    const all = buildFlashcards(material, 'both');
    expect(pickFlashcards(all, 2)).toHaveLength(2);
    expect(new Set(pickFlashcards(all, 3).map((c) => c.id)).size).toBe(3);
    expect(pickFlashcards(all, 50)).toHaveLength(3);
    expect(pickFlashcards(all, 0)).toHaveLength(1);
  });
});
