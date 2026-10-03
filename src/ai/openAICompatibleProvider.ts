import { AIError, type AIProvider, type AIRequest } from './AIProvider';

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
}

/**
 * Qualquer serviço que fale o formato /chat/completions: OpenAI, Groq, Google
 * (endpoint compatível), Ollama e LM Studio. A chave é opcional para servidores locais.
 */
export function createOpenAICompatibleProvider(
  baseUrl: string,
  model: string,
  apiKey: string,
  id = 'openai-compatible',
): AIProvider {
  const url = `${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`;

  return {
    id,
    model,

    async complete({ system, user }: AIRequest): Promise<string> {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
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
  };
}
