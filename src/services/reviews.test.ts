import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { isDifficult, overdueDays } from '../domain/chunks';
import { getDueChunks, getDueItems, getUpcoming, rateChunk, reactivateChunk, retireChunk } from './reviews';
import { addCard, addChunk, setCardOfDay, startSession } from './sessions';

const D0 = '2026-10-03';

async function seed(texts: string[] = ['one thing at a time']) {
  const session = await startSession(D0);
  const card = await addCard(session.id, { title: 'Thought Into Action' });
  await setCardOfDay(session.id, card.id);
  const chunks = [];
  for (const text of texts) chunks.push(await addChunk(session.id, { text }));
  return { session, card, chunks };
}

describe('revisões pendentes', () => {
  it('não há nada a revisar no próprio D0', async () => {
    await seed();
    expect(await getDueChunks(D0)).toHaveLength(0);
  });

  it('o chunk aparece em D1 com o card de origem', async () => {
    const { card } = await seed();
    const due = await getDueItems('2026-10-04');
    expect(due).toHaveLength(1);
    expect(due[0]?.sourceCard?.id).toBe(card.id);
  });

  it('revisão atrasada continua pendente e informa os dias de atraso', async () => {
    await seed();
    const due = await getDueChunks('2026-10-09');
    expect(due).toHaveLength(1);
    expect(overdueDays(due[0]!, '2026-10-09')).toBe(5);
  });

  it('lista as próximas revisões agendadas', async () => {
    await seed(['a b', 'c d', 'e f']);
    expect(await getUpcoming(D0, 7)).toEqual([{ date: '2026-10-04', inDays: 1, count: 3 }]);
  });
});

describe('avaliação AGAIN / HARD / GOOD / EASY', () => {
  it('GOOD segue a programação e sai da fila de hoje', async () => {
    const { chunks } = await seed();
    await rateChunk(chunks[0]!.id, 'GOOD', 'I do one thing at a time.', '2026-10-04');

    const chunk = await db.chunks.get(chunks[0]!.id);
    expect(chunk).toMatchObject({ stage: 1, status: 'learning', nextReviewDate: '2026-10-06' });
    expect(await getDueChunks('2026-10-04')).toHaveLength(0);
  });

  it('AGAIN antecipa para o dia seguinte', async () => {
    const { chunks } = await seed();
    await rateChunk(chunks[0]!.id, 'GOOD', '', '2026-10-04');
    await rateChunk(chunks[0]!.id, 'AGAIN', '', '2026-10-06');
    expect(await db.chunks.get(chunks[0]!.id)).toMatchObject({
      stage: 0,
      nextReviewDate: '2026-10-07',
    });
  });

  it('HARD mantém o estágio', async () => {
    const { chunks } = await seed();
    await rateChunk(chunks[0]!.id, 'HARD', '', '2026-10-04');
    expect(await db.chunks.get(chunks[0]!.id)).toMatchObject({
      stage: 0,
      nextReviewDate: '2026-10-05',
    });
  });

  it('EASY dá um intervalo maior', async () => {
    const { chunks } = await seed();
    await rateChunk(chunks[0]!.id, 'EASY', '', '2026-10-04');
    expect(await db.chunks.get(chunks[0]!.id)).toMatchObject({
      stage: 2,
      nextReviewDate: '2026-10-10',
    });
  });

  it('registra cada tentativa sem apagar as anteriores', async () => {
    const { chunks } = await seed();
    const id = chunks[0]!.id;
    await rateChunk(id, 'AGAIN', 'first try', '2026-10-04');
    await rateChunk(id, 'GOOD', 'second try', '2026-10-05');

    const history = await db.reviews.where('chunkId').equals(id).sortBy('completedDate');
    expect(history.map((r) => [r.rating, r.scheduledDate, r.completedDate, r.userSentence])).toEqual([
      ['AGAIN', '2026-10-04', '2026-10-04', 'first try'],
      ['GOOD', '2026-10-05', '2026-10-05', 'second try'],
    ]);
  });

  it('cinco GOOD em dia concluem o chunk', async () => {
    const { chunks } = await seed();
    const id = chunks[0]!.id;
    for (const date of ['2026-10-04', '2026-10-06', '2026-10-10', '2026-10-17', '2026-11-02']) {
      await rateChunk(id, 'GOOD', '', date);
    }
    expect(await db.chunks.get(id)).toMatchObject({ status: 'learned', nextReviewDate: null });
    expect(await getDueChunks('2027-01-01')).toHaveLength(0);
  });

  it('marca como difícil quem foi esquecido na última tentativa', async () => {
    const { chunks } = await seed();
    const id = chunks[0]!.id;
    await rateChunk(id, 'AGAIN', '', '2026-10-04');
    const chunk = (await db.chunks.get(id))!;
    const reviews = await db.reviews.where('chunkId').equals(id).toArray();
    expect(isDifficult(chunk, reviews)).toBe(true);
  });
});

describe('aposentar e reativar', () => {
  it('chunk aposentado sai da revisão e pode voltar', async () => {
    const { chunks } = await seed();
    const id = chunks[0]!.id;
    await retireChunk(id);
    expect(await getDueChunks('2026-10-10')).toHaveLength(0);

    await reactivateChunk(id, '2026-10-10');
    expect(await db.chunks.get(id)).toMatchObject({
      status: 'learning',
      nextReviewDate: '2026-10-11',
    });
  });
});
