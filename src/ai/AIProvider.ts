export interface AIRequest {
  system: string;
  user: string;
}

/**
 * Contrato único de IA. A lógica de estudo só conhece esta interface; cada serviço
 * (Anthropic, OpenAI, Groq, Google, Ollama, LM Studio...) é uma implementação.
 */
export interface AIProvider {
  readonly id: string;
  readonly model: string;
  /** Devolve o texto da resposta ou lança AIError com mensagem pronta para a tela. */
  complete(request: AIRequest): Promise<string>;
  /** Transcreve uma gravação em inglês. Só existe nos provedores que oferecem esse serviço. */
  transcribe?(audio: Blob): Promise<string>;
}

export class AIError extends Error {
  override readonly name = 'AIError';
}

/** Modelo usado quando o usuário não informa outro em Ajustes. */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
/** A Groq troca de modelos com frequência; o usuário pode informar outro em Ajustes. */
export const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
export const GROQ_TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';
export const OPENAI_TRANSCRIPTION_MODEL = 'whisper-1';
