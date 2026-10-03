import { db } from '../data/db';
import { nowISO } from '../domain/dates';
import { newId } from '../domain/ids';
import type { VerbDrill, VerbEntry } from '../domain/types';
import { getSettings } from '../services/settings';
import { parseLooseJSON, pickList, pickText, salvageObjects } from '../domain/looseJson';
import { AIError, type AIProvider } from './AIProvider';
import { saveTranslation } from './translate';
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
      drills: [
        {
          tense: 'Past simple',
          sentence: 'Yesterday she _____ the idea in her mind.',
          answer: 'held',
          translation: 'Ontem ela guardou a ideia na mente.',
        },
      ],
    },
  ],
});

export function buildVerbPrompt(
  ideaTitle: string,
  cardsText: string,
  only?: string,
): { system: string; user: string } {
  return {
    system: [
      'Você prepara material de estudo de tempos verbais para um brasileiro que aprende inglês lendo ideias de livros.',
      only
        ? `Prepare o material apenas para o verbo "${only}", que o aluno escolheu estudar. Devolva a lista "verbs" com esse único verbo. Se ele aparecer no texto abaixo, preencha "textForm", "textTense" e "sentence" com o que está lá; se não aparecer, deixe esses três campos vazios.`
        : `Do texto abaixo, escolha até ${MAX_VERBS} verbos principais que valha a pena estudar: os que carregam o sentido do texto, com preferência para os irregulares e os mais reutilizáveis. Ignore "be", "have" e "do" quando forem só auxiliares.`,
      'Para cada verbo informe:',
      '- "base": forma base, sem "to";',
      '- "translation": tradução em português no sentido usado no texto;',
      '- "thirdPerson", "past", "participle", "gerund": as formas (he/she/it, passado simples, particípio passado, -ing);',
      '- "textForm": a forma exata como aparece no texto;',
      '- "textTense": o tempo ou a forma em que aparece ali, em inglês (ex.: "Present simple", "Past simple", "Infinitive", "Gerund", "Imperative");',
      '- "sentence": a frase do texto em que ele aparece, copiada exatamente;',
      `- "drills": ${DRILLS_PER_VERB} exercícios, cada um num tempo diferente entre Present simple (com he/she/it), Past simple, Present perfect, Present continuous e Future (will). Cada exercício tem "tense" (nome em inglês), "sentence" (uma frase NOVA, curta, sobre o assunto do texto, com a lacuna "_____" no lugar do verbo conjugado, incluindo auxiliares), "answer" (o que preenche a lacuna, por exemplo "has held" ou "is holding") e "translation" (a tradução da frase completa para o português do Brasil).`,
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
      const translation = pickText(drill, 'translation', 'traducao');
      return [{ tense: pickText(drill, 'tense', 'tempo') || 'Tense', sentence, answer, ...(translation ? { translation } : {}) }];
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
  return db.transaction('rw', db.verbs, db.translations, async () => {
    const existing = new Set((await db.verbs.where('ideaId').equals(ideaId).toArray()).map((v) => v.base));
    const fresh = parsed.filter((v) => !existing.has(v.base));
    await db.verbs.bulkAdd(
      fresh.map((v): VerbEntry => ({ ...v, id: newId(), ideaId, selected: true, createdAt: nowISO() })),
    );
    // A tradução de cada frase de exercício fica guardada pela frase completa, já com a resposta.
    for (const drill of fresh.flatMap((v) => v.drills)) {
      if (drill.translation) await saveTranslation(drill.sentence.replace(/_{3,}/, drill.answer), drill.translation);
    }
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
export async function askForVerbs(
  provider: AIProvider,
  ideaTitle: string,
  cardsText: string,
  only?: string,
): Promise<ParsedVerb[]> {
  const request = { ...buildVerbPrompt(ideaTitle, cardsText, only), json: true };
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

/** A forma base como o app a guarda: sem "to", em minúsculas. */
export function normalizeBase(input: string): string {
  return input.trim().replace(/^to\s+/i, '').replace(/\s+/g, ' ').toLowerCase();
}

async function ideaText(ideaId: string): Promise<{ title: string; cardsText: string }> {
  const idea = await db.ideas.get(ideaId);
  if (!idea) throw new AIError('Ideia não encontrada.');
  const cards = await db.cards.where('ideaId').equals(ideaId).sortBy('position');
  return {
    title: idea.title,
    cardsText: cards
      .map((c) => c.content.trim())
      .filter(Boolean)
      .join('\n\n'),
  };
}

/**
 * Cadastra na ideia um verbo escolhido pelo usuário. O verbo é guardado na hora,
 * só com a forma base; depois a IA, se houver, completa as formas e os exercícios.
 * Devolve se o verbo ficou completo.
 */
export async function addVerb(ideaId: string, input: string, injected?: AIProvider | null): Promise<{ complete: boolean }> {
  const base = normalizeBase(input);
  if (!base) throw new AIError('Informe o verbo na forma base, por exemplo "hold".');
  const existing = await db.verbs.where('ideaId').equals(ideaId).toArray();
  if (existing.some((v) => v.base === base)) throw new AIError(`"${base}" já está nos verbos desta ideia.`);

  const entry: VerbEntry = {
    id: newId(),
    ideaId,
    base,
    translation: '',
    thirdPerson: '',
    past: '',
    participle: '',
    gerund: '',
    textForm: '',
    textTense: '',
    sentence: '',
    selected: true,
    drills: [],
    createdAt: nowISO(),
  };
  await db.verbs.add(entry);
  return { complete: await completeVerb(entry.id, injected) };
}

/**
 * Pede à IA as formas e os exercícios de um verbo já cadastrado. Devolve false se
 * não há IA configurada; o verbo continua cadastrado, só com a forma base.
 */
export async function completeVerb(verbId: string, injected?: AIProvider | null): Promise<boolean> {
  const verb = await db.verbs.get(verbId);
  if (!verb) throw new AIError('Verbo não encontrado.');
  const provider = injected === undefined ? await createProvider((await getSettings()).ai) : injected;
  if (!provider) return false;

  const { title, cardsText } = await ideaText(verb.ideaId);
  const parsed = await askForVerbs(provider, title, cardsText, verb.base);
  const found = parsed.find((v) => v.base === verb.base) ?? parsed[0];
  if (!found) return false;
  await db.transaction('rw', db.verbs, db.translations, async () => {
    // A forma base digitada pelo usuário é mantida.
    await db.verbs.update(verbId, { ...found, base: verb.base });
    for (const drill of found.drills) {
      if (drill.translation) await saveTranslation(drill.sentence.replace(/_{3,}/, drill.answer), drill.translation);
    }
  });
  return true;
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
