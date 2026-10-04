import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { addCards, addIdea, startSession } from '../services/sessions';
import { AIError, type AIProvider } from './AIProvider';
import { analyzeCard, ANALYSIS_ASPECTS, buildCardAnalysisPrompt } from './cardAnalysis';

function fakeAI(reply: string) {
  const calls: { system: string; user: string }[] = [];
  const provider: AIProvider = {
    id: 'fake',
    model: 'fake',
    complete: async (request) => {
      calls.push({ system: request.system, user: request.user });
      return reply;
    },
    chat: async () => '',
  };
  return { provider, calls };
}

async function seed(texts: string[]) {
  const session = await startSession('2026-10-06');
  const idea = await addIdea(session.id, { title: 'Thought Into Action' });
  await addCards(idea.id, texts);
  return db.cards.where('ideaId').equals(idea.id).sortBy('position');
}

describe('comentário da estrutura do texto de um card', () => {
  it('o pedido cobre gramática, ortografia, sintaxe e semântica, só sobre o texto do card', () => {
    const { system, user } = buildCardAnalysisPrompt('Your mind is for having ideas.', 'Thought Into Action');
    for (const aspect of ANALYSIS_ASPECTS) expect(system).toContain(`**${aspect}**`);
    expect(system).toContain('português do Brasil');
    expect(system).toContain('não invente trechos');
    expect(user).toBe('Ideia: Thought Into Action\n\nTexto do card:\nYour mind is for having ideas.');
  });

  it('o comentário fica guardado no card pedido e não toca nos outros', async () => {
    const [first, second] = await seed(['Your mind is for having ideas.', 'Do one thing at a time.']);
    const { provider, calls } = fakeAI('**Gramática**\n- "is for having": for + -ing.');

    expect(await analyzeCard(first!.id, provider)).toContain('**Gramática**');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.user).toContain('Your mind is for having ideas.');
    expect(calls[0]?.user).not.toContain('Do one thing');

    const stored = await db.cards.get(first!.id);
    expect(stored?.analysis).toContain('for + -ing');
    expect(stored?.analysisOf).toBe('Your mind is for having ideas.');
    expect((await db.cards.get(second!.id))?.analysis).toBeUndefined();
  });

  it('card sem texto ou resposta vazia da IA não gravam nada', async () => {
    const [empty, full] = await seed(['   ', 'Do one thing at a time.']);
    await expect(analyzeCard(empty!.id, fakeAI('x').provider)).rejects.toBeInstanceOf(AIError);
    await expect(analyzeCard(full!.id, fakeAI('  ').provider)).rejects.toThrow('sem texto');
    expect((await db.cards.get(full!.id))?.analysis).toBeUndefined();
  });
});
