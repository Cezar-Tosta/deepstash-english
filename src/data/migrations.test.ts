import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { AppDB } from './db';
import { BACKUP_VERSION, parseBackup } from './backup';
import { migrateV1toV2 } from './migrations';

const v1 = {
  sessions: [{ id: 's1', date: '2026-10-03', cardOfDayId: 'c1', status: 'completed' }],
  cards: [
    {
      id: 'c1',
      sessionId: 's1',
      date: '2026-10-03',
      title: 'Thought Into Action',
      content: 'Do one thing at a time.',
      mainIdea: 'Focus on one task.',
      category: 'Focus',
      notes: '',
      createdAt: '2026-10-03T10:00:00.000Z',
    },
    {
      id: 'c2',
      sessionId: 's1',
      date: '2026-10-03',
      title: 'Sem texto',
      content: '',
      mainIdea: '',
      category: '',
      notes: '',
      createdAt: '2026-10-03T10:01:00.000Z',
    },
  ],
  chunks: [{ id: 'k1', sessionId: 's1', sourceCardId: 'c1', text: 'one thing at a time' }],
  vocab: [{ id: 'v1', sessionId: 's1', cardId: 'c1', term: 'rut' }],
  reflections: [{ id: 'r1', sessionId: 's1', cardId: 'c1', soWhat: "I'll focus." }],
  speaking: [{ id: 'p1', sessionId: 's1', cardId: 'c1', durationSec: 70 }],
  writings: [{ id: 'w1', weekStart: '2026-09-28', cardId: 'c1', text: 'draft' }],
  weeklyReviews: [{ id: '2026-09-28', topCardIds: ['c1'], speakingCardId: 'c1', recalls: { c1: 'x' } }],
  reviews: [{ id: 'rv1', chunkId: 'k1', rating: 'GOOD' }],
};

describe('migração 1 → 2: do card para a ideia', () => {
  const v2 = migrateV1toV2(v1);

  it('cada card antigo vira uma ideia com o mesmo id', () => {
    expect(v2['ideas']).toEqual([
      expect.objectContaining({
        id: 'c1',
        title: 'Thought Into Action',
        mainIdea: 'Focus on one task.',
        category: 'Focus',
        bookTitle: '',
      }),
      expect.objectContaining({ id: 'c2', title: 'Sem texto' }),
    ]);
  });

  it('o texto do card antigo vira o primeiro card da ideia; sem texto, nenhum card', () => {
    expect(v2['cards']).toEqual([expect.objectContaining({ ideaId: 'c1', position: 0, content: 'Do one thing at a time.' })]);
  });

  it('todas as referências passam a apontar para a ideia', () => {
    expect(v2['sessions']?.[0]).toMatchObject({ ideaOfDayId: 'c1' });
    expect(v2['sessions']?.[0]).not.toHaveProperty('cardOfDayId');
    expect(v2['chunks']?.[0]).toMatchObject({ sourceIdeaId: 'c1' });
    expect(v2['vocab']?.[0]).toMatchObject({ ideaId: 'c1' });
    expect(v2['reflections']?.[0]).toMatchObject({ ideaId: 'c1', soWhat: "I'll focus." });
    expect(v2['speaking']?.[0]).toMatchObject({ ideaId: 'c1' });
    expect(v2['writings']?.[0]).toMatchObject({ ideaId: 'c1' });
    expect(v2['weeklyReviews']?.[0]).toMatchObject({
      topIdeaIds: ['c1'],
      speakingIdeaId: 'c1',
      recalls: { c1: 'x' },
    });
  });

  it('não toca no histórico de revisões', () => {
    expect(v2['reviews']).toEqual(v1.reviews);
  });

  it('um backup antigo é convertido ao ser importado', () => {
    const backup = parseBackup(JSON.stringify({ app: 'deepstash-english', version: 1, exportedAt: '', settings: null, data: v1 }));
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.data.ideas).toHaveLength(2);
    expect(backup.data.cards).toHaveLength(1);
    expect(backup.data.sessions[0]).toMatchObject({ ideaOfDayId: 'c1' });
  });
});

describe('migração no banco real (IndexedDB)', () => {
  it('abre um banco criado na versão 1 e converte os dados sem perder nada', async () => {
    const name = 'migration-test';
    const old = new Dexie(name);
    old.version(1).stores({
      settings: 'id',
      sessions: 'id, &date, status',
      cards: 'id, sessionId, date',
      vocab: 'id, cardId, sessionId',
      chunks: 'id, sessionId, sourceCardId, createdDate, nextReviewDate, status',
      reviews: 'id, chunkId, completedDate',
      speaking: 'id, sessionId, cardId, date',
      reflections: 'id, &cardId, sessionId',
      weeklyReviews: 'id',
      writings: 'id, weekStart',
      aiFeedback: 'id, [targetType+targetId], createdAt',
    });
    for (const [table, rows] of Object.entries(v1)) await old.table(table).bulkAdd(rows);
    old.close();

    const upgraded = new AppDB(name);
    try {
      expect(await upgraded.ideas.count()).toBe(2);
      expect((await upgraded.cards.where('ideaId').equals('c1').toArray()).map((c) => c.content)).toEqual(['Do one thing at a time.']);
      expect((await upgraded.sessions.get('s1'))?.ideaOfDayId).toBe('c1');
      expect(await upgraded.chunks.where('sourceIdeaId').equals('c1').count()).toBe(1);
      expect(await upgraded.reflections.where('ideaId').equals('c1').count()).toBe(1);
      expect(await upgraded.reviews.count()).toBe(1);
    } finally {
      await upgraded.delete();
    }
  });
});
