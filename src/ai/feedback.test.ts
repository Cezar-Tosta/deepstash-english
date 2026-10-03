import { describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { AIError } from './AIProvider';
import { isAIConfigured, parseFeedback, requestFeedback } from './feedback';

describe('retorno da IA', () => {
  it('lê o formato MY VERSION → CORRECTED → WHY → MORE NATURAL', () => {
    const raw =
      '```json\n{"corrected": "This card talks about focus.", "why": "Na terceira pessoa do singular usamos talks.", "moreNatural": "This card is about focus."}\n```';
    expect(parseFeedback(raw)).toEqual({
      corrected: 'This card talks about focus.',
      explanation: 'Na terceira pessoa do singular usamos talks.',
      moreNatural: 'This card is about focus.',
    });
  });

  it('ignora "moreNatural" vazio ou igual à correção', () => {
    expect(parseFeedback('{"corrected": "OK.", "why": "", "moreNatural": "OK."}').moreNatural).toBeNull();
    expect(parseFeedback('{"corrected": "OK.", "why": "", "moreNatural": null}').moreNatural).toBeNull();
  });

  it('recusa resposta fora do formato', () => {
    expect(() => parseFeedback('Sure! Here is my answer.')).toThrow(AIError);
    expect(() => parseFeedback('{"why": "sem correção"}')).toThrow(AIError);
  });

  it('não chama a IA sem uma tentativa do usuário', async () => {
    await expect(
      requestFeedback({ kind: 'grammar', targetType: 'opinion', targetId: 'x', text: '  ', context: '' }),
    ).rejects.toBeInstanceOf(AIError);
    expect(await db.aiFeedback.count()).toBe(0);
  });

  it('o app funciona sem IA: o padrão é desligada', () => {
    expect(isAIConfigured({ provider: 'none', baseUrl: '', model: '', apiKey: '' })).toBe(false);
    expect(isAIConfigured({ provider: 'anthropic', baseUrl: '', model: '', apiKey: '' })).toBe(false);
    expect(isAIConfigured({ provider: 'groq', baseUrl: '', model: '', apiKey: '' })).toBe(false);
    expect(isAIConfigured({ provider: 'groq', baseUrl: '', model: '', apiKey: 'gsk_x' })).toBe(true);
    expect(
      isAIConfigured({ provider: 'openai-compatible', baseUrl: 'http://localhost:11434/v1', model: 'llama3', apiKey: '' }),
    ).toBe(true);
  });
});
