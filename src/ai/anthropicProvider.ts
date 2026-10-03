import Anthropic from '@anthropic-ai/sdk';
import { AIError, ANTHROPIC_DEFAULT_MODEL, type AIProvider, type AIRequest } from './AIProvider';

// Modelos que aceitam o fallback automático quando um classificador recusa o pedido.
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5']);

export function createAnthropicProvider(apiKey: string, model: string): AIProvider {
  const resolvedModel = model.trim() || ANTHROPIC_DEFAULT_MODEL;
  // O app não tem servidor: a chamada sai do aparelho do usuário, com a chave que ele mesmo salvou.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  return {
    id: 'anthropic',
    model: resolvedModel,

    async complete({ system, user }: AIRequest): Promise<string> {
      try {
        const response = await client.beta.messages.create({
          model: resolvedModel,
          max_tokens: 16000,
          // Corrigir uma frase curta é tarefa simples; esforço baixo responde mais rápido.
          output_config: { effort: 'low' },
          system,
          messages: [{ role: 'user', content: user }],
          ...(FALLBACK_MODELS.has(resolvedModel)
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
        });
        if (response.stop_reason === 'refusal') {
          throw new AIError('O modelo recusou este pedido.');
        }
        const text = response.content
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('');
        if (!text) throw new AIError('A IA respondeu sem texto.');
        return text;
      } catch (error) {
        if (error instanceof AIError) throw error;
        if (error instanceof Anthropic.AuthenticationError) {
          throw new AIError('Chave de API inválida. Confira em Ajustes.');
        }
        if (error instanceof Anthropic.NotFoundError) {
          throw new AIError(`Modelo "${resolvedModel}" não encontrado. Confira em Ajustes.`);
        }
        if (error instanceof Anthropic.RateLimitError) {
          throw new AIError('Limite de uso atingido. Tente de novo em instantes.');
        }
        if (error instanceof Anthropic.APIConnectionError) {
          throw new AIError('Sem conexão com a IA. Seu estudo continua funcionando offline.');
        }
        if (error instanceof Anthropic.APIError) {
          throw new AIError(`A IA devolveu um erro (${error.status ?? '?'}): ${error.message}`);
        }
        throw new AIError('Falha inesperada ao consultar a IA.');
      }
    },
  };
}
