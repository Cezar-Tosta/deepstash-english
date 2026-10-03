import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { addIdea, startSession } from '../services/sessions';
import { AIError, type AIProvider } from './AIProvider';
import { getTranslation, parseTranslation, saveTranslation, translateSentence } from './translate';
import { parseVerbs, saveVerbs } from './verbs';

function fakeAI(reply: string) {
  const asked: string[] = [];
  const provider: AIProvider = {
    id: 'fake',
    model: 'fake',
    chat: async () => '',
    complete: async ({ user }) => {
      asked.push(user);
      return reply;
    },
  };
  return { provider, asked };
}

describe('tradução das frases dos exercícios', () => {
  it('traduz a frase na primeira vez e depois usa o que ficou guardado, sem consultar a IA de novo', async () => {
    const { provider, asked } = fakeAI('{"pt": "Mantenha isso fora da sua cabeça."}');
    expect(await getTranslation('Keep it out of your head.')).toBeNull();

    expect(await translateSentence('Keep it out of your head.', provider)).toBe('Mantenha isso fora da sua cabeça.');
    expect(await translateSentence('  Keep it out of your head. ', provider)).toBe('Mantenha isso fora da sua cabeça.');
    expect(asked).toEqual(['Keep it out of your head.']);
  });

  it('lê a resposta com texto em volta e sem asteriscos', () => {
    expect(parseTranslation('Claro: {"pt": "**Faça** uma coisa de cada vez."}')).toBe('Faça uma coisa de cada vez.');
    expect(() => parseTranslation('não sei')).toThrow(AIError);
  });

  it('sem IA e sem tradução guardada, é erro; com tradução guardada, funciona sem IA', async () => {
    await saveTranslation('Do one thing at a time.', 'Faça uma coisa de cada vez.');
    expect(await translateSentence('Do one thing at a time.')).toBe('Faça uma coisa de cada vez.');
    await expect(translateSentence('A brand new sentence.')).rejects.toBeInstanceOf(AIError);
  });

  it('os exercícios de verbo já chegam com a tradução da frase completa', async () => {
    const session = await startSession('2026-10-05');
    const idea = await addIdea(session.id, { title: 'Thought Into Action' });
    const raw = JSON.stringify({
      verbs: [
        {
          base: 'hold',
          drills: [
            { tense: 'Past simple', sentence: 'Yesterday she _____ the idea.', answer: 'held', translation: 'Ontem ela guardou a ideia.' },
            { tense: 'Future', sentence: 'She _____ it.', answer: 'will hold' },
          ],
        },
      ],
    });
    await saveVerbs(idea.id, parseVerbs(raw));

    expect(await getTranslation('Yesterday she held the idea.')).toBe('Ontem ela guardou a ideia.');
    expect(await getTranslation('She will hold it.')).toBeNull();
    expect(await db.translations.count()).toBe(1);
  });
});
