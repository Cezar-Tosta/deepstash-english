import { AIError, type AIProvider, type AIRequest, OPENAI_TRANSCRIPTION_MODEL } from './AIProvider';

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
}

interface TranscriptionResponse {
  text?: string;
  error?: { message?: string };
}

/**
 * Qualquer serviço que fale o formato da OpenAI (/chat/completions e
 * /audio/transcriptions): OpenAI, Groq, Google (endpoint compatível), Ollama e
 * LM Studio. A chave é opcional para servidores locais.
 */
export function createOpenAICompatibleProvider(
  baseUrl: string,
  model: string,
  apiKey: string,
  id = 'openai-compatible',
  transcriptionModel = OPENAI_TRANSCRIPTION_MODEL,
): AIProvider {
  const base = baseUrl.trim().replace(/\/+$/, '');
  const auth: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  return {
    id,
    model,

    async complete({ system, user }: AIRequest): Promise<string> {
      let response: Response;
      try {
        response = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        });
      } catch {
        throw new AIError('Sem conexão com a IA. Seu estudo continua funcionando offline.');
      }

      const body = (await response.json().catch(() => null)) as ChatResponse | null;
      if (!response.ok) {
        if (response.status === 401) throw new AIError('Chave de API inválida. Confira em Ajustes.');
        if (response.status === 429) {
          throw new AIError('Limite de uso atingido. Tente de novo em instantes.');
        }
        throw new AIError(
          `A IA devolveu um erro (${response.status}): ${body?.error?.message ?? 'sem detalhes'}`,
        );
      }
      const text = body?.choices?.[0]?.message?.content;
      if (!text) throw new AIError('A IA respondeu sem texto.');
      return text;
    },

    async transcribe(audio: Blob): Promise<string> {
      const extension = audio.type.includes('mp4') ? 'mp4' : audio.type.includes('ogg') ? 'ogg' : 'webm';
      const form = new FormData();
      form.append('file', audio, `retell.${extension}`);
      form.append('model', transcriptionModel);
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
