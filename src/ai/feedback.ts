import { db } from '../data/db';
import { nowISO } from '../domain/dates';
import { newId } from '../domain/ids';
import type { AIFeedback, AISettings, FeedbackKind, FeedbackTarget } from '../domain/types';
import { getSettings } from '../services/settings';
import { AIError, type AIProvider, GROQ_BASE_URL, GROQ_DEFAULT_MODEL } from './AIProvider';

export function isAIConfigured(ai: AISettings): boolean {
  if (ai.provider === 'anthropic' || ai.provider === 'groq') return ai.apiKey.trim() !== '';
  if (ai.provider === 'openai-compatible') return ai.baseUrl.trim() !== '' && ai.model.trim() !== '';
  return false;
}

/** Os SDKs só são baixados quando a IA é usada; sem IA o app nem carrega esse código. */
export async function createProvider(ai: AISettings): Promise<AIProvider | null> {
  if (!isAIConfigured(ai)) return null;
  if (ai.provider === 'anthropic') {
    const { createAnthropicProvider } = await import('./anthropicProvider');
    return createAnthropicProvider(ai.apiKey, ai.model);
  }
  const { createOpenAICompatibleProvider } = await import('./openAICompatibleProvider');
  if (ai.provider === 'groq') {
    return createOpenAICompatibleProvider(
      GROQ_BASE_URL,
      ai.model.trim() || GROQ_DEFAULT_MODEL,
      ai.apiKey.trim(),
      'groq',
    );
  }
  return createOpenAICompatibleProvider(ai.baseUrl, ai.model, ai.apiKey);
}

export const FEEDBACK_LABELS: Record<FeedbackKind, string> = {
  grammar: 'Check grammar',
  improve: 'Improve this sentence',
  natural: 'Suggest a natural expression',
};

const FOCUS: Record<FeedbackKind, string> = {
  grammar: 'Corrija apenas erros de gramática e ortografia, mudando o mínimo possível.',
  improve: 'Corrija os erros e melhore a clareza, preservando a ideia e o nível do aluno.',
  natural:
    'Corrija os erros e, em "moreNatural", mostre como um falante nativo diria a mesma coisa.',
};

export function buildFeedbackPrompt(
  kind: FeedbackKind,
  text: string,
  context: string,
): { system: string; user: string } {
  return {
    system: [
      'Você é um professor de inglês de um aluno brasileiro que estuda com cards curtos de ideias.',
      'O aluno já escreveu a própria tentativa; seu papel é dar retorno sobre ela, nunca escrever no lugar dele.',
      FOCUS[kind],
      'Responda somente com um objeto JSON, sem texto antes ou depois, neste formato:',
      '{"corrected": "<o texto do aluno corrigido, em inglês>", "why": "<explicação curta em português do principal erro; se não havia erro, diga isso>", "moreNatural": "<versão mais natural em inglês, ou null se a corrigida já soa natural>"}',
      'Se o texto já estiver correto, repita-o em "corrected".',
    ].join('\n'),
    user: context ? `Contexto: ${context}\n\nTexto do aluno:\n${text}` : `Texto do aluno:\n${text}`,
  };
}

export interface ParsedFeedback {
  corrected: string;
  explanation: string;
  moreNatural: string | null;
}

/** Aceita o JSON puro ou embrulhado em texto/cerca de código, como alguns modelos devolvem. */
export function parseFeedback(raw: string): ParsedFeedback {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AIError('A IA respondeu em um formato inesperado.');
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new AIError('A IA respondeu em um formato inesperado.');
  }
  const obj = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const corrected = obj['corrected'];
  if (typeof corrected !== 'string' || !corrected.trim()) {
    throw new AIError('A IA respondeu em um formato inesperado.');
  }
  const why = obj['why'];
  const moreNatural = obj['moreNatural'];
  return {
    corrected: corrected.trim(),
    explanation: typeof why === 'string' ? why.trim() : '',
    moreNatural:
      typeof moreNatural === 'string' && moreNatural.trim() && moreNatural.trim() !== corrected.trim()
        ? moreNatural.trim()
        : null,
  };
}

export interface FeedbackRequest {
  kind: FeedbackKind;
  targetType: FeedbackTarget;
  targetId: string;
  /** O texto que o usuário já escreveu e salvou. Sem tentativa, sem IA. */
  text: string;
  context: string;
}

export async function requestFeedback(request: FeedbackRequest): Promise<AIFeedback> {
  const original = request.text.trim();
  if (!original) throw new AIError('Escreva a sua versão primeiro. A IA só comenta o que você tentou.');

  const provider = await createProvider((await getSettings()).ai);
  if (!provider) throw new AIError('A IA não está configurada. Veja em Ajustes.');

  const parsed = parseFeedback(
    await provider.complete(buildFeedbackPrompt(request.kind, original, request.context)),
  );
  const feedback: AIFeedback = {
    id: newId(),
    kind: request.kind,
    targetType: request.targetType,
    targetId: request.targetId,
    original,
    ...parsed,
    provider: provider.id,
    model: provider.model,
    createdAt: nowISO(),
  };
  await db.aiFeedback.add(feedback);
  return feedback;
}

export async function getFeedbackFor(
  targetType: FeedbackTarget,
  targetId: string,
): Promise<AIFeedback[]> {
  const items = await db.aiFeedback
    .where('[targetType+targetId]')
    .equals([targetType, targetId])
    .toArray();
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
