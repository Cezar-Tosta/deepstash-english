import { db } from '../data/db';
import { nowISO } from '../domain/dates';
import { newId } from '../domain/ids';
import type { VerbDrill, VerbEntry } from '../domain/types';
import { getSettings } from '../services/settings';
import { parseLooseJSON, pickList, pickText, salvageObjects } from '../domain/looseJson';
import { AIError, type AIProvider } from './AIProvider';
import { createProvider } from './feedback';

// Seis verbos com três exercícios cada: resposta curta o bastante para não ser cortada.
const MAX_VERBS = 6;
const DRILLS_PER_VERB = 3;
const CARDS_LIMIT = 6000;

export type ParsedVerb = Omit<VerbEntry, 'id' | 'ideaId' | 'selected' | 'createdAt'>;

const EXAMPLE = JSON.stringify({
  verbs: [
    {
      base: 'hold',
      translation: 'segurar',
      thirdPerson: 'holds',
      past: 'held',
      participle: 'held',
      gerund: 'holding',
      textForm: 'holding',
      textTense: 'Gerund',
      sentence: 'Your mind is for having ideas, not holding them.',
      drills: [{ tense: 'Past simple', sentence: 'Yesterday she _____ the idea in her mind.', answer: 'held' }],
    },
  ],
});

export function buildVerbPrompt(ideaTitle: string, cardsText: string): { system: string; user: string } {
  return {
    system: [
      'Você prepara material de estudo de tempos verbais para um brasileiro que aprende inglês lendo ideias de livros.',
      `Do texto abaixo, escolha até ${MAX_VERBS} verbos principais que valha a pena estudar: os que carregam o sentido do texto, com preferência para os irregulares e os mais reutilizáveis. Ignore "be", "have" e "do" quando forem só auxiliares.`,
      'Para cada verbo informe:',
      '- "base": forma base, sem "to";',
      '- "translation": tradução em português no sentido usado no texto;',
      '- "thirdPerson", "past", "participle", "gerund": as formas (he/she/it, passado simples, particípio passado, -ing);',
      '- "textForm": a forma exata como aparece no texto;',
      '- "textTense": o tempo ou a forma em que aparece ali, em inglês (ex.: "Present simple", "Past simple", "Infinitive", "Gerund", "Imperative");',
      '- "sentence": a frase do texto em que ele aparece, copiada exatamente;',
      `- "drills": ${DRILLS_PER_VERB} exercícios, cada um num tempo diferente entre Present simple (com he/she/it), Past simple, Present perfect, Present continuous e Future (will). Cada exercício tem "tense" (nome em inglês), "sentence" (uma frase NOVA, curta, sobre o assunto do texto, com a lacuna "_____" no lugar do verbo conjugado, incluindo auxiliares) e "answer" (o que preenche a lacuna, por exemplo "has held" ou "is holding").`,
      'Responda somente com um objeto JSON válido, sem texto antes ou depois, sem comentários e sem cerca de código, exatamente com estes nomes de campo. Exemplo do formato (com um verbo e um exercício):',
      EXAMPLE,
    ].join('\n'),
    user: `Ideia: ${ideaTitle}\n\nTexto dos cards:\n${cardsText.slice(0, CARDS_LIMIT)}`,
  };
}

/** Os verbos da resposta, esteja ela inteira, embrulhada, como lista solta ou cortada no meio. */
function verbObjects(raw: string): Record<string, unknown>[] {
  const data = parseLooseJSON(raw);
  const list = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null
      ? pickList(data as Record<string, unknown>, 'verbs', 'verbos', 'items', 'data', 'result')
      : [];
  const objects = list.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v));
  // Resposta cortada ou com JSON inválido: aproveita os verbos que vieram completos.
  return objects.length > 0 ? objects : salvageObjects(raw, 'base');
}

/** Lê a resposta da IA, descartando verbos e exercícios incompletos. */
export function parseVerbs(raw: string): ParsedVerb[] {
  const objects = verbObjects(raw);
  if (objects.length === 0) throw new AIError('A IA respondeu em um formato inesperado.');

  const seen = new Set<string>();
  const verbs: ParsedVerb[] = [];
  for (const v of objects) {
    const base = pickText(v, 'base', 'verb', 'infinitive').replace(/^to\s+/i, '').toLowerCase();
    if (!base || seen.has(base)) continue;
    seen.add(base);

    const drills: VerbDrill[] = pickList(v, 'drills', 'exercises', 'exercicios').flatMap((d): VerbDrill[] => {
      if (typeof d !== 'object' || d === null) return [];
      const drill = d as Record<string, unknown>;
      const sentence = pickText(drill, 'sentence', 'frase');
      const answer = pickText(drill, 'answer', 'resposta');
      // Sem lacuna ou sem resposta não dá para corrigir: o exercício é descartado.
      if (!/_{3,}/.test(sentence) || !answer) return [];
      return [{ tense: pickText(drill, 'tense', 'tempo') || 'Tense', sentence, answer }];
    });

    verbs.push({
      base,
      translation: pickText(v, 'translation', 'traducao', 'meaning'),
      thirdPerson: pickText(v, 'thirdPerson', 'thirdPersonSingular', 'third'),
      past: pickText(v, 'past', 'pastSimple', 'simplePast'),
      participle: pickText(v, 'participle', 'pastParticiple'),
      gerund: pickText(v, 'gerund', 'ing', 'presentParticiple', 'ingForm'),
      textForm: pickText(v, 'textForm', 'form'),
      textTense: pickText(v, 'textTense', 'tense'),
      sentence: pickText(v, 'sentence', 'frase'),
      drills,
    });
  }
  if (verbs.length === 0) throw new AIError('A IA respondeu em um formato inesperado.');
  return verbs.slice(0, MAX_VERBS);
}

/**
 * Guarda os verbos encontrados numa ideia. Os que já existiam (mesma forma base)
 * são mantidos como estão, com a seleção do usuário; só entram os novos.
 */
export async function saveVerbs(ideaId: string, parsed: readonly ParsedVerb[]): Promise<number> {
  return db.transaction('rw', db.verbs, async () => {
    const existing = new Set((await db.verbs.where('ideaId').equals(ideaId).toArray()).map((v) => v.base));
    const fresh = parsed.filter((v) => !existing.has(v.base));
    await db.verbs.bulkAdd(
      fresh.map((v): VerbEntry => ({ ...v, id: newId(), ideaId, selected: true, createdAt: nowISO() })),
    );
    return fresh.length;
  });
}

/** Pede à IA os verbos da ideia, com formas e exercícios, e os guarda. Devolve quantos são novos. */
export async function findVerbs(ideaId: string): Promise<number> {
  const idea = await db.ideas.get(ideaId);
  if (!idea) throw new AIError('Ideia não encontrada.');
  const cards = await db.cards.where('ideaId').equals(ideaId).sortBy('position');
  const cardsText = cards
    .map((c) => c.content.trim())
    .filter(Boolean)
    .join('\n\n');
  if (!cardsText) throw new AIError('Registre o texto dos cards desta ideia para encontrar os verbos.');

  const provider = await createProvider((await getSettings()).ai);
  if (!provider) throw new AIError('A IA não está configurada. Veja em Ajustes.');
  return saveVerbs(ideaId, await askForVerbs(provider, idea.title, cardsText));
}

/**
 * Consulta a IA e lê a resposta. Modelos menores às vezes erram o formato numa
 * resposta longa, então uma resposta ilegível ganha uma segunda tentativa antes de
 * virar erro para o usuário.
 */
export async function askForVerbs(provider: AIProvider, ideaTitle: string, cardsText: string): Promise<ParsedVerb[]> {
  const request = { ...buildVerbPrompt(ideaTitle, cardsText), json: true };
  try {
    return parseVerbs(await provider.complete(request));
  } catch (first) {
    if (!(first instanceof AIError) || !first.message.includes('formato inesperado')) throw first;
    try {
      return parseVerbs(await provider.complete(request));
    } catch (second) {
      if (second instanceof AIError && second.message.includes('formato inesperado')) {
        throw new AIError(
          `O modelo "${provider.model}" não devolveu os verbos no formato pedido, mesmo na segunda tentativa. Tente de novo ou escolha outro modelo em Settings.`,
        );
      }
      throw second;
    }
  }
}

export async function listVerbs(ideaId: string): Promise<VerbEntry[]> {
  return db.verbs.where('ideaId').equals(ideaId).sortBy('createdAt');
}

/** Marca ou desmarca o verbo para estudo. Só os selecionados entram nos exercícios. */
export async function setVerbSelected(verbId: string, selected: boolean): Promise<void> {
  await db.verbs.update(verbId, { selected });
}

export function deleteVerb(verbId: string): Promise<void> {
  return db.transaction('rw', db.verbs, db.practiceStats, async () => {
    const stats = await db.practiceStats.toArray();
    await db.practiceStats.bulkDelete(stats.filter((s) => s.id.startsWith(`verb:${verbId}:`)).map((s) => s.id));
    await db.verbs.delete(verbId);
  });
}
