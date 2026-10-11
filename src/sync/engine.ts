import { type BackupFile, hasAI } from '../data/backup';
import type { CloudStore } from './cloudStore';
import { mergePayloads } from './merge';

/** O que este navegador sabe sobre a última sincronização. */
export interface SyncMeta {
  userId: string;
  /** Versão da nuvem que este navegador leu ou gravou por último. */
  version: number;
  /** Impressão digital dos dados locais naquele momento. */
  fingerprint: string;
  /** Este navegador tinha uma IA configurada naquele momento. Sem isso, "sem IA" não é uma remoção. */
  hadAI?: boolean;
}

export interface LocalAdapter {
  export(): Promise<BackupFile>;
  restore(payload: BackupFile): Promise<void>;
  isEmpty(): Promise<boolean>;
  /** Passa a usar a IA da cópia da nuvem, se este navegador não tiver nenhuma. Devolve se mudou algo. */
  adoptAI(remote: BackupFile): Promise<boolean>;
}

export interface MetaStore {
  get(): SyncMeta | null;
  set(meta: SyncMeta | null): void;
}

/** A última versão em que este navegador e a nuvem concordavam: é a base da mesclagem. */
export interface SyncBase {
  userId: string;
  version: number;
  payload: BackupFile;
}

export interface BaseStore {
  get(): Promise<SyncBase | null>;
  set(base: SyncBase | null): Promise<void>;
}

/** Sem base guardada, dois lados alterados voltam a pedir a decisão do usuário. */
const NO_BASE: BaseStore = { get: async () => null, set: async () => undefined };

/** Quantas vezes tentar de novo quando outro navegador grava no meio da mesclagem. */
const MERGE_ATTEMPTS = 3;

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
 * os dois mudaram, as mudanças são mescladas registro por registro a partir da última
 * versão em comum; sem ela, o resultado é `choose`.
 */
export class SyncEngine {
  /** Registros com o mesmo campo alterado dos dois lados na última mesclagem; null se não houve mesclagem. */
  lastConflicts: number | null = null;

  constructor(
    private readonly userId: string,
    private readonly cloud: CloudStore,
    private readonly local: LocalAdapter,
    private readonly meta: MetaStore,
    private readonly base: BaseStore = NO_BASE,
  ) {}

  /** Compara os dois lados e faz o que for seguro: enviar, baixar, mesclar ou pedir a decisão. */
  async reconcile(attempt = 1): Promise<SyncOutcome> {
    this.lastConflicts = null;
    const remote = await this.cloud.load();
    const known = this.knownMeta();
    // Medido antes de adotar a IA da nuvem: um navegador novo continua contando como vazio.
    const empty = await this.local.isEmpty();
    await this.adoptAI(remote?.payload, known);
    const mine = await this.local.export();
    const localPrint = fingerprint(mine);

    if (!remote) {
      if (empty) return 'synced';
      return this.push(mine, 0);
    }

    // Os dois lados já são iguais: só registra, sem enviar nem perguntar.
    if (fingerprint(remote.payload) === localPrint) {
      await this.remember(remote.version, mine);
      return 'synced';
    }

    if (known) {
      const localChanged = localPrint !== known.fingerprint;
      const remoteChanged = remote.version !== known.version;
      if (!remoteChanged) return localChanged ? this.push(mine, remote.version) : 'synced';
      if (!localChanged) return this.pull(remote.payload, remote.version);
      return this.merge(mine, remote.payload, remote.version, known, attempt);
    }

    // Primeira vez deste usuário neste navegador.
    if (empty) return this.pull(remote.payload, remote.version);
    return 'choose';
  }

  /** Envia as mudanças locais, se houver. Chamado pouco depois de cada alteração. */
  async pushIfChanged(): Promise<SyncOutcome> {
    const known = this.knownMeta();
    if (!known) return this.reconcile();
    const mine = await this.local.export();
    // Sem IA aqui e sem nunca ter tido: antes de enviar, confere se a nuvem tem uma para adotar.
    if (!known.hadAI && !hasAI(mine)) return this.reconcile();
    if (fingerprint(mine) === known.fingerprint) return 'synced';
    const outcome = await this.push(mine, known.version);
    // Outro navegador gravou antes: confere de novo, e a conferência mescla os dois lados.
    return outcome === 'choose' ? this.reconcile() : outcome;
  }

  /** O usuário decidiu qual lado vale depois de um `choose`. */
  async resolve(keep: 'cloud' | 'local'): Promise<SyncOutcome> {
    const remote = await this.cloud.load();
    if (keep === 'cloud') {
      if (!remote) return 'synced';
      return this.pull(remote.payload, remote.version);
    }
    await this.adoptAI(remote?.payload, this.knownMeta());
    return this.push(await this.local.export(), remote?.version ?? 0);
  }

  /**
   * A IA configurada em outro navegador vale para este, que não tem nenhuma. Só não
   * vale quando este navegador tinha uma IA e o usuário a removeu aqui: aí a remoção é
   * que segue para a nuvem.
   */
  private async adoptAI(remote: BackupFile | undefined, known: SyncMeta | null): Promise<void> {
    if (remote && !known?.hadAI) await this.local.adoptAI(remote);
  }

  /**
   * Os dois lados mudaram desde a última versão em comum: junta as mudanças a partir
   * dela, grava o resultado aqui e envia. Sem a base certa, quem decide é o usuário.
   */
  private async merge(mine: BackupFile, remote: BackupFile, remoteVersion: number, known: SyncMeta, attempt: number): Promise<SyncOutcome> {
    const base = await this.base.get();
    if (!base || base.userId !== this.userId || base.version !== known.version) return 'choose';
    const { merged, conflicts } = mergePayloads(base.payload, mine, remote);
    await this.local.restore(merged);
    // O que vai para a nuvem é o que ficou no banco, para a impressão digital bater depois.
    const stored = await this.local.export();
    const version = await this.cloud.save(stored, remoteVersion);
    if (version === null) return attempt < MERGE_ATTEMPTS ? this.reconcile(attempt + 1) : 'choose';
    await this.remember(version, stored);
    this.lastConflicts = conflicts;
    return 'synced';
  }

  private async remember(version: number, local: BackupFile): Promise<void> {
    this.meta.set({ userId: this.userId, version, fingerprint: fingerprint(local), hadAI: hasAI(local) });
    await this.base.set({ userId: this.userId, version, payload: local });
  }

  private knownMeta(): SyncMeta | null {
    const meta = this.meta.get();
    return meta?.userId === this.userId ? meta : null;
  }

  private async push(payload: BackupFile, expectedVersion: number): Promise<SyncOutcome> {
    const version = await this.cloud.save(payload, expectedVersion);
    // Outro navegador gravou no meio do caminho: não sobrescreve, pede a decisão.
    if (version === null) return 'choose';
    await this.remember(version, payload);
    return 'synced';
  }

  private async pull(payload: BackupFile, version: number): Promise<SyncOutcome> {
    await this.local.restore(payload);
    // A impressão digital é tirada do que ficou no banco, não do que veio da rede.
    const stored = await this.local.export();
    await this.remember(version, stored);
    return 'synced';
  }
}
