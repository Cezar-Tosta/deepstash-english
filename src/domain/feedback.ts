import type { AIFeedback, FeedbackKind } from './types';

export interface FeedbackComment {
  kind: FeedbackKind;
  text: string;
}

/** O retorno sobre um texto, juntando os pedidos feitos: cada versão aparece uma única vez. */
export interface ConsolidatedFeedback {
  /** O texto do usuário a que o retorno se refere. */
  original: string;
  /** Os pedidos já atendidos. */
  kinds: FeedbackKind[];
  /** "Check grammar" (ou a avaliação do retelling): só os erros corrigidos. */
  corrected?: string;
  /** "Improve this sentence". */
  improved?: string;
  /** "Suggest a natural expression". */
  natural?: string;
  /** Um comentário por pedido, na mesma ordem das versões, sem repetir texto. */
  comments: FeedbackComment[];
}

const KIND_ORDER: readonly FeedbackKind[] = ['grammar', 'retell', 'improve', 'natural'];

/**
 * Junta os retornos guardados sobre um texto em um bloco só. Vale a versão mais
 * recente do texto e, para ela, o pedido mais recente de cada tipo.
 */
export function consolidateFeedback(history: readonly AIFeedback[]): ConsolidatedFeedback | null {
  const newestFirst = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = newestFirst[0];
  if (!latest) return null;
  const byKind = new Map<FeedbackKind, AIFeedback>();
  for (const entry of newestFirst) {
    if (entry.original === latest.original && !byKind.has(entry.kind)) byKind.set(entry.kind, entry);
  }

  const out: ConsolidatedFeedback = { original: latest.original, kinds: KIND_ORDER.filter((k) => byKind.has(k)), comments: [] };
  const corrected = byKind.get('grammar') ?? byKind.get('retell');
  if (corrected) out.corrected = corrected.corrected;
  const improved = byKind.get('improve');
  if (improved) out.improved = improved.corrected;
  const natural = byKind.get('natural');
  if (natural) out.natural = natural.moreNatural ?? natural.corrected;

  for (const kind of out.kinds) {
    const text = byKind.get(kind)?.explanation.trim() ?? '';
    if (text && !out.comments.some((c) => c.text === text)) out.comments.push({ kind, text });
  }
  return out;
}

/** A correção a mostrar quando só cabe uma: a de gramática; na falta dela, a melhorada; por fim, a natural. */
export function bestCorrection(feedback: ConsolidatedFeedback): string {
  return feedback.corrected ?? feedback.improved ?? feedback.natural ?? feedback.original;
}

/**
 * Identifica o retorno de uma frase de um chunk. A frase principal usa o id do chunk;
 * as demais (frases extras, frases de revisão) ganham um id próprio, derivado do texto,
 * para o retorno de uma não apagar o da outra.
 */
export function sentenceTarget(chunkId: string, sentence: string, mainSentence: string): string {
  const text = sentence.trim();
  if (text === mainSentence.trim()) return chunkId;
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = (Math.imul(hash, 33) ^ text.charCodeAt(i)) >>> 0;
  return `${chunkId}:${hash.toString(36)}`;
}

/** Uma correção recebida: o texto do usuário, como ficou e o comentário curto. Uma por texto. */
export interface Correction {
  key: string;
  target: AIFeedback['targetType'];
  targetId: string;
  original: string;
  corrected: string;
  comment: string;
  /** Quando o retorno mais recente sobre este texto foi pedido. */
  at: string;
}

/**
 * As correções contidas num conjunto de retornos: uma por texto, mesmo que ele tenha
 * recebido vários pedidos, e só quando houve mudança de fato. Textos idênticos com a
 * mesma correção contam uma vez.
 */
export function collectCorrections(history: readonly AIFeedback[]): Correction[] {
  const byTarget = new Map<string, AIFeedback[]>();
  for (const entry of history) {
    const key = `${entry.targetType}:${entry.targetId}`;
    byTarget.set(key, [...(byTarget.get(key) ?? []), entry]);
  }
  const out: Correction[] = [];
  const seen = new Set<string>();
  for (const [key, entries] of byTarget) {
    const feedback = consolidateFeedback(entries);
    if (!feedback) continue;
    const corrected = bestCorrection(feedback);
    // Diferença só de espaços não é correção.
    if (corrected.replace(/\s+/gu, ' ').trim() === feedback.original.replace(/\s+/gu, ' ').trim()) continue;
    const signature = `${feedback.original}\u0000${corrected}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    const [targetType = '', ...rest] = key.split(':');
    out.push({
      key,
      target: targetType as AIFeedback['targetType'],
      targetId: rest.join(':'),
      original: feedback.original,
      corrected,
      comment: feedback.comments[0]?.text ?? '',
      at: entries.reduce((latest, e) => (e.createdAt > latest ? e.createdAt : latest), ''),
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
