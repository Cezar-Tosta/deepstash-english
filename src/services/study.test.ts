import { describe, expect, it } from 'vitest';
import { buildLookupPrompt, canTranscribe, parseLookup } from '../ai/feedback';
import { AIError } from '../ai/AIProvider';
import { db } from '../data/db';
import { addIdea, saveReflection, startSession } from './sessions';
import {
  addToDictionary,
  findInDictionary,
  getBook,
  getNeighbors,
  getPendingActions,
  listBooks,
  saveBookNote,
  saveFollowUp,
  searchDictionary,
} from './study';

async function seed() {
  const day1 = await startSession('2026-10-01');
  const a = await addIdea(day1.id, { title: 'Make It Obvious', bookTitle: 'Atomic Habits', cards: ['x', 'y'] });
  const b = await addIdea(day1.id, { title: 'Make It Easy', bookTitle: 'Atomic Habits', cards: ['z'] });
  const day2 = await startSession('2026-10-02');
  const c = await addIdea(day2.id, { title: 'Rule #1', bookTitle: 'Deep Work' });
  return { day1, day2, a, b, c };
}

describe('livros', () => {
  it('lista os livros com suas ideias e cards', async () => {
    await seed();
    expect((await listBooks()).map((b) => [b.title, b.ideas.length, b.cardCount])).toEqual([
      ['Deep Work', 1, 0],
      ['Atomic Habits', 2, 3],
    ]);
  });

  it('navega entre as ideias do mesmo livro, na ordem de leitura', async () => {
    const { a, b, c } = await seed();
    expect((await getNeighbors(a)).next?.id).toBe(b.id);
    expect((await getNeighbors(b)).prev?.id).toBe(a.id);
    expect(await getNeighbors(c)).toEqual({ prev: null, next: null });
  });

  it('guarda o fechamento do livro', async () => {
    await seed();
    await saveBookNote('atomic habits', 'Atomic Habits', { takeaway: 'Small habits compound.' });
    await saveBookNote('atomic habits', 'Atomic Habits', { finishedAt: '2026-10-05T10:00:00.000Z' });
    expect((await getBook('atomic habits'))?.note).toMatchObject({
      takeaway: 'Small habits compound.',
      finishedAt: '2026-10-05T10:00:00.000Z',
    });
    expect(await getBook('não existe')).toBeNull();
  });
});

describe('acompanhamento das ações (So What?)', () => {
  it('pergunta pela ação só depois de alguns dias', async () => {
    const { day1, a } = await seed();
    await saveReflection(day1.id, a.id, { soWhat: "I'll put my book on the pillow." });

    expect(await getPendingActions('2026-10-03')).toHaveLength(0);
    const due = await getPendingActions('2026-10-04');
    expect(due).toHaveLength(1);
    expect(due[0]?.idea.title).toBe('Make It Obvious');
  });

  it('ignora reflexões sem ação e some depois de respondida', async () => {
    const { day1, a, b } = await seed();
    await saveReflection(day1.id, a.id, { soWhat: "I'll do it." });
    await saveReflection(day1.id, b.id, { userOpinion: 'I agree.' });

    const [action] = await getPendingActions('2026-10-10');
    expect(await getPendingActions('2026-10-10')).toHaveLength(1);

    await saveFollowUp(action!.reflection.id, { status: 'partly', text: 'I did it twice.' });
    expect(await getPendingActions('2026-10-10')).toHaveLength(0);
    expect(await db.reflections.get(action!.reflection.id)).toMatchObject({
      followUpStatus: 'partly',
      followUp: 'I did it twice.',
      soWhat: "I'll do it.",
    });
  });
});

describe('dicionário', () => {
  it('guarda termo, significado e contexto, e não entra na repetição espaçada', async () => {
    const { a } = await seed();
    await addToDictionary({
      ideaId: a.id,
      term: 'cue',
      meaning: 'gatilho, deixa',
      context: 'Every habit starts with a cue.',
      explanation: 'Aqui é o sinal que dispara o hábito.',
    });

    const [item] = await searchDictionary('gatilho');
    expect(item?.entry).toMatchObject({ term: 'cue', context: 'Every habit starts with a cue.' });
    expect(item?.idea?.title).toBe('Make It Obvious');
    expect(await db.chunks.count()).toBe(0);
  });

  it('adicionar o mesmo termo de novo atualiza em vez de duplicar', async () => {
    const { a } = await seed();
    await addToDictionary({ ideaId: a.id, term: 'cue', meaning: 'deixa' });
    await addToDictionary({ ideaId: a.id, term: 'Cue', meaning: 'gatilho' });
    expect(await db.vocab.count()).toBe(1);
    expect((await findInDictionary('CUE'))?.meaning).toBe('gatilho');
  });
});

describe('IA: significado e transcrição', () => {
  it('pede o sentido do termo dentro da frase', () => {
    const prompt = buildLookupPrompt('cue', 'Every habit starts with a cue.');
    expect(prompt.user).toBe('Termo: cue\nFrase: Every habit starts with a cue.');
  });

  it('lê a resposta do dicionário e recusa formato inesperado', () => {
    expect(parseLookup('```json\n{"meaning": "gatilho", "explanation": "Sinal que dispara o hábito."}\n```')).toEqual({
      meaning: 'gatilho',
      explanation: 'Sinal que dispara o hábito.',
    });
    expect(() => parseLookup('não sei')).toThrow(AIError);
  });

  it('transcrição só com Groq ou serviço compatível com OpenAI', () => {
    const base = { baseUrl: '', model: '', apiKey: 'k' };
    expect(canTranscribe({ ...base, provider: 'groq' })).toBe(true);
    expect(canTranscribe({ ...base, provider: 'anthropic' })).toBe(false);
    expect(canTranscribe({ ...base, provider: 'none' })).toBe(false);
  });
});
