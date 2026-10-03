import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { resetWeek } from '../services/maintenance';
import { addChunk, addChunkSentence, addIdea, chunksToPractice, deleteIdea, startSession } from '../services/sessions';
import { rateChunk } from '../services/reviews';
import { AIError } from './AIProvider';
import { buildVerbPrompt, deleteVerb, listVerbs, parseVerbs, saveVerbs, setVerbSelected } from './verbs';

const RAW = JSON.stringify({
  verbs: [
    {
      base: 'to Hold',
      translation: 'segurar',
      thirdPerson: 'holds',
      past: 'held',
      participle: 'held',
      gerund: 'holding',
      textForm: 'holding',
      textTense: 'Gerund',
      sentence: 'Your mind is for having ideas, not holding them.',
      drills: [
        { tense: 'Past simple', sentence: 'Yesterday she _____ the idea.', answer: 'held' },
        { tense: 'Present perfect', sentence: 'Sem lacuna.', answer: 'has held' },
        { tense: 'Future', sentence: 'She _____ it.', answer: '' },
      ],
    },
    { base: 'hold', translation: 'repetido' },
    { translation: 'sem forma base' },
    { base: 'keep', past: 'kept', drills: 'inválido' },
  ],
});

describe('verbos da ideia', () => {
  it('o pedido leva o texto e exige formas, tempo no texto e exercícios em tempos diferentes', () => {
    const { system, user } = buildVerbPrompt('Thought Into Action', 'Your mind is for having ideas.');
    expect(user).toContain('Your mind is for having ideas.');
    expect(system).toContain('"participle"');
    expect(system).toContain('"textTense"');
    expect(system).toContain('Present perfect');
    expect(system).toContain('_____');
  });

  it('aproveita os verbos válidos e descarta duplicados, incompletos e exercícios sem lacuna ou resposta', () => {
    const verbs = parseVerbs(`Aqui estão: ${RAW}`);
    expect(verbs.map((v) => v.base)).toEqual(['hold', 'keep']);
    expect(verbs[0]).toMatchObject({
      past: 'held',
      gerund: 'holding',
      textTense: 'Gerund',
      drills: [{ tense: 'Past simple', sentence: 'Yesterday she _____ the idea.', answer: 'held' }],
    });
    expect(verbs[1]?.drills).toEqual([]);
    expect(() => parseVerbs('não sei')).toThrow(AIError);
  });

  it('guarda os verbos na ideia, já selecionados, sem duplicar ao procurar de novo', async () => {
    const session = await startSession('2026-10-05');
    const idea = await addIdea(session.id, { title: 'Thought Into Action' });
    expect(await saveVerbs(idea.id, parseVerbs(RAW))).toBe(2);
    expect(await saveVerbs(idea.id, parseVerbs(RAW))).toBe(0);

    const verbs = await listVerbs(idea.id);
    expect(verbs.map((v) => [v.base, v.selected])).toEqual([
      ['hold', true],
      ['keep', true],
    ]);

    await setVerbSelected(verbs[1]!.id, false);
    await deleteVerb(verbs[0]!.id);
    expect((await listVerbs(idea.id)).map((v) => [v.base, v.selected])).toEqual([['keep', false]]);
  });

  it('os verbos somem com a ideia e com o reset da semana', async () => {
    const session = await startSession('2026-10-05');
    const a = await addIdea(session.id, { title: 'A' });
    const b = await addIdea(session.id, { title: 'B' });
    await saveVerbs(a.id, parseVerbs(RAW));
    await saveVerbs(b.id, parseVerbs(RAW));

    await deleteIdea(a.id);
    expect(await db.verbs.count()).toBe(2);
    await resetWeek('2026-10-05');
    expect(await db.verbs.count()).toBe(0);
  });
});

describe('treinar com mais chunks no PERSONALIZE', () => {
  it('guarda frases a mais sem apagar as anteriores nem repetir', async () => {
    const session = await startSession('2026-10-05');
    const chunk = await addChunk(session.id, { text: 'in your head' });

    await addChunkSentence(chunk.id, 'It lives in your head.');
    await addChunkSentence(chunk.id, 'Keep the plan in your head.');
    await addChunkSentence(chunk.id, 'Keep the plan in your head.');
    await addChunkSentence(chunk.id, '   ');

    expect(await db.chunks.get(chunk.id)).toMatchObject({
      userSentence: 'It lives in your head.',
      extraSentences: ['Keep the plan in your head.'],
    });
  });

  it('sugere chunks de dias anteriores, primeiro os mais esquecidos, sem os de hoje nem os já mostrados', async () => {
    const monday = await startSession('2026-10-05');
    const easy = await addChunk(monday.id, { text: 'easy one' });
    const hard = await addChunk(monday.id, { text: 'hard one' });
    await rateChunk(hard.id, 'AGAIN', '', '2026-10-06');
    const tuesday = await startSession('2026-10-06');
    await addChunk(tuesday.id, { text: 'today one' });

    expect((await chunksToPractice(tuesday.id, 3)).map((c) => c.text)).toEqual(['hard one', 'easy one']);
    expect((await chunksToPractice(tuesday.id, 3, [hard.id])).map((c) => c.text)).toEqual(['easy one']);
    expect(easy.id).not.toBe(hard.id);
  });
});
