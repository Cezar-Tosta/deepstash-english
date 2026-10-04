import { db } from '../data/db';
import { nowISO } from '../domain/dates';
import { type FocusData, isFocusEmpty, loadFocusData } from '../services/focus';
import { getSettings } from '../services/settings';
import { AIError, type AIProvider } from './AIProvider';
import { createProvider } from './feedback';

/** Quantas correções vão para a IA: as mais recentes. Mais do que isso alonga o pedido sem mudar o diagnóstico. */
const MAX_CORRECTIONS = 60;

/** Os dados de todos os ciclos em texto corrido, para a IA apontar os assuntos mais críticos. */
export function describeFocus(data: FocusData): string {
  const parts: string[] = [];
  const corrections = data.corrections.slice(0, MAX_CORRECTIONS);
  if (corrections.length > 0) {
    parts.push(
      `CORREÇÕES RECEBIDAS (${corrections.length}; o que ele escreveu → como ficou corrigido | comentário):`,
      ...corrections.map((c, i) => `${i + 1}. "${c.original}" → "${c.corrected}"${c.comment ? ` | ${c.comment}` : ''}`),
    );
  }
  if (data.hardTerms.length > 0) {
    parts.push(
      'TERMOS EM QUE ELE MAIS ERRA NOS EXERCÍCIOS:',
      ...data.hardTerms.map((t) => `- ${t.term}${t.meaning ? ` (${t.meaning})` : ''}: ${t.wrong} erros, ${t.right} acertos`),
    );
  }
  if (data.hardVerbs.length > 0) {
    parts.push(
      'VERBOS EM QUE ELE MAIS ERRA NOS TEMPOS VERBAIS:',
      ...data.hardVerbs.map((v) => `- to ${v.base}: ${v.wrong} erros, ${v.right} acertos`),
    );
  }
  if (data.forgotten.length > 0) {
    parts.push(
      'CHUNKS MAIS ESQUECIDOS NAS REVISÕES:',
      ...data.forgotten.map((c) => `- ${c.text}${c.meaning ? ` (${c.meaning})` : ''}: ${c.missed} vezes`),
    );
  }
  return parts.join('\n');
}

export function buildFocusPrompt(data: FocusData): { system: string; user: string } {
  return {
    system: [
      'Você é professor de inglês de um aluno brasileiro. Abaixo está o histórico dele em todos os ciclos de estudo: as correções que recebeu nos textos que escreveu, os erros nos exercícios e os chunks que esquece.',
      'Aponte os assuntos mais críticos, isto é, os tipos de erro que mais se repetem. Use só o que está nos dados: não invente erros.',
      'Responda em português do Brasil, em markdown, com de 3 a 6 assuntos, do mais frequente para o menos frequente. Para cada assunto:',
      '- uma linha com o nome do assunto em **negrito** e, entre parênteses, quantas correções dos dados são desse tipo;',
      '- a regra em uma frase;',
      '- dois exemplos tirados dos erros dele, no formato *errado* → *certo*, em inglês;',
      '- "Treine:" com um mini-exercício de duas frases em inglês com lacuna para ele completar (sem dar a resposta).',
      'Agrupe de verdade: concordância, tempos verbais, preposições, artigos, gerúndio e infinitivo, ordem das palavras, ortografia e vocabulário são assuntos diferentes.',
      'Se houver termos, verbos ou chunks problemáticos, feche com um assunto "Vocabulário a reforçar" listando-os.',
      'No máximo 320 palavras. Sem introdução e sem elogios genéricos.',
    ].join('\n'),
    user: describeFocus(data),
  };
}

/** Gera o plano de estudo dos assuntos mais críticos e o guarda nos ajustes, para valer em qualquer aparelho. */
export async function generateFocusPlan(injected?: AIProvider): Promise<string> {
  const data = await loadFocusData();
  if (isFocusEmpty(data)) throw new AIError('Ainda não há correções nem erros registrados para analisar.');

  const settings = await getSettings();
  const provider = injected ?? (await createProvider(settings.ai));
  if (!provider) throw new AIError('A IA não está configurada. Veja em Ajustes.');

  const text = (await provider.complete(buildFocusPrompt(data))).trim();
  if (!text) throw new AIError('A IA respondeu sem texto.');
  await db.settings.put({ ...(await getSettings()), studyFocus: { text, at: nowISO(), corrections: data.corrections.length } });
  return text;
}
