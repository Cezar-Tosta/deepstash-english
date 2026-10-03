/** Uma imagem (screenshot de card) já codificada para envio. */
export interface ImageInput {
  mediaType: string;
  base64: string;
}

/** Um turno de conversa. O primeiro da lista é sempre do usuário. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

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
  /** Continua uma conversa: recebe o histórico e devolve a próxima resposta. */
  chat(system: string, turns: ChatTurn[]): Promise<string>;
  /** Transcreve uma gravação em inglês. Só existe nos provedores que oferecem esse serviço. */
  transcribe?(audio: Blob): Promise<string>;
  /** Responde ao pedido olhando as imagens. Só existe nos provedores com modelo de visão. */
  readImages?(prompt: string, images: ImageInput[]): Promise<string>;
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
/** Modelo da Groq que aceita imagens. A Groq troca de modelos com frequência; é editável em Ajustes. */
export const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
