import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { resetWeek } from '../services/maintenance';
import { addChunk, addChunkSentence, addIdea, chunksToPractice, deleteIdea, startSession } from '../services/sessions';
import { rateChunk } from '../services/reviews';
import { AIError, type AIProvider } from './AIProvider';
import { askForVerbs, buildVerbPrompt, deleteVerb, listVerbs, parseVerbs, saveVerbs, setVerbSelected } from './verbs';

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

describe('respostas da IA fora do formato', () => {
  const hold = { base: 'hold', past: 'held', drills: [{ tense: 'Past simple', sentence: 'She _____ it.', answer: 'held' }] };
  const keep = { base: 'keep', past: 'kept', drills: [] };

  it('aceita a lista de verbos sem o objeto em volta', () => {
    expect(parseVerbs(JSON.stringify([hold, keep])).map((v) => v.base)).toEqual(['hold', 'keep']);
  });

  it('aceita cerca de código, texto em volta e vírgula sobrando', () => {
    const raw = 'Claro! Aqui estão:\n```json\n{"verbs": [{"base": "hold", "past": "held",}, {"base": "keep",},]}\n```\nBons estudos!';
    expect(parseVerbs(raw).map((v) => v.base)).toEqual(['hold', 'keep']);
  });

  it('aceita outros nomes de campo que os modelos costumam usar', () => {
    const raw = JSON.stringify({
      verbos: [
        {
          verb: 'to hold',
          past_simple: 'held',
          past_participle: 'held',
          third_person: 'holds',
          ing_form: 'holding',
          exercises: [{ tempo: 'Past simple', frase: 'She _____ it.', resposta: 'held' }],
        },
      ],
    });
    expect(parseVerbs(raw)[0]).toMatchObject({
      base: 'hold',
      past: 'held',
      participle: 'held',
      thirdPerson: 'holds',
      gerund: 'holding',
      drills: [{ tense: 'Past simple', sentence: 'She _____ it.', answer: 'held' }],
    });
  });

  it('resposta cortada no meio: aproveita os verbos que vieram completos', () => {
    const whole = JSON.stringify({ verbs: [hold, keep, { base: 'write', past: 'wrote', drills: [] }] });
    const cut = whole.slice(0, whole.indexOf('"write"') + 12);
    expect(parseVerbs(cut).map((v) => v.base)).toEqual(['hold', 'keep']);
    expect(parseVerbs(cut)[0]?.drills).toHaveLength(1);
  });

  it('chaves dentro de frases não confundem a leitura', () => {
    const raw = JSON.stringify({ verbs: [{ base: 'hold', sentence: 'Use {braces} and "quotes" freely.' }] }).slice(0, -2);
    expect(parseVerbs(raw)[0]).toMatchObject({ base: 'hold', sentence: 'Use {braces} and "quotes" freely.' });
  });

  it('sem nenhum verbo legível, é erro', () => {
    expect(() => parseVerbs('{"verbs": []}')).toThrow(AIError);
    expect(() => parseVerbs('{"message": "I cannot do that"}')).toThrow(AIError);
  });

  const provider = (replies: string[]): AIProvider & { calls: number } => {
    const p = { id: 'fake', model: 'modelo-x', calls: 0, chat: async () => '', complete: async () => replies[p.calls++] ?? '' };
    return p;
  };

  it('resposta ilegível ganha uma segunda tentativa, em modo JSON', async () => {
    const ai = provider(['desculpe, não entendi', JSON.stringify({ verbs: [hold] })]);
    expect((await askForVerbs(ai, 'Idea', 'text')).map((v) => v.base)).toEqual(['hold']);
    expect(ai.calls).toBe(2);
  });

  it('se as duas tentativas falham, o erro diz qual modelo e o que fazer', async () => {
    const ai = provider(['nada', 'nada de novo']);
    await expect(askForVerbs(ai, 'Idea', 'text')).rejects.toThrow('modelo-x');
    expect(ai.calls).toBe(2);
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
