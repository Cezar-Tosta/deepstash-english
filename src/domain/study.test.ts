import { describe, expect, it } from 'vitest';
import { bookKey, groupByBook } from './books';
import {
  blankOut,
  buildFlashcards,
  buildTenseTraining,
  buildTraining,
  dictationScore,
  hardest,
  isCorrect,
  pickFlashcards,
  questionsFor,
  requeue,
  splitAround,
  studyItems,
  tenseQuestions,
  withoutContext,
} from './exercises';
import { parseIdeaJSON, parseIdeaText } from './ideaImport';
import { annotate, extendSelection, selectionText, sentenceAround, splitSentences, termWords, tokenize } from './reader';
import type { Chunk, ChunkReview, ComprehensionVocab, Idea, PracticeStat, SourceCard, VerbEntry } from './types';

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

describe('correção das respostas', () => {
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
});

describe('treino: nenhuma palavra solta', () => {
  const vocab: ComprehensionVocab[] = [
    { id: 'v1', ideaId: 'a', sessionId: 's', term: 'rut', meaning: 'rotina sem saída', context: 'Stuck in a rut.', wordClass: 'substantivo', explanation: 'Aqui é uma rotina da qual não se sai.', createdAt: '' },
    { id: 'v2', ideaId: 'a', sessionId: 's', term: 'grit', meaning: 'garra', createdAt: '' },
  ];
  const chunks = [
    { id: 'k1', text: 'in your head', meaning: 'na sua cabeça', userSentence: 'It lives in your head.', originalSentence: '' },
    { id: 'k2', text: 'it turns out that', meaning: '', userSentence: '', originalSentence: 'It turns out that focus wins.' },
    { id: 'k3', text: 'on purpose', meaning: 'de propósito', userSentence: '', originalSentence: '', extraSentences: ['I did it on purpose.'] },
    { id: 'k4', text: 'by heart', meaning: 'de cor', userSentence: '', originalSentence: '' },
  ] as Chunk[];
  const review = (chunkId: string, rating: 'AGAIN' | 'HARD' | 'GOOD') =>
    ({ id: chunkId + rating, chunkId, rating }) as ChunkReview;
  const stat = (id: string, right: number, wrong: number): PracticeStat => ({ id, right, wrong, lastAt: '' });

  const material = {
    vocab,
    chunks,
    stats: [stat('vocab:v1', 0, 3), stat('chunk:k1', 1, 1)],
    reviews: [review('k2', 'AGAIN'), review('k2', 'HARD'), review('k1', 'GOOD')],
    verbs: [],
  };
  const items = studyItems(material);
  const byKey = new Map(items.map((i) => [i.key, i]));

  it('só entra nos exercícios o termo que tem ao menos uma frase', () => {
    expect(items.map((i) => i.key)).toEqual(['vocab:v1', 'chunk:k1', 'chunk:k2', 'chunk:k3']);
    // "grit" e "by heart" têm tradução, mas nenhuma frase: ficam de fora.
    expect(withoutContext(material)).toBe(2);
  });

  it('frases extras escritas com o chunk também servem de contexto', () => {
    expect(byKey.get('chunk:k3')?.sentences).toEqual(['I did it on purpose.']);
  });

  it('erros pesam o dobro dos acertos; nas revisões, "não lembrei" e "difícil" também contam', () => {
    expect(byKey.get('vocab:v1')?.difficulty).toBe(6);
    expect(byKey.get('chunk:k1')?.difficulty).toBe(1);
    // nunca treinado (1) + AGAIN (2) + HARD (1)
    expect(byKey.get('chunk:k2')?.difficulty).toBe(4);
    expect(hardest(items, 5).map((i) => i.term)).toEqual(['rut', 'in your head']);
  });

  it('toda pergunta traz uma frase: para completar, para ouvir e completar, ou para ouvir e escrever', () => {
    for (const item of items) {
      for (const q of questionsFor(item)) {
        expect(q.full.split(' ').length).toBeGreaterThan(1);
        if (q.kind !== 'dictation') expect(q.prompt).toContain('_____');
      }
    }
    expect(questionsFor(byKey.get('vocab:v1')!).map((q) => q.kind)).toEqual(['gap', 'listen', 'dictation']);
  });

  it('completar mostra a frase com lacuna; ouvir e completar usa a mesma frase, falada inteira', () => {
    const [gap, listen, dictation] = questionsFor(byKey.get('vocab:v1')!);
    expect(gap).toMatchObject({ prompt: 'Stuck in a _____.', answer: 'rut', hint: 'rotina sem saída', full: 'Stuck in a rut.' });
    expect(listen).toMatchObject({ prompt: 'Stuck in a _____.', answer: 'rut', hint: '', full: 'Stuck in a rut.' });
    expect(dictation).toMatchObject({ prompt: '', answer: 'Stuck in a rut.' });
  });

  it('o treino escolhe os termos mais difíceis e gira a forma da pergunta', () => {
    expect(buildTraining(items, 2).map((q) => q.itemKey).sort()).toEqual(['chunk:k2', 'vocab:v1']);
    expect(buildTraining(items, 99)).toHaveLength(4);
    const kindAfter = (right: number) =>
      buildTraining(studyItems({ ...material, stats: [stat('vocab:v1', right, 9)] }), 1)[0]?.kind;
    expect([kindAfter(0), kindAfter(1), kindAfter(2)]).toEqual(['gap', 'listen', 'dictation']);
  });

  it('a pergunta errada volta algumas posições adiante, na mesma rodada', () => {
    const queue = buildTraining(items, 4);
    const again = requeue(queue, 0);
    expect(again).toHaveLength(5);
    expect(again[4]).toBe(queue[0]);
  });

  it('flashcard mostra o termo dentro da frase, com classe gramatical e uso no contexto', () => {
    const [card] = buildFlashcards(items, 'dictionary');
    expect(card).toMatchObject({
      front: 'rut',
      context: 'Stuck in a rut.',
      back: 'rotina sem saída',
      wordClass: 'substantivo',
      explanation: 'Aqui é uma rotina da qual não se sai.',
    });
    expect(splitAround(card!.context, card!.front)).toEqual({ before: 'Stuck in a ', match: 'rut', after: '.' });
    expect(buildFlashcards(items, 'both').every((c) => c.context !== '')).toBe(true);
  });

  it('flashcards: origem, quantidade e prioridade para os difíceis', () => {
    expect(buildFlashcards(items, 'chunks').map((c) => c.front)).toEqual(['in your head', 'it turns out that', 'on purpose']);
    const all = buildFlashcards(items, 'both');
    expect(pickFlashcards(all, 2)).toHaveLength(2);
    expect(pickFlashcards(all, 50)).toHaveLength(4);
    expect(pickFlashcards(all, 0)).toHaveLength(1);
    const difficulty = new Map(items.map((i) => [i.key, i.difficulty]));
    for (let i = 0; i < 5; i += 1) expect(pickFlashcards(all, 1, { difficulty })[0]?.front).toBe('rut');
  });
});

describe('tempos verbais', () => {
  const verb = (id: string, base: string, selected: boolean): VerbEntry => ({
    id,
    ideaId: 'a',
    base,
    translation: '',
    thirdPerson: '',
    past: '',
    participle: '',
    gerund: '',
    textForm: '',
    textTense: '',
    sentence: '',
    selected,
    drills: [
      { tense: 'Past simple', sentence: `Yesterday she _____ the idea.`, answer: 'held' },
      { tense: 'Present perfect', sentence: 'He ____ it for years.', answer: 'has held' },
      { tense: 'Broken', sentence: 'No blank here.', answer: 'x' },
    ],
    createdAt: '',
  });
  const verbs = [verb('h', 'hold', true), verb('k', 'keep', false)];

  it('só os verbos selecionados geram perguntas, cada uma com frase, tempo e verbo', () => {
    const questions = tenseQuestions(verbs);
    expect(questions.map((q) => q.itemKey)).toEqual(['verb:h:0', 'verb:h:1']);
    expect(questions[0]).toMatchObject({
      kind: 'tense',
      prompt: 'Yesterday she _____ the idea.',
      hint: 'Past simple · to hold',
      answer: 'held',
      full: 'Yesterday she held the idea.',
    });
    expect(questions[1]?.full).toBe('He has held it for years.');
  });

  it('a rodada começa pela pergunta mais errada', () => {
    const stats: PracticeStat[] = [{ id: 'verb:h:1', right: 0, wrong: 3, lastAt: '' }];
    for (let i = 0; i < 5; i += 1) expect(buildTenseTraining(verbs, stats, 1)[0]?.itemKey).toBe('verb:h:1');
    expect(buildTenseTraining(verbs, [], 99)).toHaveLength(2);
  });
});

describe('importar uma ideia colada', () => {
  it('a primeira linha é o título e cada bloco é um card', () => {
    expect(parseIdeaText('Thought Into Action\n\nYour mind is for having ideas.\n\nDo one thing\nat a time.')).toEqual({
      title: 'Thought Into Action',
      cards: ['Your mind is for having ideas.', 'Do one thing\nat a time.'],
    });
  });

  it('sem linhas em branco, cada linha depois do título vira um card', () => {
    expect(parseIdeaText('Title\nFirst card.\nSecond card.')).toEqual({
      title: 'Title',
      cards: ['First card.', 'Second card.'],
    });
  });

  it('aceita só o título e ignora texto vazio', () => {
    expect(parseIdeaText('Only a title')).toEqual({ title: 'Only a title', cards: [] });
    expect(parseIdeaText('  \n ')).toEqual({ title: '', cards: [] });
  });

  it('lê a resposta da IA ao transcrever screenshots', () => {
    const raw = 'Aqui está: ' + JSON.stringify({ title: 'Make It Obvious', cards: ['Card one.', '  ', 'Card two.'] });
    expect(parseIdeaJSON(raw)).toEqual({ title: 'Make It Obvious', cards: ['Card one.', 'Card two.'] });
    expect(parseIdeaJSON('sem json')).toEqual({ title: '', cards: [] });
  });
});

describe('termos conhecidos sublinhados no texto', () => {
  const tokens = tokenize('Keep it out of your head. Use your Head, not your heart.');
  const cover = (entries: { term: string }[]) =>
    annotate(tokens, entries).map((a) => [a.entry.term, selectionText(tokens, a)]);

  it('acha palavras soltas em qualquer caixa, em todas as ocorrências', () => {
    expect(cover([{ term: 'head' }])).toEqual([
      ['head', 'head'],
      ['head', 'Head'],
    ]);
  });

  it('acha expressões de várias palavras', () => {
    expect(cover([{ term: 'out of your head' }])).toEqual([['out of your head', 'out of your head']]);
  });

  it('a expressão mais longa vence a palavra que está dentro dela', () => {
    expect(cover([{ term: 'head' }, { term: 'out of your head' }])).toEqual([
      ['out of your head', 'out of your head'],
      ['head', 'Head'],
    ]);
  });

  it('ignora as reticências de chunks abertos e não casa pedaço de palavra', () => {
    expect(termWords('before you...')).toEqual(['before', 'you']);
    expect(cover([{ term: 'hear' }, { term: 'you' }])).toEqual([]);
  });
});
