import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import type { FeedbackKind } from '../domain/types';
import type { AIProvider } from './AIProvider';
import { consolidateFeedback, deleteFeedbackFor, getFeedbackFor, requestFeedback } from './feedback';

/** IA de mentira: responde conforme o tipo de pedido, e conta quantas vezes foi chamada. */
function fakeAI() {
  let calls = 0;
  const provider: AIProvider = {
    id: 'fake',
    model: 'fake',
    complete: async ({ system }) => {
      calls += 1;
      if (system.includes('falante nativo'))
        return JSON.stringify({ corrected: 'We have to choose.', why: 'Mais direto.', moreNatural: `We must choose (${calls}).` });
      if (system.includes('clareza'))
        return JSON.stringify({ corrected: `We need to choose (${calls}).`, why: 'Ficou mais claro.', moreNatural: null });
      return JSON.stringify({ corrected: `We have to choose (${calls}).`, why: 'Ortografia: choose.', moreNatural: 'Ignorado.' });
    },
    chat: async () => '',
  };
  return provider;
}

const ask = (kind: FeedbackKind, text: string, provider: AIProvider) =>
  requestFeedback({ kind, targetType: 'mainIdea', targetId: 'idea-1', text, context: '' }, provider);
const block = async () => consolidateFeedback(await getFeedbackFor('mainIdea', 'idea-1'));

describe('retorno da IA em um bloco só', () => {
  it('sem nenhum pedido, não há retorno nem comentários', async () => {
    expect(await block()).toBeNull();
  });

  it('cada botão preenche a sua parte, uma única vez, em ordem fixa, seja qual for a ordem dos cliques', async () => {
    const ai = fakeAI();
    await ask('natural', 'We have to chose.', ai);
    await ask('grammar', 'We have to chose.', ai);
    let result = await block();
    expect(result).toMatchObject({
      original: 'We have to chose.',
      kinds: ['grammar', 'natural'],
      corrected: 'We have to choose (2).',
      natural: 'We must choose (1).',
    });
    expect(result?.improved).toBeUndefined();
    // O comentário de cada pedido, na ordem das versões; o do que não foi pedido não existe.
    expect(result?.comments).toEqual([
      { kind: 'grammar', text: 'Ortografia: choose.' },
      { kind: 'natural', text: 'Mais direto.' },
    ]);

    await ask('improve', 'We have to chose.', ai);
    result = await block();
    expect(result?.kinds).toEqual(['grammar', 'improve', 'natural']);
    expect(result?.improved).toBe('We need to choose (3).');
    expect(result?.comments.map((c) => c.kind)).toEqual(['grammar', 'improve', 'natural']);
  });

  it('clicar de novo no mesmo botão refaz só aquela parte, sem duplicar', async () => {
    const ai = fakeAI();
    await ask('grammar', 'We have to chose.', ai);
    await ask('improve', 'We have to chose.', ai);
    await ask('grammar', 'We have to chose.', ai);
    expect(await getFeedbackFor('mainIdea', 'idea-1')).toHaveLength(2);
    expect(await block()).toMatchObject({ corrected: 'We have to choose (3).', improved: 'We need to choose (2).' });
  });

  it('se o texto mudou, o retorno novo substitui o que era sobre a versão antiga', async () => {
    const ai = fakeAI();
    await ask('grammar', 'We have to chose.', ai);
    await ask('improve', 'We have to chose.', ai);
    await ask('improve', 'We must chose.', ai);
    const result = await block();
    expect(result).toMatchObject({ original: 'We must chose.', kinds: ['improve'] });
    expect(result?.corrected).toBeUndefined();
    expect(await db.aiFeedback.count()).toBe(1);
  });

  it('comentários iguais não se repetem', async () => {
    const base = {
      targetType: 'mainIdea' as const,
      targetId: 'idea-1',
      original: 'x',
      corrected: 'y',
      moreNatural: null,
      provider: 'f',
      model: 'f',
    };
    const result = consolidateFeedback([
      { ...base, id: 'a', kind: 'grammar', explanation: 'Sem erros.', createdAt: '2026-10-06T10:00:00.000Z' },
      { ...base, id: 'b', kind: 'improve', explanation: 'Sem erros.', createdAt: '2026-10-06T10:01:00.000Z' },
    ]);
    expect(result?.comments).toEqual([{ kind: 'grammar', text: 'Sem erros.' }]);
  });

  it('excluir o retorno apaga tudo daquele texto e só dele', async () => {
    const ai = fakeAI();
    await ask('grammar', 'We have to chose.', ai);
    await requestFeedback({ kind: 'grammar', targetType: 'mainIdea', targetId: 'idea-2', text: 'Other.', context: '' }, ai);
    await deleteFeedbackFor('mainIdea', 'idea-1');
    expect(await block()).toBeNull();
    expect(await getFeedbackFor('mainIdea', 'idea-2')).toHaveLength(1);
  });
});
