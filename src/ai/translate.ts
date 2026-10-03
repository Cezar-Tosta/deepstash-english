import { db } from '../data/db';
import { nowISO } from '../domain/dates';
import { parseLooseJSON, pickText } from '../domain/looseJson';
import { stripMarkdown } from '../domain/richText';
import { getSettings } from '../services/settings';
import { AIError, type AIProvider } from './AIProvider';
import { createProvider } from './feedback';

/** A frase é a própria chave: a mesma frase nunca é traduzida duas vezes. */
const keyOf = (sentence: string): string => sentence.trim();

export async function getTranslation(sentence: string): Promise<string | null> {
  return (await db.translations.get(keyOf(sentence)))?.pt ?? null;
}

/** Guarda uma tradução já conhecida (por exemplo, a que veio junto com os exercícios de um verbo). */
export async function saveTranslation(sentence: string, pt: string): Promise<void> {
  const id = keyOf(sentence);
  const text = stripMarkdown(pt.trim());
  if (!id || !text) return;
  await db.translations.put({ id, pt: text, createdAt: nowISO() });
}

export function buildTranslationPrompt(sentence: string): { system: string; user: string; json: true } {
  return {
    system: [
      'Traduza a frase em inglês para o português do Brasil, de forma natural e fiel, como um bom tradutor faria.',
      'Traduza a frase inteira, sem explicar e sem comentar.',
      'Responda somente com um objeto JSON: {"pt": "<tradução>"}',
    ].join('\n'),
    user: sentence,
    json: true,
  };
}

export function parseTranslation(raw: string): string {
  const data = parseLooseJSON(raw);
  const pt =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? pickText(data as Record<string, unknown>, 'pt', 'translation', 'traducao')
      : '';
  if (!pt) throw new AIError('A IA respondeu em um formato inesperado.');
  return stripMarkdown(pt);
}

/**
 * A tradução da frase para o português. Vem do que já está guardado; só consulta a
 * IA na primeira vez em que a frase aparece.
 */
export async function translateSentence(sentence: string, injected?: AIProvider): Promise<string> {
  const cached = await getTranslation(sentence);
  if (cached) return cached;
  const provider = injected ?? (await createProvider((await getSettings()).ai));
  if (!provider) throw new AIError('A IA não está configurada. Veja em Ajustes.');
  const pt = parseTranslation(await provider.complete(buildTranslationPrompt(keyOf(sentence))));
  await saveTranslation(sentence, pt);
  return pt;
}
