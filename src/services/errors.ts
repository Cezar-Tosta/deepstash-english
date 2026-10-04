/** Erro de regra de negócio com mensagem pronta para mostrar ao usuário. */
export class DomainError extends Error {
  override readonly name: string = 'DomainError';
}

export class ChunkLimitError extends DomainError {
  override readonly name = 'ChunkLimitError';
  constructor() {
    super('Você já selecionou três expressões hoje. Escolha quais realmente merecem entrar na revisão.');
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  if (error instanceof Error && error.name === 'QuotaExceededError') {
    return 'O armazenamento do aparelho está cheio. Libere espaço e tente de novo.';
  }
  if (error instanceof Error) return `Não foi possível salvar: ${error.message}`;
  return 'Ocorreu um erro inesperado.';
}
