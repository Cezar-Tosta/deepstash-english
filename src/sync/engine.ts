import type { BackupFile } from '../data/backup';
import type { CloudStore } from './cloudStore';

/** O que este navegador sabe sobre a última sincronização. */
export interface SyncMeta {
  userId: string;
  /** Versão da nuvem que este navegador leu ou gravou por último. */
  version: number;
  /** Impressão digital dos dados locais naquele momento. */
  fingerprint: string;
}

export interface LocalAdapter {
  export(): Promise<BackupFile>;
  restore(payload: BackupFile): Promise<void>;
  isEmpty(): Promise<boolean>;
}

export interface MetaStore {
  get(): SyncMeta | null;
  set(meta: SyncMeta | null): void;
}

/**
 * - `synced`: navegador e nuvem iguais.
 * - `choose`: os dois lados têm dados diferentes e só o usuário pode dizer qual vale.
 */
export type SyncOutcome = 'synced' | 'choose';

/** Hash curto e estável do conteúdo (cyrb53). Basta para detectar "mudou ou não". */
export function fingerprint(payload: BackupFile): string {
  const text = JSON.stringify([payload.settings, payload.data]);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Mantém o banco do navegador e a nuvem iguais.
 *
 * O navegador continua sendo onde o app lê e grava (rápido, funciona sem rede); a
 * nuvem guarda uma cópia versionada. Nunca se descarta um lado em silêncio: quando
 * os dois mudaram, o resultado é `choose`.
 */
export class SyncEngine {
  constructor(
    private readonly userId: string,
    private readonly cloud: CloudStore,
    private readonly local: LocalAdapter,
    private readonly meta: MetaStore,
  ) {}

  /** Compara os dois lados e faz o que for seguro: enviar, baixar ou pedir a decisão. */
  async reconcile(): Promise<SyncOutcome> {
    const remote = await this.cloud.load();
    const mine = await this.local.export();
    const localPrint = fingerprint(mine);
    const known = this.knownMeta();

    if (!remote) {
      if (await this.local.isEmpty()) return 'synced';
      return this.push(mine, 0);
    }

    if (known) {
      const localChanged = localPrint !== known.fingerprint;
      const remoteChanged = remote.version !== known.version;
      if (!remoteChanged) return localChanged ? this.push(mine, remote.version) : 'synced';
      if (!localChanged) return this.pull(remote.payload, remote.version);
      return 'choose';
    }

    // Primeira vez deste usuário neste navegador.
    if (await this.local.isEmpty()) return this.pull(remote.payload, remote.version);
    if (fingerprint(remote.payload) === localPrint) {
      this.meta.set({ userId: this.userId, version: remote.version, fingerprint: localPrint });
      return 'synced';
    }
    return 'choose';
  }

  /** Envia as mudanças locais, se houver. Chamado pouco depois de cada alteração. */
  async pushIfChanged(): Promise<SyncOutcome> {
    const known = this.knownMeta();
    if (!known) return this.reconcile();
    const mine = await this.local.export();
    if (fingerprint(mine) === known.fingerprint) return 'synced';
    return this.push(mine, known.version);
  }

  /** O usuário decidiu qual lado vale depois de um `choose`. */
  async resolve(keep: 'cloud' | 'local'): Promise<SyncOutcome> {
    const remote = await this.cloud.load();
    if (keep === 'cloud') {
      if (!remote) return 'synced';
      return this.pull(remote.payload, remote.version);
    }
    return this.push(await this.local.export(), remote?.version ?? 0);
  }

  private knownMeta(): SyncMeta | null {
    const meta = this.meta.get();
    return meta?.userId === this.userId ? meta : null;
  }

  private async push(payload: BackupFile, expectedVersion: number): Promise<SyncOutcome> {
    const version = await this.cloud.save(payload, expectedVersion);
    // Outro navegador gravou no meio do caminho: não sobrescreve, pede a decisão.
    if (version === null) return 'choose';
    this.meta.set({ userId: this.userId, version, fingerprint: fingerprint(payload) });
    return 'synced';
  }

  private async pull(payload: BackupFile, version: number): Promise<SyncOutcome> {
    await this.local.restore(payload);
    // A impressão digital é tirada do que ficou no banco, não do que veio da rede.
    const stored = await this.local.export();
    this.meta.set({ userId: this.userId, version, fingerprint: fingerprint(stored) });
    return 'synced';
  }
}
