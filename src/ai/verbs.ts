import { db } from '../data/db';
import { nowISO } from '../domain/dates';
import { newId } from '../domain/ids';
import type { VerbDrill, VerbEntry } from '../domain/types';
import { getSettings } from '../services/settings';
import { AIError } from './AIProvider';
import { createProvider } from './feedback';

const MAX_VERBS = 8;
const CARDS_LIMIT = 6000;

export type ParsedVerb = Omit<VerbEntry, 'id' | 'ideaId' | 'selected' | 'createdAt'>;

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
      '- "drills": 4 exercícios, cada um num tempo diferente entre Present simple (com he/she/it), Past simple, Present perfect, Present continuous e Future (will). Cada exercício tem "tense" (nome em inglês), "sentence" (uma frase NOVA, curta, sobre o assunto do texto, com a lacuna "_____" no lugar do verbo conjugado, incluindo auxiliares) e "answer" (o que preenche a lacuna, por exemplo "has held" ou "is holding").',
      'Responda somente com um objeto JSON, sem texto antes ou depois: {"verbs": [{...}]}',
    ].join('\n'),
    user: `Ideia: ${ideaTitle}\n\nTexto dos cards:\n${cardsText.slice(0, CARDS_LIMIT)}`,
  };
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Lê a resposta da IA, descartando verbos e exercícios incompletos. */
export function parseVerbs(raw: string): ParsedVerb[] {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  let data: unknown = null;
  try {
    data = start >= 0 && end > start ? JSON.parse(raw.slice(start, end + 1)) : null;
  } catch {
    data = null;
  }
  const list = (data as { verbs?: unknown } | null)?.verbs;
  if (!Array.isArray(list)) throw new AIError('A IA respondeu em um formato inesperado.');

  const seen = new Set<string>();
  const verbs: ParsedVerb[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const v = item as Record<string, unknown>;
    const base = text(v['base']).replace(/^to\s+/i, '').toLowerCase();
    if (!base || seen.has(base)) continue;
    seen.add(base);

    const drills: VerbDrill[] = (Array.isArray(v['drills']) ? v['drills'] : []).flatMap((d): VerbDrill[] => {
      if (typeof d !== 'object' || d === null) return [];
      const drill = d as Record<string, unknown>;
      const sentence = text(drill['sentence']);
      const answer = text(drill['answer']);
      // Sem lacuna ou sem resposta não dá para corrigir: o exercício é descartado.
      if (!/_{3,}/.test(sentence) || !answer) return [];
      return [{ tense: text(drill['tense']) || 'Tense', sentence, answer }];
    });

    verbs.push({
      base,
      translation: text(v['translation']),
      thirdPerson: text(v['thirdPerson']),
      past: text(v['past']),
      participle: text(v['participle']),
      gerund: text(v['gerund']),
      textForm: text(v['textForm']),
      textTense: text(v['textTense']),
      sentence: text(v['sentence']),
      drills,
    });
  }
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
  const verbs = parseVerbs(await provider.complete(buildVerbPrompt(idea.title, cardsText)));
  if (verbs.length === 0) throw new AIError('A IA não encontrou verbos para estudar neste texto.');
  return saveVerbs(ideaId, verbs);
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
