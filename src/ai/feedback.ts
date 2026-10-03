import { db } from '../data/db';
import { nowISO } from '../domain/dates';
import { stripMarkdown } from '../domain/richText';
import { newId } from '../domain/ids';
import type { AIFeedback, AISettings, FeedbackKind, FeedbackTarget } from '../domain/types';
import { getSettings } from '../services/settings';
import {
  AIError,
  type AIProvider,
  ANTHROPIC_DEFAULT_MODEL,
  GROQ_BASE_URL,
  GROQ_DEFAULT_MODEL,
  GROQ_TRANSCRIPTION_MODEL,
  GROQ_VISION_MODEL,
  OPENAI_TRANSCRIPTION_MODEL,
} from './AIProvider';

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
    return createOpenAICompatibleProvider({
      baseUrl: GROQ_BASE_URL,
      model: ai.model.trim() || GROQ_DEFAULT_MODEL,
      apiKey: ai.apiKey.trim(),
      id: 'groq',
      transcriptionModel: GROQ_TRANSCRIPTION_MODEL,
      visionModel: ai.visionModel?.trim() || GROQ_VISION_MODEL,
    });
  }
  return createOpenAICompatibleProvider({
    baseUrl: ai.baseUrl,
    model: ai.model,
    apiKey: ai.apiKey,
    ...(ai.visionModel?.trim() ? { visionModel: ai.visionModel.trim() } : {}),
  });
}

export const FEEDBACK_LABELS: Record<FeedbackKind, string> = {
  grammar: 'Check grammar',
  improve: 'Improve this sentence',
  natural: 'Suggest a natural expression',
  retell: 'Evaluate my retelling',
};

const FOCUS: Record<FeedbackKind, string> = {
  grammar: 'Corrija apenas erros de gramática e ortografia, mudando o mínimo possível.',
  improve: 'Corrija os erros e melhore a clareza, preservando a ideia e o nível do aluno.',
  natural:
    'Corrija os erros e, em "moreNatural", mostre como um falante nativo diria a mesma coisa.',
  retell:
    'O texto é a transcrição de uma fala improvisada do aluno recontando uma ideia. Ignore hesitações e falhas da transcrição. Em "corrected", reescreva a fala corrigida, mantendo o conteúdo e o nível dele. Em "why", comente em português, em até 4 frases: se ele transmitiu a ideia principal, os 2 ou 3 erros de inglês mais importantes, e se usou as expressões que está aprendendo. Em "moreNatural" responda null.',
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
    corrected: stripMarkdown(corrected.trim()),
    explanation: typeof why === 'string' ? why.trim() : '',
    moreNatural:
      typeof moreNatural === 'string' && moreNatural.trim() && moreNatural.trim() !== corrected.trim()
        ? stripMarkdown(moreNatural.trim())
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
    await provider.complete({ ...buildFeedbackPrompt(request.kind, original, request.context), json: true }),
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

/** Transcrição só existe nos provedores com endpoint de áudio (Groq e compatíveis com OpenAI). */
export function canTranscribe(ai: AISettings): boolean {
  return isAIConfigured(ai) && (ai.provider === 'groq' || ai.provider === 'openai-compatible');
}

export async function transcribeAudio(audio: Blob): Promise<string> {
  const provider = await createProvider((await getSettings()).ai);
  if (!provider?.transcribe) throw new AIError('O provedor de IA configurado não faz transcrição.');
  return provider.transcribe(audio);
}

export interface WordMeaning {
  /** Tradução curta para o português, no sentido que o termo tem naquela frase. */
  meaning: string;
  /** Uma ou duas frases em português explicando o uso no contexto. */
  explanation: string;
  /** Transcrição fonética em IPA, entre barras. Vazia se a IA não informou. */
  phonetic: string;
  /** Classe gramatical naquele contexto (verbo, substantivo, phrasal verb…). */
  wordClass: string;
  /** Tradução da frase inteira, quando a IA a enviou. */
  sentenceTranslation: string;
}

/** A frase com o trecho selecionado entre [[ ]], para a IA saber exatamente o que analisar. */
export function markTerm(term: string, sentence: string): string {
  const at = sentence.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0) return sentence;
  return `${sentence.slice(0, at)}[[${sentence.slice(at, at + term.length)}]]${sentence.slice(at + term.length)}`;
}

export function buildLookupPrompt(term: string, sentence: string): { system: string; user: string } {
  const words = term.trim().split(/\s+/).filter(Boolean).length;
  const unit =
    words > 1
      ? [
          `O trecho selecionado tem ${words} palavras. Trate-o como um bloco único.`,
          'Em "meaning", dê UMA tradução para o trecho inteiro, do jeito que se diria em português, e não a tradução de cada palavra.',
          'Em "explanation", comente o sentido e o uso do trecho inteiro nessa frase (se é expressão idiomática, phrasal verb, colocação ou uma oração); não explique as palavras separadamente.',
          'Em "phonetic", transcreva o trecho inteiro.',
        ]
      : [
          'Em "meaning", dê a tradução da palavra no sentido que ela tem nessa frase, e não todos os sentidos possíveis.',
          'Em "explanation", diga a classe gramatical e comente o uso nessa frase.',
        ];
  return {
    system: [
      'Você é um dicionário inglês → português para um estudante brasileiro que lê resumos de livros.',
      'O que deve ser analisado é exatamente o trecho marcado entre [[ ]] na frase: nem mais, nem menos.',
      ...unit,
      'Responda somente com um objeto JSON, sem texto antes ou depois, neste formato:',
      '{"meaning": "<tradução em português do trecho marcado, no sentido do contexto>", "phonetic": "<transcrição fonética em IPA, pronúncia americana, entre barras>", "wordClass": "<classe gramatical do trecho nessa frase, em português: verbo, substantivo, adjetivo, advérbio, preposição, phrasal verb, expressão idiomática, colocação…>", "explanation": "<1 ou 2 frases em português sobre como o trecho marcado está sendo usado nessa frase>", "sentenceTranslation": "<tradução da frase inteira para o português do Brasil>"}',
    ].join('\n'),
    user: `Termo: ${term}\nPalavras no termo: ${words}\nFrase, com o termo entre [[ ]]: ${markTerm(term, sentence)}`,
  };
}

export function parseLookup(raw: string): WordMeaning {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  let data: unknown = null;
  try {
    data = start >= 0 && end > start ? JSON.parse(raw.slice(start, end + 1)) : null;
  } catch {
    data = null;
  }
  const obj = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const meaning = obj['meaning'];
  if (typeof meaning !== 'string' || !meaning.trim()) {
    throw new AIError('A IA respondeu em um formato inesperado.');
  }
  const explanation = obj['explanation'];
  const phonetic = obj['phonetic'];
  return {
    meaning: stripMarkdown(meaning.trim()),
    explanation: typeof explanation === 'string' ? explanation.trim() : '',
    phonetic: typeof phonetic === 'string' ? stripMarkdown(phonetic.trim()) : '',
    wordClass: typeof obj['wordClass'] === 'string' ? stripMarkdown(obj['wordClass'].trim()).toLowerCase() : '',
    sentenceTranslation:
      typeof obj['sentenceTranslation'] === 'string' ? stripMarkdown(obj['sentenceTranslation'].trim()) : '',
  };
}

/** Significado de uma palavra ou expressão dentro da frase em que ela apareceu. */
export async function lookupMeaning(term: string, sentence: string): Promise<WordMeaning> {
  const provider = await createProvider((await getSettings()).ai);
  if (!provider) throw new AIError('A IA não está configurada. Veja em Ajustes.');
  const result = parseLookup(await provider.complete({ ...buildLookupPrompt(term, sentence), json: true }));
  // Guarda a tradução da frase: ela aparece depois nos exercícios, sem nova consulta.
  if (result.sentenceTranslation && sentence.trim()) {
    await db.translations.put({ id: sentence.trim(), pt: result.sentenceTranslation, createdAt: nowISO() });
  }
  return result;
}

export interface ModelsInUse {
  provider: string;
  /** Correções, traduções e orientação. */
  text: string;
  /** Leitura de screenshots de cards. */
  images: string;
  /** Transcrição da fala; null quando o provedor não transcreve áudio. */
  audio: string | null;
}

const PROVIDER_NAMES: Record<AISettings['provider'], string> = {
  none: '',
  groq: 'Groq',
  anthropic: 'Anthropic',
  'openai-compatible': 'Compatível com OpenAI',
};

/** Qual modelo atende cada função, já com os padrões aplicados. Null se a IA não está configurada. */
export function modelsInUse(ai: AISettings): ModelsInUse | null {
  if (!isAIConfigured(ai)) return null;
  const provider = PROVIDER_NAMES[ai.provider];
  const custom = ai.model.trim();
  const vision = ai.visionModel?.trim();
  if (ai.provider === 'groq') {
    return {
      provider,
      text: custom || GROQ_DEFAULT_MODEL,
      images: vision || GROQ_VISION_MODEL,
      audio: GROQ_TRANSCRIPTION_MODEL,
    };
  }
  if (ai.provider === 'anthropic') {
    const model = custom || ANTHROPIC_DEFAULT_MODEL;
    return { provider, text: model, images: model, audio: null };
  }
  return { provider, text: custom, images: vision || custom, audio: OPENAI_TRANSCRIPTION_MODEL };
}
