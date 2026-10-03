import {
  AIError,
  type AIProvider,
  type AIRequest,
  type ImageInput,
  OPENAI_TRANSCRIPTION_MODEL,
} from './AIProvider';

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
}

interface TranscriptionResponse {
  text?: string;
  error?: { message?: string };
}

type ChatContent = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];

export interface OpenAICompatibleOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  id?: string;
  transcriptionModel?: string;
  /** Modelo que aceita imagens. Sem ele, usa o modelo principal. */
  visionModel?: string;
}

/**
 * Qualquer serviço que fale o formato da OpenAI (/chat/completions e
 * /audio/transcriptions): OpenAI, Groq, Google (endpoint compatível), Ollama e
 * LM Studio. A chave é opcional para servidores locais.
 */
export function createOpenAICompatibleProvider(options: OpenAICompatibleOptions): AIProvider {
  const { model, apiKey } = options;
  const base = options.baseUrl.trim().replace(/\/+$/, '');
  const auth: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  async function chat(chatModel: string, messages: { role: string; content: ChatContent }[]): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ model: chatModel, messages }),
      });
    } catch {
      throw new AIError('Sem conexão com a IA. Seu estudo continua funcionando offline.');
    }

    const body = (await response.json().catch(() => null)) as ChatResponse | null;
    if (!response.ok) {
      if (response.status === 401) throw new AIError('Chave de API inválida. Confira em Ajustes.');
      if (response.status === 429) throw new AIError('Limite de uso atingido. Tente de novo em instantes.');
      throw new AIError(
        `A IA devolveu um erro (${response.status}) com o modelo "${chatModel}": ${body?.error?.message ?? 'sem detalhes'}`,
      );
    }
    const text = body?.choices?.[0]?.message?.content;
    if (!text) throw new AIError('A IA respondeu sem texto.');
    return text;
  }

  return {
    id: options.id ?? 'openai-compatible',
    model,

    complete({ system, user }: AIRequest): Promise<string> {
      return chat(model, [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);
    },

    readImages(prompt: string, images: ImageInput[]): Promise<string> {
      return chat(options.visionModel?.trim() || model, [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...images.map((image) => ({
              type: 'image_url' as const,
              image_url: { url: `data:${image.mediaType};base64,${image.base64}` },
            })),
          ],
        },
      ]);
    },

    async transcribe(audio: Blob): Promise<string> {
      const extension = audio.type.includes('mp4') ? 'mp4' : audio.type.includes('ogg') ? 'ogg' : 'webm';
      const form = new FormData();
      form.append('file', audio, `retell.${extension}`);
      form.append('model', options.transcriptionModel ?? OPENAI_TRANSCRIPTION_MODEL);
      form.append('language', 'en');
      form.append('response_format', 'json');

      let response: Response;
      try {
        // Sem Content-Type manual: o navegador define o multipart com o boundary certo.
        response = await fetch(`${base}/audio/transcriptions`, { method: 'POST', headers: auth, body: form });
      } catch {
        throw new AIError('Sem conexão com a IA. A fala foi registrada, mas não transcrita.');
      }
      const body = (await response.json().catch(() => null)) as TranscriptionResponse | null;
      if (!response.ok) {
        if (response.status === 401) throw new AIError('Chave de API inválida. Confira em Ajustes.');
        throw new AIError(
          `A transcrição falhou (${response.status}): ${body?.error?.message ?? 'sem detalhes'}`,
        );
      }
      return body?.text?.trim() ?? '';
    },
  };
}
