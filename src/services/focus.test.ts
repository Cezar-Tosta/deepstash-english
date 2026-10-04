import { describe, expect, it } from 'vitest';
import type { AIProvider } from '../ai/AIProvider';
import { buildFocusPrompt, generateFocusPlan } from '../ai/focus';
import { exportBackup, parseBackup, restoreBackup } from '../data/backup';
import { db } from '../data/db';
import { inlineDiff } from '../domain/diff';
import { collectCorrections, sentenceTarget } from '../domain/feedback';
import type { AIFeedback, ChunkReview, FeedbackKind, FeedbackTarget } from '../domain/types';
import { startCycle } from './cycles';
import { isFocusEmpty, loadFocusData } from './focus';
import { recordPractice } from './maintenance';
import { addChunk, addIdea, startSession } from './sessions';

let stamp = 0;
function entry(
  targetType: FeedbackTarget,
  targetId: string,
  kind: FeedbackKind,
  original: string,
  corrected: string,
  why: string,
  at: string,
): AIFeedback {
  stamp += 1;
  return {
    id: `f${stamp}`,
    kind,
    targetType,
    targetId,
    original,
    corrected,
    explanation: why,
    moreNatural: null,
    provider: 'f',
    model: 'f',
    createdAt: at,
  };
}

describe('correções sem repetição', () => {
  it('um texto com vários pedidos vira uma correção só, com a de gramática e o primeiro comentário', () => {
    const corrections = collectCorrections([
      entry(
        'chunkSentence',
        'c1',
        'grammar',
        'Instead of drink water.',
        'Instead of drinking water.',
        'Gerúndio depois de "instead of".',
        '2026-10-06T10:00:00.000Z',
      ),
      entry(
        'chunkSentence',
        'c1',
        'improve',
        'Instead of drink water.',
        'Rather than drinking water.',
        'Mais fluido.',
        '2026-10-06T10:01:00.000Z',
      ),
      entry(
        'chunkSentence',
        'c1',
        'natural',
        'Instead of drink water.',
        'Instead of drinking water.',
        'Natural.',
        '2026-10-06T10:02:00.000Z',
      ),
    ]);
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      original: 'Instead of drink water.',
      corrected: 'Instead of drinking water.',
      comment: 'Gerúndio depois de "instead of".',
      at: '2026-10-06T10:02:00.000Z',
    });
  });

  it('texto que já estava certo não entra; textos iguais com a mesma correção contam uma vez', () => {
    const corrections = collectCorrections([
      entry('opinion', 'i1', 'grammar', 'I agree.', 'I agree.', 'Sem erros.', '2026-10-06T10:00:00.000Z'),
      entry('mainIdea', 'i1', 'grammar', 'It are good.', 'It is good.', 'x', '2026-10-06T10:01:00.000Z'),
      entry('mainIdea', 'i2', 'grammar', 'It are good.', 'It is good.', 'x', '2026-10-06T10:02:00.000Z'),
    ]);
    expect(corrections.map((c) => c.key)).toEqual(['mainIdea:i1']);
  });

  it('original e correção cabem em uma linha: o que saiu e o que entrou ficam no lugar da mudança', () => {
    const parts = inlineDiff('Instead of drink water, I prefer drink soda.', 'Instead of drinking water, I prefer drinking soda.');
    expect(parts.filter((p) => p.kind !== 'same')).toEqual([
      { text: 'drink', kind: 'removed' },
      { text: 'drinking', kind: 'added' },
      { text: 'drink', kind: 'removed' },
      { text: 'drinking', kind: 'added' },
    ]);
    expect(parts.map((p) => p.text).join('')).toBe('Instead of drink drinking water, I prefer drink drinking soda.');
    expect(inlineDiff('Same text.', 'Same text.')).toEqual([{ text: 'Same text.', kind: 'same' }]);
  });

  it('cada frase de um chunk tem o seu retorno: a principal usa o id do chunk, as outras um id próprio e estável', () => {
    expect(sentenceTarget('c1', ' I do it. ', 'I do it.')).toBe('c1');
    const other = sentenceTarget('c1', 'Another one.', 'I do it.');
    expect(other).toMatch(/^c1:[a-z0-9]+$/);
    expect(sentenceTarget('c1', 'Another one.', 'I do it.')).toBe(other);
    expect(sentenceTarget('c1', 'A third one.', 'I do it.')).not.toBe(other);
  });
});

describe('pontos críticos: todos os ciclos', () => {
  async function seed() {
    await startCycle('2026-09-28');
    const first = await startSession('2026-09-29');
    const idea = await addIdea(first.id, { title: 'A' });
    const chunk = await addChunk(first.id, {
      text: 'instead of',
      meaning: 'em vez de',
      originalSentence: 'Instead of fighting, he set a rule.',
      sourceIdeaId: idea.id,
    });
    await startSession('2026-10-06');
    // Uma correção em cada ciclo e uma num dia sem ciclo. O horário do meio do dia evita trocar de data com o fuso.
    await db.aiFeedback.bulkAdd([
      entry('mainIdea', idea.id, 'grammar', 'The idea are good.', 'The idea is good.', 'Concordância.', '2026-09-29T12:00:00.000Z'),
      entry(
        'chunkSentence',
        chunk.id,
        'grammar',
        'Instead of drink water.',
        'Instead of drinking water.',
        'Gerúndio.',
        '2026-10-06T12:00:00.000Z',
      ),
      entry('opinion', idea.id, 'grammar', 'I agree with he.', 'I agree with him.', 'Pronome.', '2026-10-20T12:00:00.000Z'),
      entry('soWhat', idea.id, 'grammar', "I'll do it.", "I'll do it.", 'Sem erros.', '2026-10-06T13:00:00.000Z'),
    ]);
    await recordPractice(`chunk:${chunk.id}`, false);
    await recordPractice(`chunk:${chunk.id}`, false);
    await db.reviews.add({
      id: 'r1',
      chunkId: chunk.id,
      stage: 1,
      completedDate: '2026-10-07',
      rating: 'AGAIN',
      userSentence: '',
    } as ChunkReview);
    return { idea, chunk };
  }

  it('sem dados, não há o que analisar', async () => {
    expect(isFocusEmpty(await loadFocusData())).toBe(true);
  });

  it('agrupa as correções por ciclo, do mais recente para o mais antigo, e junta exercícios e revisões', async () => {
    await seed();
    const data = await loadFocusData();
    expect(data.corrections.map((c) => c.corrected)).toEqual(['I agree with him.', 'Instead of drinking water.', 'The idea is good.']);
    expect(data.cycles.map((c) => [c.period?.start ?? 'entre ciclos', c.corrections.length])).toEqual([
      ['2026-10-06', 1],
      ['2026-09-28', 1],
      ['entre ciclos', 1],
    ]);
    expect(data.hardTerms.map((t) => [t.term, t.wrong])).toEqual([['instead of', 2]]);
    expect(data.forgotten).toEqual([{ text: 'instead of', meaning: 'em vez de', missed: 1 }]);
  });

  it('o plano da IA usa as correções de todos os ciclos, fica nos ajustes e vai no backup', async () => {
    await seed();
    const calls: string[] = [];
    const provider: AIProvider = {
      id: 'fake',
      model: 'fake',
      complete: async ({ user }) => {
        calls.push(user);
        return '**Concordância** (1)\n- *idea are* → *idea is*';
      },
      chat: async () => '',
    };
    const { system } = buildFocusPrompt(await loadFocusData());
    expect(system).toContain('assuntos mais críticos');
    expect(system).toContain('não invente erros');

    await generateFocusPlan(provider);
    expect(calls[0]).toContain('"The idea are good." → "The idea is good." | Concordância.');
    expect(calls[0]).toContain('"I agree with he." → "I agree with him."');
    expect(calls[0]).toContain('instead of (em vez de): 2 erros');
    expect((await db.settings.get('settings'))?.studyFocus).toMatchObject({
      text: expect.stringContaining('Concordância'),
      corrections: 3,
    });

    const file = JSON.stringify(await exportBackup());
    const settings = await db.settings.get('settings');
    if (settings) {
      delete settings.studyFocus;
      await db.settings.put(settings);
    }
    await restoreBackup(parseBackup(file));
    expect((await db.settings.get('settings'))?.studyFocus?.corrections).toBe(3);
  });
});
