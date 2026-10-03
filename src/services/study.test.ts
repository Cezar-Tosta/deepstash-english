import { describe, expect, it } from 'vitest';
import { buildLookupPrompt, canTranscribe, markTerm, parseLookup } from '../ai/feedback';
import { AIError } from '../ai/AIProvider';
import { db } from '../data/db';
import { annotate, selectionText, tokenize } from '../domain/reader';
import { addChunk, addIdea, deleteChunk, saveReflection, startSession } from './sessions';
import {
  addToDictionary,
  deleteTerm,
  findChunks,
  findEntries,
  findInDictionary,
  getBook,
  getNeighbors,
  getPendingActions,
  listBooks,
  loadGlossary,
  saveBookNote,
  saveFollowUp,
  searchDictionary,
  updateDictionaryEntry,
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

  it('o mesmo termo na mesma frase atualiza; em outra frase vira outro sentido', async () => {
    const { a } = await seed();
    await addToDictionary({ ideaId: a.id, term: 'cue', meaning: 'deixa', context: 'Wait for your cue.' });
    await addToDictionary({ ideaId: a.id, term: 'Cue', meaning: 'deixa (teatro)', context: 'Wait for your cue.' });
    await addToDictionary({ ideaId: a.id, term: 'cue', meaning: 'gatilho', context: 'Every habit starts with a cue.' });

    expect(await db.vocab.count()).toBe(2);
    expect((await findInDictionary('CUE', 'Wait for your cue.'))?.meaning).toBe('deixa (teatro)');
    expect(await findInDictionary('cue', 'A frase nova, nunca consultada.')).toBeNull();
  });

  it('lista em ordem alfabética, sem depender de maiúsculas', async () => {
    const { a } = await seed();
    for (const term of ['rut', 'Cue', 'ability', 'habit']) await addToDictionary({ ideaId: a.id, term, meaning: 'x' });
    expect((await searchDictionary('')).map((i) => i.entry.term)).toEqual(['ability', 'Cue', 'habit', 'rut']);
  });

  it('guarda a transcrição fonética', async () => {
    const { a } = await seed();
    await addToDictionary({ ideaId: a.id, term: 'cue', meaning: 'gatilho', phonetic: '/kjuː/' });
    expect((await searchDictionary('cue'))[0]?.entry.phonetic).toBe('/kjuː/');
  });
});

describe('editar uma entrada do dicionário', () => {
  it('acha as entradas do termo e altera tradução e explicação sem mexer no resto', async () => {
    const { a } = await seed();
    await addToDictionary({ ideaId: a.id, term: 'cue', meaning: 'deixa', context: 'Wait for your cue.', phonetic: '/kjuː/' });
    await addToDictionary({ ideaId: a.id, term: 'habit', meaning: 'hábito' });

    const [entry] = await findEntries('CUE');
    expect(await findEntries('CUE')).toHaveLength(1);
    await updateDictionaryEntry(entry!.id, { meaning: ' gatilho ', explanation: 'Sinal que dispara o hábito.' });

    expect(await db.vocab.get(entry!.id)).toMatchObject({
      meaning: 'gatilho',
      explanation: 'Sinal que dispara o hábito.',
      context: 'Wait for your cue.',
      phonetic: '/kjuː/',
    });
    await expect(updateDictionaryEntry(entry!.id, { meaning: '  ' })).rejects.toThrow('Informe a tradução');
    expect(await findEntries('inexistente')).toEqual([]);
  });
});
describe('glossário para sublinhar nos textos', () => {
  it('reúne dicionário e chunks de todas as ideias, agrupando os sentidos de um mesmo termo', async () => {
    const { day1, a, c } = await seed();
    await addToDictionary({ ideaId: a.id, term: 'cue', meaning: 'gatilho', context: 'Every habit starts with a cue.' });
    await addToDictionary({ ideaId: c.id, term: 'Cue', meaning: 'deixa', context: 'Wait for your cue.' });
    await addToDictionary({ ideaId: a.id, term: 'grit', meaning: '' });
    const chunk = await addChunk(day1.id, { text: 'before you...', meaning: 'antes de você' });

    const glossary = await loadGlossary();
    // A grafia e a ordem dos sentidos seguem a ordem de leitura do banco, que não é fixa.
    expect(glossary.map((g) => g.term.toLowerCase())).toEqual(['before you', 'cue', 'grit']);
    expect(glossary[1]?.senses.map((s) => [s.meaning, s.context]).sort()).toEqual([
      ['deixa', 'Wait for your cue.'],
      ['gatilho', 'Every habit starts with a cue.'],
    ]);
    expect(glossary[0]?.senses[0]).toMatchObject({ source: 'chunk', meaning: 'antes de você' });
    expect(chunk.text).toBe('before you...');
  });
});

describe('IA: significado e transcrição', () => {
  it('marca na frase exatamente o trecho selecionado', () => {
    expect(markTerm('cue', 'Every habit starts with a cue.')).toBe('Every habit starts with a [[cue]].');
    expect(markTerm('out of your head', 'Keep it Out of your head.')).toBe('Keep it [[Out of your head]].');
    expect(markTerm('missing', 'No match here.')).toBe('No match here.');
  });

  it('uma palavra: pede o sentido dela naquela frase', () => {
    const { system, user } = buildLookupPrompt('cue', 'Every habit starts with a cue.');
    expect(user).toBe('Termo: cue\nPalavras no termo: 1\nFrase, com o termo entre [[ ]]: Every habit starts with a [[cue]].');
    expect(system).toContain('classe gramatical');
    expect(system).not.toContain('bloco único');
  });

  it('lê significado, fonética e explicação, e recusa formato inesperado', () => {
    const raw = JSON.stringify({ meaning: 'gatilho', phonetic: '/kjuː/', explanation: 'Sinal que dispara o hábito.' });
    expect(parseLookup(`Claro! ${raw}`)).toEqual({
      meaning: 'gatilho',
      explanation: 'Sinal que dispara o hábito.',
      phonetic: '/kjuː/',
      wordClass: '',
    });
    expect(parseLookup('{"meaning": "gatilho"}').phonetic).toBe('');
    expect(parseLookup('{"meaning": "segurar", "wordClass": "**Verbo**"}').wordClass).toBe('verbo');
    expect(() => parseLookup('não sei')).toThrow(AIError);
  });

  it('várias palavras: tradução e comentário são do grupo inteiro, não de cada palavra', () => {
    const { system, user } = buildLookupPrompt('out of your head', 'Keep it out of your head.');
    expect(user).toContain('Palavras no termo: 4');
    expect(user).toContain('Keep it [[out of your head]].');
    expect(system).toContain('tem 4 palavras');
    expect(system).toContain('bloco único');
    expect(system).toContain('UMA tradução para o trecho inteiro');
    expect(system).toContain('não explique as palavras separadamente');
    expect(system).toContain('IPA');
  });

  it('transcrição só com Groq ou serviço compatível com OpenAI', () => {
    const base = { baseUrl: '', model: '', apiKey: 'k' };
    expect(canTranscribe({ ...base, provider: 'groq' })).toBe(true);
    expect(canTranscribe({ ...base, provider: 'anthropic' })).toBe(false);
    expect(canTranscribe({ ...base, provider: 'none' })).toBe(false);
  });
});

describe('destaque em todos os textos e exclusão', () => {
  /** Os termos que apareceriam sublinhados num texto. */
  async function highlighted(text: string): Promise<string[]> {
    const tokens = tokenize(text);
    return annotate(tokens, await loadGlossary()).map((a) => selectionText(tokens, a));
  }
  const OTHER_BOOK = 'In Deep Work, every cue matters. Decide before you start.';

  it('palavra do dicionário e chunk cadastrados numa ideia são destacados no texto de outro livro', async () => {
    const { day1, a } = await seed();
    await addToDictionary({ ideaId: a.id, term: 'cue', meaning: 'gatilho', context: 'Every habit starts with a cue.' });
    await addChunk(day1.id, { text: 'before you...', meaning: 'antes de você' });
    expect(await highlighted(OTHER_BOOK)).toEqual(['cue', 'before you']);
  });

  it('destaca também o que ainda não tem tradução anotada', async () => {
    const { day1, a } = await seed();
    await addToDictionary({ ideaId: a.id, term: 'cue', meaning: '' });
    await addChunk(day1.id, { text: 'before you...' });
    expect(await highlighted(OTHER_BOOK)).toEqual(['cue', 'before you']);
  });

  it('excluir o termo apaga todos os registros dele e o destaque some de todos os textos', async () => {
    const { a, c } = await seed();
    await addToDictionary({ ideaId: a.id, term: 'cue', meaning: 'gatilho', context: 'Every habit starts with a cue.' });
    await addToDictionary({ ideaId: c.id, term: 'Cue', meaning: 'deixa', context: 'Wait for your cue.' });
    await addToDictionary({ ideaId: a.id, term: 'habit', meaning: 'hábito' });

    expect(await deleteTerm('CUE')).toBe(2);

    expect(await highlighted(OTHER_BOOK)).toEqual([]);
    expect(await highlighted('Every habit starts with a cue.')).toEqual(['habit']);
    expect(await findEntries('cue')).toEqual([]);
  });

  it('excluir um chunk tira o destaque dele de todos os textos', async () => {
    const { day1 } = await seed();
    const chunk = await addChunk(day1.id, { text: 'before you...', meaning: 'antes de você' });
    expect((await findChunks('before you')).map((c) => c.id)).toEqual([chunk.id]);

    await deleteChunk(chunk.id);
    expect(await highlighted(OTHER_BOOK)).toEqual([]);
    expect(await findChunks('before you')).toEqual([]);
  });
});
