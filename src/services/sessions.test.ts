import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { sessionProgress } from '../domain/session';
import { ChunkLimitError, DomainError } from './errors';
import {
  addCards,
  addChunk,
  addIdea,
  addVocab,
  deleteCard,
  deleteIdea,
  finishSession,
  lastBookTitle,
  loadSessionBundle,
  recordSpeaking,
  replaceChunk,
  saveReflection,
  setIdeaOfDay,
  splitIntoCards,
  startSession,
  updateChunk,
  updateIdea,
} from './sessions';

const DAY = '2026-10-03'; // sábado

describe('criação de sessão', () => {
  it('cria a sessão do dia na semana 1 do ciclo 1 e fixa o início do ciclo na segunda', async () => {
    const session = await startSession(DAY);
    expect(session).toMatchObject({
      date: DAY,
      cycleNumber: 1,
      cycleWeek: 1,
      status: 'in_progress',
      currentStep: 'review',
      ideaOfDayId: null,
    });
    expect((await db.settings.get('settings'))?.cycleStartDate).toBe('2026-09-28');
  });

  it('é idempotente: abrir de novo devolve a mesma sessão', async () => {
    const first = await startSession(DAY);
    const second = await startSession(DAY);
    expect(second.id).toBe(first.id);
    expect(await db.sessions.count()).toBe(1);
  });

  it('avança a semana do ciclo e recomeça depois da quarta', async () => {
    await startSession(DAY);
    expect((await startSession('2026-10-05')).cycleWeek).toBe(2);
    expect((await startSession('2026-10-19')).cycleWeek).toBe(4);
    expect(await startSession('2026-10-26')).toMatchObject({ cycleNumber: 2, cycleWeek: 1 });
  });
});

describe('ideias e seus cards', () => {
  it('uma ideia guarda o livro e os cards na ordem de leitura', async () => {
    const session = await startSession(DAY);
    await addIdea(session.id, {
      title: 'Thought Into Action',
      bookTitle: 'Getting Things Done',
      cards: ['First card.', 'Second card.', 'Third card.'],
    });

    const bundle = await loadSessionBundle(DAY);
    expect(bundle?.ideas).toHaveLength(1);
    expect(bundle?.ideas[0]?.idea.bookTitle).toBe('Getting Things Done');
    expect(bundle?.ideas[0]?.cards.map((c) => [c.position, c.content])).toEqual([
      [0, 'First card.'],
      [1, 'Second card.'],
      [2, 'Third card.'],
    ]);
  });

  it('a quantidade de ideias e de cards por ideia é livre', async () => {
    const session = await startSession(DAY);
    await addIdea(session.id, { title: 'Sem cards registrados' });
    await addIdea(session.id, { title: 'Um card', cards: ['only one'] });
    await addIdea(session.id, { title: 'Sete cards', cards: ['1', '2', '3', '4', '5', '6', '7'] });

    const bundle = await loadSessionBundle(DAY);
    expect(bundle?.ideas.map((i) => i.cards.length)).toEqual([0, 1, 7]);
  });

  it('novos cards entram no fim e remover um mantém a sequência sem buracos', async () => {
    const session = await startSession(DAY);
    const idea = await addIdea(session.id, { title: 'Story', cards: ['a', 'b'] });
    await addCards(idea.id, ['c', 'd']);

    const before = (await loadSessionBundle(DAY))?.ideas[0]?.cards ?? [];
    expect(before.map((c) => c.content)).toEqual(['a', 'b', 'c', 'd']);

    await deleteCard(before[1]!.id);
    const after = (await loadSessionBundle(DAY))?.ideas[0]?.cards ?? [];
    expect(after.map((c) => [c.position, c.content])).toEqual([
      [0, 'a'],
      [1, 'c'],
      [2, 'd'],
    ]);
  });

  it('texto colado vira um card por bloco separado por linha em branco', () => {
    expect(splitIntoCards('First card\nsecond line.\n\n  Second card.  \n\n\n\nThird card.')).toEqual([
      'First card\nsecond line.',
      'Second card.',
      'Third card.',
    ]);
    expect(splitIntoCards('   \n\n ')).toEqual([]);
  });

  it('lembra o último livro para a próxima ideia', async () => {
    const session = await startSession(DAY);
    expect(await lastBookTitle()).toBe('');
    await addIdea(session.id, { title: 'A', bookTitle: 'Atomic Habits' });
    await addIdea(session.id, { title: 'B', bookTitle: 'Deep Work' });
    await addIdea(session.id, { title: 'C' });
    expect(await lastBookTitle()).toBe('Deep Work');
  });

  it('exige título', async () => {
    const session = await startSession(DAY);
    await expect(addIdea(session.id, { title: '   ' })).rejects.toBeInstanceOf(DomainError);
  });
});

describe('Idea of the Day', () => {
  it('mantém apenas uma ideia escolhida por sessão', async () => {
    const session = await startSession(DAY);
    const a = await addIdea(session.id, { title: 'Thought Into Action' });
    const b = await addIdea(session.id, { title: 'Deep Work' });

    await setIdeaOfDay(session.id, a.id);
    await setIdeaOfDay(session.id, b.id);

    const bundle = await loadSessionBundle(DAY);
    expect(bundle?.ideaOfDay?.idea.id).toBe(b.id);
    expect(bundle?.ideas).toHaveLength(2);
  });

  it('recusa ideia de outra sessão', async () => {
    const today = await startSession(DAY);
    const other = await startSession('2026-10-04');
    const idea = await addIdea(other.id, { title: 'Outro dia' });
    await expect(setIdeaOfDay(today.id, idea.id)).rejects.toBeInstanceOf(DomainError);
  });

  it('apagar a ideia escolhida limpa a escolha, apaga os cards e preserva os chunks', async () => {
    const session = await startSession(DAY);
    const idea = await addIdea(session.id, { title: 'Thought Into Action', cards: ['a', 'b'] });
    await setIdeaOfDay(session.id, idea.id);
    await addChunk(session.id, { text: 'one thing at a time' });

    await deleteIdea(idea.id);

    const bundle = await loadSessionBundle(DAY);
    expect(bundle?.session.ideaOfDayId).toBeNull();
    expect(await db.cards.count()).toBe(0);
    expect(bundle?.chunks).toHaveLength(1);
    expect(bundle?.chunks[0]?.sourceIdeaId).toBeNull();
  });
});

describe('limite de 3 chunks por dia', () => {
  it('aceita três e recusa o quarto', async () => {
    const session = await startSession(DAY);
    await addChunk(session.id, { text: 'one thing at a time' });
    await addChunk(session.id, { text: 'before you...' });
    await addChunk(session.id, { text: 'in your head' });

    await expect(addChunk(session.id, { text: 'it turns out that' })).rejects.toBeInstanceOf(
      ChunkLimitError,
    );
    expect(await db.chunks.count()).toBe(3);
  });

  it('permite substituir um dos três', async () => {
    const session = await startSession(DAY);
    const first = await addChunk(session.id, { text: 'one thing at a time' });
    await addChunk(session.id, { text: 'before you...' });
    await addChunk(session.id, { text: 'in your head' });

    await replaceChunk(first.id, { text: 'it turns out that' });

    const texts = (await db.chunks.toArray()).map((c) => c.text).sort();
    expect(texts).toEqual(['before you...', 'in your head', 'it turns out that']);
  });

  it('o limite é por dia, não global', async () => {
    const day1 = await startSession(DAY);
    for (const text of ['a b', 'c d', 'e f']) await addChunk(day1.id, { text });
    const day2 = await startSession('2026-10-04');
    await expect(addChunk(day2.id, { text: 'g h' })).resolves.toMatchObject({ text: 'g h' });
  });

  it('o chunk já nasce com a revisão D1 agendada', async () => {
    const session = await startSession(DAY);
    const chunk = await addChunk(session.id, { text: 'in your head' });
    expect(chunk).toMatchObject({
      createdDate: DAY,
      stage: 0,
      status: 'new',
      nextReviewDate: '2026-10-04',
    });
  });
});

describe('vocabulário de compreensão', () => {
  it('não entra na repetição espaçada', async () => {
    const session = await startSession(DAY);
    const idea = await addIdea(session.id, { title: 'Thought Into Action' });
    await addVocab(session.id, idea.id, 'rut', 'rotina sem saída');
    expect(await db.vocab.count()).toBe(1);
    expect(await db.chunks.count()).toBe(0);
  });
});

describe('finalização da sessão', () => {
  it('recusa finalizar sem nenhuma ideia', async () => {
    const session = await startSession(DAY);
    await expect(finishSession(session.id)).rejects.toBeInstanceOf(DomainError);
  });

  it('finaliza com uma única ideia e menos de 3 chunks', async () => {
    const session = await startSession(DAY);
    await addIdea(session.id, { title: 'Só uma ideia' });
    await finishSession(session.id);
    const stored = await db.sessions.get(session.id);
    expect(stored?.status).toBe('completed');
    expect(stored?.completedAt).not.toBeNull();
  });

  it('registra o fluxo completo do exemplo "Thought Into Action"', async () => {
    const session = await startSession(DAY);
    const idea = await addIdea(session.id, {
      title: 'Thought Into Action',
      bookTitle: 'Getting Things Done',
      cards: ['Card one.', 'Card two.', 'Card three.'],
    });
    await addIdea(session.id, { title: 'Another idea', cards: ['x', 'y'] });
    await setIdeaOfDay(session.id, idea.id);
    await updateIdea(idea.id, {
      mainIdea: 'The main idea is that we should focus on one task at a time.',
    });

    const texts = ['one thing at a time', 'before you...', 'in your head'];
    for (const text of texts) await addChunk(session.id, { text });
    const first = (await db.chunks.toArray()).find((c) => c.text === 'one thing at a time');
    await updateChunk(first?.id ?? '', {
      userSentence: 'I need to finish one task before I start another one.',
    });

    await recordSpeaking({
      kind: 'daily',
      sessionId: session.id,
      ideaId: idea.id,
      date: DAY,
      durationSec: 73,
      targetSec: 60,
    });
    await saveReflection(session.id, idea.id, {
      userOpinion: 'I agree, but sometimes we need to manage several problems at the same time.',
    });
    await saveReflection(session.id, idea.id, {
      soWhat: "I'll finish my current task before moving to the next one.",
    });
    await finishSession(session.id);

    const bundle = await loadSessionBundle(DAY);
    expect(bundle?.session.status).toBe('completed');
    expect(bundle?.ideas).toHaveLength(2);
    expect(bundle?.ideaOfDay?.idea.title).toBe('Thought Into Action');
    expect(bundle?.ideaOfDay?.cards).toHaveLength(3);
    expect(bundle?.chunks.map((c) => c.text)).toEqual(texts);
    expect(bundle?.chunks.every((c) => c.sourceIdeaId === idea.id)).toBe(true);
    expect(bundle?.speaking[0]?.durationSec).toBe(73);
    // As duas gravações da reflexão caem no mesmo registro.
    expect(await db.reflections.count()).toBe(1);
    expect(bundle?.reflection).toMatchObject({
      userOpinion: 'I agree, but sometimes we need to manage several problems at the same time.',
      soWhat: "I'll finish my current task before moving to the next one.",
    });
  });
});

describe('progresso da sessão', () => {
  const empty = {
    ideas: 0,
    hasIdeaOfDay: false,
    hasMainIdea: false,
    chunks: 0,
    sentences: 0,
    spoke: false,
    hasView: false,
    hasSoWhat: false,
  };

  it('vai de 0 a 100', () => {
    expect(sessionProgress(empty)).toBe(0);
    expect(
      sessionProgress({
        ideas: 2,
        hasIdeaOfDay: true,
        hasMainIdea: true,
        chunks: 3,
        sentences: 3,
        spoke: true,
        hasView: true,
        hasSoWhat: true,
      }),
    ).toBe(100);
  });

  it('não há meta de quantidade: uma ideia lida vale o mesmo que várias', () => {
    expect(sessionProgress({ ...empty, ideas: 1 })).toBe(sessionProgress({ ...empty, ideas: 6 }));
    expect(sessionProgress({ ...empty, ideas: 1, hasIdeaOfDay: true })).toBe(25);
  });
});
