import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { sessionProgress } from '../domain/session';
import { ChunkLimitError, DomainError } from './errors';
import {
  addCard,
  addChunk,
  addVocab,
  deleteCard,
  finishSession,
  loadSessionBundle,
  recordSpeaking,
  replaceChunk,
  saveReflection,
  setCardOfDay,
  startSession,
  updateCard,
  updateChunk,
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
      cardOfDayId: null,
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

describe('Card of the Day', () => {
  it('mantém apenas um card escolhido por sessão', async () => {
    const session = await startSession(DAY);
    const a = await addCard(session.id, { title: 'Thought Into Action' });
    const b = await addCard(session.id, { title: 'Deep Work' });

    await setCardOfDay(session.id, a.id);
    await setCardOfDay(session.id, b.id);

    const bundle = await loadSessionBundle(DAY);
    expect(bundle?.cardOfDay?.id).toBe(b.id);
    expect(bundle?.cards).toHaveLength(2);
  });

  it('recusa card de outra sessão', async () => {
    const today = await startSession(DAY);
    const other = await startSession('2026-10-04');
    const card = await addCard(other.id, { title: 'Outro dia' });
    await expect(setCardOfDay(today.id, card.id)).rejects.toBeInstanceOf(DomainError);
  });

  it('apagar o card escolhido limpa a escolha e preserva os chunks', async () => {
    const session = await startSession(DAY);
    const card = await addCard(session.id, { title: 'Thought Into Action' });
    await setCardOfDay(session.id, card.id);
    await addChunk(session.id, { text: 'one thing at a time' });

    await deleteCard(card.id);

    const bundle = await loadSessionBundle(DAY);
    expect(bundle?.session.cardOfDayId).toBeNull();
    expect(bundle?.chunks).toHaveLength(1);
    expect(bundle?.chunks[0]?.sourceCardId).toBeNull();
  });

  it('exige título', async () => {
    const session = await startSession(DAY);
    await expect(addCard(session.id, { title: '   ' })).rejects.toBeInstanceOf(DomainError);
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
    const card = await addCard(session.id, { title: 'Thought Into Action' });
    await addVocab(session.id, card.id, 'rut', 'rotina sem saída');
    expect(await db.vocab.count()).toBe(1);
    expect(await db.chunks.count()).toBe(0);
  });
});

describe('finalização da sessão', () => {
  it('recusa finalizar sem nenhum card', async () => {
    const session = await startSession(DAY);
    await expect(finishSession(session.id)).rejects.toBeInstanceOf(DomainError);
  });

  it('finaliza com menos de 5 cards e menos de 3 chunks', async () => {
    const session = await startSession(DAY);
    await addCard(session.id, { title: 'Só um card' });
    await finishSession(session.id);
    const stored = await db.sessions.get(session.id);
    expect(stored?.status).toBe('completed');
    expect(stored?.completedAt).not.toBeNull();
  });

  it('registra o fluxo completo do exemplo "Thought Into Action"', async () => {
    const session = await startSession(DAY);
    const card = await addCard(session.id, { title: 'Thought Into Action', category: 'Focus' });
    for (const title of ['Card 2', 'Card 3', 'Card 4', 'Card 5']) {
      await addCard(session.id, { title });
    }
    await setCardOfDay(session.id, card.id);
    await updateCard(card.id, {
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
      cardId: card.id,
      date: DAY,
      durationSec: 73,
      targetSec: 60,
    });
    await saveReflection(session.id, card.id, {
      userOpinion: 'I agree, but sometimes we need to manage several problems at the same time.',
    });
    await saveReflection(session.id, card.id, {
      soWhat: "I'll finish my current task before moving to the next one.",
    });
    await finishSession(session.id);

    const bundle = await loadSessionBundle(DAY);
    expect(bundle?.session.status).toBe('completed');
    expect(bundle?.cards).toHaveLength(5);
    expect(bundle?.cardOfDay?.title).toBe('Thought Into Action');
    expect(bundle?.chunks.map((c) => c.text)).toEqual(texts);
    expect(bundle?.chunks.every((c) => c.sourceCardId === card.id)).toBe(true);
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
  it('vai de 0 a 100', () => {
    const empty = {
      cards: 0,
      hasCardOfDay: false,
      hasMainIdea: false,
      chunks: 0,
      sentences: 0,
      spoke: false,
      hasView: false,
      hasSoWhat: false,
    };
    expect(sessionProgress(empty)).toBe(0);
    expect(
      sessionProgress({
        cards: 7,
        hasCardOfDay: true,
        hasMainIdea: true,
        chunks: 3,
        sentences: 3,
        spoke: true,
        hasView: true,
        hasSoWhat: true,
      }),
    ).toBe(100);
    expect(sessionProgress({ ...empty, cards: 5, hasCardOfDay: true })).toBe(25);
  });
});
