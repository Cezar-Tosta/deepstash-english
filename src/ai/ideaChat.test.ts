import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { resetWeek } from '../services/maintenance';
import { addCards, addIdea, deleteIdea, saveReflection, startSession, updateIdea } from '../services/sessions';
import { AIError, type AIProvider, type ChatTurn } from './AIProvider';
import { buildChatSystem, clearChat, getChat, loadChatContext, retryChat, sendChatMessage } from './ideaChat';

/** IA de mentira: registra o que recebeu e responde o que o teste mandar. */
function fakeAI(reply: string | Error) {
  const calls: { system: string; turns: ChatTurn[] }[] = [];
  const provider: AIProvider = {
    id: 'fake',
    model: 'fake',
    complete: async () => '',
    chat: async (system, turns) => {
      calls.push({ system, turns: [...turns] });
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { provider, calls };
}

async function seedIdea() {
  const session = await startSession('2026-10-05');
  const idea = await addIdea(session.id, { title: 'Thought Into Action', bookTitle: 'Getting Things Done' });
  await addCards(idea.id, ['Your mind is for having ideas, not holding them.', 'Do one thing at a time.']);
  await updateIdea(idea.id, { mainIdea: 'Focus on one task.' });
  await saveReflection(session.id, idea.id, { userOpinion: 'I partly agree.' });
  return { session, idea };
}

describe('chat sobre a ideia', () => {
  it('a IA recebe o livro, os cards em ordem e o que o aluno já escreveu', async () => {
    const { idea } = await seedIdea();
    const system = buildChatSystem((await loadChatContext(idea.id))!);
    expect(system).toContain('Livro: Getting Things Done');
    expect(system).toContain('Ideia: Thought Into Action');
    expect(system).toContain('Your mind is for having ideas, not holding them.\n\nDo one thing at a time.');
    expect(system).toContain('Ideia principal, nas palavras dele: Focus on one task.');
    expect(system).toContain('Opinião que ele escreveu: I partly agree.');
    expect(system).not.toContain('Ação que ele se propôs');
  });

  it('guarda a pergunta e a resposta, e envia o histórico na ordem', async () => {
    const { idea } = await seedIdea();
    const { provider, calls } = fakeAI('Because attention is limited.');

    await sendChatMessage(idea.id, '  Why does this work?  ', provider);
    await sendChatMessage(idea.id, 'Give me an example.', provider);

    expect((await getChat(idea.id)).map((m) => [m.role, m.content])).toEqual([
      ['user', 'Why does this work?'],
      ['assistant', 'Because attention is limited.'],
      ['user', 'Give me an example.'],
      ['assistant', 'Because attention is limited.'],
    ]);
    expect(calls[1]?.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
    expect(calls[1]?.system).toContain('Thought Into Action');
  });

  it('se a IA falhar, a pergunta fica guardada e dá para tentar de novo', async () => {
    const { idea } = await seedIdea();
    await expect(sendChatMessage(idea.id, 'Hello?', fakeAI(new AIError('Limite de uso atingido.')).provider)).rejects.toThrow(
      'Limite de uso',
    );
    expect((await getChat(idea.id)).map((m) => m.role)).toEqual(['user']);

    await retryChat(idea.id, fakeAI('Hi!').provider);
    expect((await getChat(idea.id)).map((m) => [m.role, m.content])).toEqual([
      ['user', 'Hello?'],
      ['assistant', 'Hi!'],
    ]);
  });

  it('mensagem vazia não é enviada, e não se pede resposta sem pergunta pendente', async () => {
    const { idea } = await seedIdea();
    const { provider, calls } = fakeAI('x');
    await sendChatMessage(idea.id, '   ', provider);
    expect(calls).toHaveLength(0);
    await expect(retryChat(idea.id, provider)).rejects.toBeInstanceOf(AIError);
  });

  it('cada ideia tem a sua conversa, e limpar apaga só a dela', async () => {
    const { session, idea } = await seedIdea();
    const other = await addIdea(session.id, { title: 'Capture Everything' });
    const { provider } = fakeAI('ok');
    await sendChatMessage(idea.id, 'a', provider);
    await sendChatMessage(other.id, 'b', provider);

    await clearChat(idea.id);
    expect(await getChat(idea.id)).toEqual([]);
    expect(await getChat(other.id)).toHaveLength(2);
  });

  it('apagar a ideia ou resetar a semana leva a conversa junto', async () => {
    const { session, idea } = await seedIdea();
    const other = await addIdea(session.id, { title: 'Capture Everything' });
    const { provider } = fakeAI('ok');
    await sendChatMessage(idea.id, 'a', provider);
    await sendChatMessage(other.id, 'b', provider);

    await deleteIdea(idea.id);
    expect(await db.ideaChats.count()).toBe(2);
    await resetWeek('2026-10-05');
    expect(await db.ideaChats.count()).toBe(0);
  });
});
