import type { BackupFile } from '../data/backup';

export interface CloudSnapshot {
  payload: BackupFile;
  version: number;
}

/**
 * Onde os dados ficam guardados fora do navegador. O motor de sincronização só
 * conhece esta interface; o Supabase é uma implementação dela.
 */
export interface CloudStore {
  /** Dados do usuário na nuvem, ou null se ele ainda não gravou nada. */
  load(): Promise<CloudSnapshot | null>;
  /**
   * Grava apenas se a nuvem ainda estiver em `expectedVersion` (0 = ainda não existe).
   * Devolve a nova versão, ou null se outro navegador gravou antes.
   */
  save(payload: BackupFile, expectedVersion: number): Promise<number | null>;
}

export class CloudError extends Error {
  override readonly name = 'CloudError';
}
