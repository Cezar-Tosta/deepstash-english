import { describe, expect, it } from 'vitest';
import { bookKey, groupByBook } from './books';
import {
  blankOut,
  buildFlashcards,
  buildTenseTraining,
  buildTraining,
  hardest,
  hardestVerbs,
  buildDictations,
  checkDictation,
  DICTATION_PASS,
  dictationItems,
  dictationScore,
  tidySentence,
  isCorrect,
  locateTerm,
  pickFlashcards,
  questionsFor,
  requeue,
  splitAround,
  studyItems,
  tenseNames,
  tenseQuestions,
  verbBases,
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
    expect(splitSentences(text)).toEqual(['Your mind is for having ideas, not holding them.', "Don't keep it in your head!"]);
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

describe('achar o termo dentro da frase', () => {
  it('texto exato: destaca o trecho como está escrito na frase', () => {
    expect(locateTerm('I do One Thing at a time.', 'one thing at a time')).toEqual({
      before: 'I do ',
      match: 'One Thing at a time',
      after: '.',
    });
  });

  it('chunk cadastrado com uma palavra faltando ainda é achado na frase', () => {
    expect(locateTerm('So far, I have studied one thing at a time.', 'one thing at time')).toEqual({
      before: 'So far, I have studied ',
      match: 'one thing at a time',
      after: '.',
    });
  });

  it('palavra a mais no meio da expressão também é tolerada', () => {
    expect(locateTerm('Keep it out of your own head, please.', 'out of your head')?.match).toBe('out of your own head');
  });

  it('palavra com outra flexão é achada', () => {
    expect(locateTerm('Your mind is not for holding ideas.', 'hold')?.match).toBe('holding');
    expect(locateTerm('Small habits compound.', 'habit')?.match).toBe('habits');
  });

  it('não inventa: sem trecho parecido, não há destaque', () => {
    expect(locateTerm('Nothing to see here.', 'in your head')).toBeNull();
    expect(locateTerm('The rutabaga is a root.', 'rut')).toBeNull();
    expect(locateTerm('I held the door.', 'hold')).toBeNull();
    expect(locateTerm('We met at a time of change.', 'one thing at a time')).toBeNull();
  });

  it('no exercício, a lacuna cobre o trecho real e a resposta é o inglês correto da frase', () => {
    const [item] = studyItems({
      vocab: [],
      chunks: [
        {
          id: 'k',
          text: 'one thing at time',
          meaning: 'uma coisa de cada vez',
          userSentence: 'So far, I have studied one thing at a time.',
          originalSentence: '',
        },
      ] as Chunk[],
      stats: [],
      reviews: [],
      verbs: [],
    });
    const gap = questionsFor(item!).find((q) => q.kind === 'gap');
    expect(gap).toMatchObject({ prompt: 'So far, I have studied _____.', answer: 'one thing at a time' });
    const [card] = buildFlashcards([item!], 'chunks');
    expect(splitAround(card!.context, card!.front)?.match).toBe('one thing at a time');
  });
});
describe('treino: nenhuma palavra solta', () => {
  const vocab: ComprehensionVocab[] = [
    {
      id: 'v1',
      ideaId: 'a',
      sessionId: 's',
      term: 'rut',
      meaning: 'rotina sem saída',
      context: 'Stuck in a rut.',
      wordClass: 'substantivo',
      explanation: 'Aqui é uma rotina da qual não se sai.',
      createdAt: '',
    },
    { id: 'v2', ideaId: 'a', sessionId: 's', term: 'grit', meaning: 'garra', createdAt: '' },
  ];
  const chunks = [
    { id: 'k1', text: 'in your head', meaning: 'na sua cabeça', userSentence: 'It lives in your head.', originalSentence: '' },
    { id: 'k2', text: 'it turns out that', meaning: '', userSentence: '', originalSentence: 'It turns out that focus wins.' },
    {
      id: 'k3',
      text: 'on purpose',
      meaning: 'de propósito',
      userSentence: '',
      originalSentence: '',
      extraSentences: ['I did it on purpose.'],
    },
    { id: 'k4', text: 'by heart', meaning: 'de cor', userSentence: '', originalSentence: '' },
  ] as Chunk[];
  const review = (chunkId: string, rating: 'AGAIN' | 'HARD' | 'GOOD') => ({ id: chunkId + rating, chunkId, rating }) as ChunkReview;
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
    expect(
      buildTraining(items, 2)
        .map((q) => q.itemKey)
        .sort(),
    ).toEqual(['chunk:k2', 'vocab:v1']);
    expect(buildTraining(items, 99)).toHaveLength(4);
    const kindAfter = (right: number) => buildTraining(studyItems({ ...material, stats: [stat('vocab:v1', right, 9)] }), 1)[0]?.kind;
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

describe('configurar o treino de tempos verbais', () => {
  const make = (id: string, base: string, tenses: string[], selected = true, ideaId = 'a'): VerbEntry => ({
    id,
    ideaId,
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
    drills: tenses.map((tense) => ({ tense, sentence: `She _____ it (${tense}).`, answer: base })),
    createdAt: '',
  });
  const verbs = [
    make('h', 'hold', ['Past simple', 'Present perfect', 'Future (will)']),
    make('k', 'keep', ['Past simple', 'present perfect ']),
    make('h2', 'hold', ['Past simple'], true, 'b'),
    make('w', 'write', ['Past simple'], false),
  ];

  it('lista os verbos marcados para estudo, sem repetir o que aparece em mais de uma ideia', () => {
    expect(verbBases(verbs)).toEqual(['hold', 'keep']);
  });

  it('lista os tempos disponíveis, juntando grafias diferentes do mesmo tempo', () => {
    expect(tenseNames(verbs)).toEqual(['Past simple', 'Present perfect', 'Future (will)']);
  });

  it('filtra por verbo, por tempo, ou pelos dois', () => {
    const only = (filter: Parameters<typeof tenseQuestions>[1]) => tenseQuestions(verbs, filter).map((q) => q.hint);
    expect(tenseQuestions(verbs)).toHaveLength(6);
    expect(only({ bases: new Set(['keep']) })).toEqual(['Past simple · to keep', 'present perfect · to keep']);
    expect(only({ tenses: new Set(['present perfect']) })).toEqual(['Present perfect · to hold', 'present perfect · to keep']);
    expect(only({ bases: new Set(['hold']), tenses: new Set(['future (will)']) })).toEqual(['Future (will) · to hold']);
    expect(only({ bases: new Set(), tenses: new Set(['past simple']) })).toEqual([]);
  });

  it('a rodada respeita o filtro e a quantidade pedida', () => {
    const filter = { tenses: new Set(['past simple']) };
    const round = buildTenseTraining(verbs, [], 2, { filter });
    expect(round).toHaveLength(2);
    expect(round.every((q) => q.hint.startsWith('Past simple'))).toBe(true);
    expect(buildTenseTraining(verbs, [], 99, { filter })).toHaveLength(3);
  });

  it('aponta os verbos mais errados, somando as frases do verbo em todas as ideias', () => {
    const stats: PracticeStat[] = [
      { id: 'verb:h:0', right: 1, wrong: 2, lastAt: '' },
      { id: 'verb:h2:0', right: 0, wrong: 1, lastAt: '' },
      { id: 'verb:k:0', right: 6, wrong: 1, lastAt: '' },
      { id: 'verb:w:0', right: 0, wrong: 9, lastAt: '' },
    ];
    // "keep" tem mais acertos que erros e "write" não está marcado para estudo.
    expect(hardestVerbs(verbs, stats, 5)).toEqual([{ base: 'hold', right: 1, wrong: 3 }]);
    expect(hardestVerbs(verbs, [], 5)).toEqual([]);
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
  const cover = (entries: { term: string }[]) => annotate(tokens, entries).map((a) => [a.entry.term, selectionText(tokens, a)]);

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

describe('ditado com uma, duas ou três palavras ou chunks por áudio', () => {
  const material = {
    vocab: [
      { id: 'v1', term: 'holding', meaning: 'guardando', context: 'Your mind is not for holding ideas.' },
      { id: 'v2', term: 'mind', meaning: 'mente', context: 'Your mind is not for holding ideas.' },
      { id: 'v3', term: 'solta', meaning: 'sem frase' },
    ] as ComprehensionVocab[],
    chunks: [
      {
        id: 'c1',
        text: 'one thing at a time',
        meaning: 'uma coisa de cada vez',
        originalSentence: 'Do one thing at a time',
        userSentence: '',
      },
      { id: 'c2', text: 'out of your head', meaning: 'fora da cabeça', originalSentence: 'Keep it out of your head.', userSentence: '' },
    ] as Chunk[],
    stats: [],
    reviews: [],
    verbs: [],
  };
  const items = studyItems(material);
  const first = () => 0;

  it('só entram termos com uma frase curta em que aparecem; dá para filtrar palavras ou chunks', () => {
    expect(
      dictationItems(items, 'both')
        .map((i) => i.term)
        .sort(),
    ).toEqual(['holding', 'mind', 'one thing at a time', 'out of your head']);
    expect(dictationItems(items, 'chunks')).toHaveLength(2);
    expect(dictationItems(items, 'dictionary')).toHaveLength(2);
  });

  it('um termo por áudio: cada ditado é uma frase', () => {
    const round = buildDictations(items, { source: 'chunks', perAudio: 1, count: 5, random: first });
    expect(round).toHaveLength(2);
    expect(round.every((d) => d.parts.length === 1)).toBe(true);
  });

  it('dois ou três por áudio: as frases são ditas em sequência, cada uma com sua pontuação', () => {
    const [two] = buildDictations(items, { source: 'chunks', perAudio: 2, count: 1, random: first });
    expect(two!.parts).toHaveLength(2);
    expect(two!.full.split(' ').length).toBeGreaterThan(8);
    expect(two!.full).toMatch(/Do one thing at a time\./);
    expect(two!.full).toMatch(/Keep it out of your head\./);

    const [three, rest] = buildDictations(items, { source: 'both', perAudio: 3, count: 4, random: first });
    expect(three!.parts).toHaveLength(3);
    // "holding" e "mind" vêm da mesma frase: não entram no mesmo áudio.
    expect(new Set(three!.parts.map((p) => p.sentence)).size).toBe(3);
    expect(rest!.parts).toHaveLength(1);
  });

  it('a conferência é palavra por palavra, sem ligar para maiúsculas e pontuação, e aponta o que faltou', () => {
    const exact = checkDictation('do one thing at a time. keep it out of your head', 'Do one thing at a time. Keep it out of your head.');
    expect(exact).toMatchObject({ score: 1, missed: 0 });

    const partial = checkDictation('Do one think at time', 'Do one thing at a time.');
    expect(partial.words.filter((w) => !w.hit).map((w) => w.text)).toEqual(['thing', 'a']);
    expect(partial.score).toBeCloseTo(4 / 6);
    expect(partial.score).toBeLessThan(DICTATION_PASS);

    expect(checkDictation('', 'Do it.')).toMatchObject({ score: 0, missed: 2 });
  });
});

describe('ditado: só as palavras contam; a resposta mostra a frase bem escrita', () => {
  it('pontuação, maiúsculas e apóstrofos não tiram ponto', () => {
    const expected = "Don't keep it in your head — write it down, one thing at a time.";
    const typed = 'dont keep it in your head write it down one thing at a time';
    expect(checkDictation(typed, expected)).toMatchObject({ score: 1, missed: 0 });
    expect(dictationScore(typed, expected)).toBe(1);
    expect(checkDictation('Dont, keep it! in your head; write it down: one thing at a time?', expected).score).toBe(1);
  });

  it('palavra com hífen vale pelas palavras que contém', () => {
    expect(checkDictation('a well known idea', 'A well-known idea.').score).toBe(1);
    const half = checkDictation('a well idea', 'A well-known idea.');
    expect(half.words.filter((w) => !w.hit).map((w) => w.text)).toEqual(['well-known']);
    expect(half.score).toBeCloseTo(3 / 4);
  });

  it('palavra errada continua contando como erro', () => {
    const result = checkDictation('Do one think at a time', 'Do one thing at a time.');
    expect(result.words.filter((w) => !w.hit).map((w) => w.text)).toEqual(['thing']);
    expect(result.score).toBeCloseTo(5 / 6);
  });

  it('a resposta mostra a frase com maiúscula no começo e pontuação no fim', () => {
    expect(tidySentence('do one thing at a time')).toBe('Do one thing at a time.');
    expect(tidySentence('  keep it   out of your head!  ')).toBe('Keep it out of your head!');
    expect(tidySentence('Is it true?')).toBe('Is it true?');
    expect(tidySentence('“focus on one task”')).toBe('“Focus on one task”.');
    expect(tidySentence('')).toBe('');

    const [item] = studyItems({
      vocab: [],
      chunks: [
        { id: 'k', text: 'one thing at a time', meaning: '', originalSentence: 'do one thing at a time', userSentence: '' },
      ] as Chunk[],
      stats: [],
      reviews: [],
      verbs: [],
    });
    const [dictation] = buildDictations([item!], { source: 'both', perAudio: 1, count: 1 });
    expect(dictation!.full).toBe('Do one thing at a time.');
    expect(dictation!.parts[0]).toMatchObject({ sentence: 'do one thing at a time', shown: 'Do one thing at a time.' });
  });
});
